// @opencode-ref: opencode/packages/desktop/src/main/server.ts
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, utilityProcess } from "electron";
import type { Details } from "electron";
import { DEFAULT_SERVER_URL_KEY, WSL_ENABLED_KEY } from "./constants";
import { resolveRuntimePack } from "./runtime";
import { getUserShell, loadShellEnv } from "./shell-env";
import { createSidecarStorageEnv } from "./sidecar-storage";
import { getStore } from "./store";

export type WslConfig = { enabled: boolean };

export type HealthCheck = { wait: Promise<void>; cancel: () => void };

type SidecarMessage =
  | { type: "ready" }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } };

export type SidecarListener = { stop: () => Promise<void> };

const SIDECAR_SERVICE_NAME = "kowork server";
const SIDECAR_START_STALL_TIMEOUT = 60_000;
const SIDECAR_STOP_TIMEOUT = 6_000;
const SIDECAR_KILL_TIMEOUT = 2_000;
const ISOLATED_ENV_KEYS = new Set([
  "OPENCODE_CONFIG",
  "OPENCODE_CONFIG_DIR",
  "OPENCODE_CONFIG_CONTENT",
  "OPENCODE_DB",
  "OPENCODE_PLUGIN_META_FILE",
  "OPENCODE_TEST_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
]);

type SpawnLocalServerOptions = {
  userDataPath: string;
  tempPath: string;
  onStdout?: (message: string) => void;
  onStderr?: (message: string) => void;
  onExit?: (code: number) => void;
};

export function getDefaultServerUrl(): string | null {
  const value = getStore().get(DEFAULT_SERVER_URL_KEY);
  return typeof value === "string" ? value : null;
}

export function setDefaultServerUrl(url: string | null) {
  if (url) {
    getStore().set(DEFAULT_SERVER_URL_KEY, url);
    return;
  }

  getStore().delete(DEFAULT_SERVER_URL_KEY);
}

export function getWslConfig(): WslConfig {
  const value = getStore().get(WSL_ENABLED_KEY);
  return { enabled: typeof value === "boolean" ? value : false };
}

export function setWslConfig(config: WslConfig) {
  getStore().set(WSL_ENABLED_KEY, config.enabled);
}

export function preferAppEnv() {
  const shell = process.platform === "win32" ? null : getUserShell();
  Object.assign(process.env, {
    ...(shell ? loadShellEnv(shell) : null),
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "true",
    OPENCODE_DISABLE_PROJECT_CONFIG: "true",
    OPENCODE_ENABLE_EXA: "true",
    OPENCODE_CLIENT: "desktop",
  });
}

export async function spawnLocalServer(
  hostname: string,
  port: number,
  password: string,
  options: SpawnLocalServerOptions,
) {
  const sidecar = join(dirname(fileURLToPath(import.meta.url)), "sidecar.js");
  const child = utilityProcess.fork(sidecar, [], {
    cwd: process.cwd(),
    env: createSidecarEnv(options.userDataPath, options.tempPath),
    serviceName: SIDECAR_SERVICE_NAME,
    stdio: "pipe",
  });
  let exited = false;
  const exit = defer<number>();

  const onProcessGone = (_event: unknown, details: Details) => {
    if (details.type !== "Utility" || details.name !== SIDECAR_SERVICE_NAME)
      return;
    options.onStderr?.(
      `utility process gone reason=${details.reason} exitCode=${details.exitCode}`,
    );
  };

  app.on("child-process-gone", onProcessGone);
  child.once("exit", (code) => {
    exited = true;
    app.off("child-process-gone", onProcessGone);
    options.onExit?.(code);
    exit.resolve(code);
  });
  child.on("error", (error) =>
    options.onStderr?.(
      `utility process error: ${serializeError(error).message}`,
    ),
  );

  child.stdout?.on("data", (chunk: Buffer) =>
    options.onStdout?.(chunk.toString("utf8").trimEnd()),
  );
  child.stderr?.on("data", (chunk: Buffer) =>
    options.onStderr?.(chunk.toString("utf8").trimEnd()),
  );

  await new Promise<void>((resolve, reject) => {
    let done = false;
    let timeout: NodeJS.Timeout;

    const fail = (error: Error) => {
      if (done) return;
      done = true;
      cleanup();
      reject(error);
    };

    const refreshTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        fail(
          new Error(
            `Sidecar did not become ready within ${SIDECAR_START_STALL_TIMEOUT}ms: ${sidecar}`,
          ),
        );
      }, SIDECAR_START_STALL_TIMEOUT);
    };

    const onMessage = (message: SidecarMessage) => {
      if (message.type === "ready") {
        if (done) return;
        done = true;
        cleanup();
        resolve();
        return;
      }
      if (message.type === "error") {
        fail(
          Object.assign(new Error(message.error.message), {
            stack: message.error.stack,
          }),
        );
      }
    };
    const onExit = (code: number) => {
      fail(new Error(`Sidecar exited before ready with code ${code}`));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("exit", onExit);
    };

    child.on("message", onMessage);
    child.on("exit", onExit);
    refreshTimeout();
    child.postMessage({
      type: "start",
      hostname,
      port,
      password,
    });
  }).catch(async (error) => {
    if (!exited) {
      child.kill();
      // Wait for the killed sidecar to release the port.
      await Promise.race([exit.promise, delay(SIDECAR_KILL_TIMEOUT)]);
    }
    throw error;
  });

  const healthAbort = new AbortController();
  const wait = (async () => {
    const url = `http://${hostname}:${port}`;
    let healthy = false;
    const gone = exit.promise.then((code) => {
      if (healthy || healthAbort.signal.aborted) return;
      // Stop the poll loop before rejecting.
      healthAbort.abort();
      throw new Error(
        `Sidecar exited before health check passed with code ${code}`,
      );
    });

    const ready = async () => {
      while (!healthAbort.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (healthAbort.signal.aborted) return;
        if (await checkHealth(url, password)) {
          healthy = true;
          return;
        }
      }
    };

    await Promise.race([ready(), gone]);
  })();

  let stopping: Promise<void> | undefined;

  return {
    listener: {
      stop: () => {
        if (stopping) return stopping;
        healthAbort.abort();
        if (exited) return Promise.resolve();
        child.postMessage({ type: "stop" });
        stopping = Promise.race([
          exit.promise.then(() => undefined),
          delay(SIDECAR_STOP_TIMEOUT).then(() => {
            if (!exited) child.kill();
          }),
        ]);
        return stopping;
      },
    } satisfies SidecarListener,
    health: { wait, cancel: () => healthAbort.abort() },
  };
}

export async function checkHealth(
  url: string,
  password?: string | null,
): Promise<boolean> {
  let healthUrl: URL;
  try {
    healthUrl = new URL("/global/health", url);
  } catch {
    return false;
  }

  const headers = new Headers();
  if (password) {
    const auth = Buffer.from(`opencode:${password}`).toString("base64");
    headers.set("authorization", `Basic ${auth}`);
  }

  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function createSidecarEnv(
  userDataPath: string,
  tempPath: string,
): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, String(value)]],
    ),
  );
  for (const key of Object.keys(env)) {
    if (ISOLATED_ENV_KEYS.has(key.toUpperCase())) delete env[key];
  }
  Object.assign(env, createSidecarStorageEnv(userDataPath, tempPath));
  delete env.DEBUG;
  if (process.platform === "linux") delete env.LD_PRELOAD;
  applyRuntimeEnv(env);
  return env;
}

// Only the kowork-* shims go on PATH; the embedded python/bin stays off so bare
// python/pip/node/npm belong to the user's own toolchain. The shims carry the
// embedded runtime's isolation env, so nothing PYTHON*/NODE_PATH is set here.
function applyRuntimeEnv(env: Record<string, string>): void {
  const pack = resolveRuntimePack();
  if (!pack) return;

  env.KOWORK_ELECTRON_BIN = process.execPath; // kowork-node runs this as Node

  const pathKey =
    Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  env[pathKey] = [pack.binDir, env[pathKey]].filter(Boolean).join(delimiter);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function serializeError(error: unknown) {
  if (error instanceof Error)
    return { message: error.message, stack: error.stack };
  return { message: String(error) };
}

function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
