import { spawn, fork, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createIsolatedSidecarEnv,
  createSidecarStorageEnv,
} from "../packages/electron/src/main/sidecar-storage";
import { evalSystemPrompt } from "./system-prompt";

type SidecarMessage =
  | { type: "ready"; url: string }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } };

const repoRoot = path.resolve(import.meta.dirname, "..");
const electronRoot = path.join(repoRoot, "packages/electron");
const sidecarEntry = path.join(electronRoot, "out/eval-sidecar/sidecar.js");
const promptfooConfig = path.join(repoRoot, "evals/promptfooconfig.ts");
const resultsDir = path.join(repoRoot, "tmp/promptfoo");
const inspector = pathToFileURL(
  path.join(repoRoot, "evals/system-prompt-inspector.mjs"),
).href;

let activeCommand: ChildProcess | undefined;
let activeCommandTermination: Promise<void> | undefined;
let sidecar: ChildProcess | undefined;
let interrupted: NodeJS.Signals | undefined;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    interrupted ??= signal;
    if (activeCommand)
      activeCommandTermination ??= terminateCommandTree(activeCommand, signal);
    sendSidecarStop(sidecar);
  });
}

let exitCode = 1;
let temporaryRoot: string | undefined;

try {
  await runPnpm(["--dir", electronRoot, "run", "build:eval-sidecar"]);

  temporaryRoot = await mkdtemp(path.join(tmpdir(), "kowork-eval-"));
  const userDataPath = path.join(temporaryRoot, "user-data");
  const tempPath = path.join(temporaryRoot, "temp");
  const taskFolder = path.join(temporaryRoot, "folder");
  await Promise.all([
    mkdir(userDataPath, { recursive: true }),
    mkdir(tempPath, { recursive: true }),
    mkdir(taskFolder, { recursive: true }),
    mkdir(resultsDir, { recursive: true }),
  ]);
  throwIfInterrupted();

  const logPath = path.join(resultsDir, "sidecar.log");
  const started = await startSidecar({
    cwd: taskFolder,
    env: {
      ...createIsolatedSidecarEnv(),
      ...createSidecarStorageEnv(userDataPath, tempPath),
      KOWORK_EVAL_EXPECTED_SYSTEM: evalSystemPrompt,
      KOWORK_EVAL_EXPECTED_DIRECTORY: taskFolder,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        plugin: [inspector],
        provider: {
          opencode: {
            options: { setCacheKey: false },
          },
        },
      }),
    },
    logPath,
  });
  sidecar = started.child;
  throwIfInterrupted();

  await waitForHealth(started.url);
  await verifyKoworkSidecar(started.url);
  throwIfInterrupted();

  exitCode = await runPnpm(
    [
      "--dir",
      repoRoot,
      "exec",
      "promptfoo",
      "eval",
      "--config",
      promptfooConfig,
      "--no-cache",
    ],
    {
      KOWORK_EVAL_BASE_URL: started.url,
      PROMPTFOO_CONFIG_DIR: resultsDir,
      PROMPTFOO_DISABLE_TELEMETRY: "1",
    },
    false,
  );
} catch (error) {
  if (!interrupted) console.error(formatError(error));
} finally {
  try {
    await activeCommandTermination;
  } finally {
    try {
      await stopSidecar(sidecar);
    } finally {
      if (temporaryRoot)
        await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

process.exitCode = interrupted
  ? interrupted === "SIGINT"
    ? 130
    : 143
  : exitCode;

async function runPnpm(
  args: string[],
  env: Record<string, string> = {},
  requireSuccess = true,
) {
  throwIfInterrupted();
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("Unable to locate the pnpm executable");

  const cliIsJavaScript = /\.[cm]?js$/i.test(pnpmCli);
  const child = spawn(
    cliIsJavaScript ? process.execPath : pnpmCli,
    cliIsJavaScript ? [pnpmCli, ...args] : args,
    {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      detached: process.platform !== "win32",
      stdio: "inherit",
    },
  );
  activeCommand = child;
  if (interrupted)
    activeCommandTermination ??= terminateCommandTree(child, interrupted);
  const code = await waitForExit(child).finally(() => {
    if (activeCommand === child) activeCommand = undefined;
  });
  if (requireSuccess && code !== 0)
    throw new Error(`pnpm ${args.join(" ")} exited with code ${code}`);
  return code;
}

async function startSidecar({
  cwd,
  env,
  logPath,
}: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  logPath: string;
}) {
  const log = createWriteStream(logPath, { flags: "w" });
  const child = fork(sidecarEntry, [], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  sidecar = child;
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  child.once("exit", () => log.end());
  child.stdout?.on("data", (chunk: Buffer) => {
    const message = chunk.toString("utf8").trim();
    if (message.includes("SYSTEM_DIAGNOSTIC=")) console.log(message);
  });

  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Sidecar did not start within 60 seconds")),
        60_000,
      );
      const cleanup = () => {
        clearTimeout(timeout);
        child.off("message", onMessage);
        child.off("exit", onExit);
        child.off("error", onError);
      };
      const onMessage = (message: SidecarMessage) => {
        if (message.type === "ready") {
          cleanup();
          resolve(message.url);
        }
        if (message.type === "error") {
          cleanup();
          reject(
            Object.assign(new Error(message.error.message), {
              stack: message.error.stack,
            }),
          );
        }
      };
      const onExit = (code: number | null) => {
        cleanup();
        reject(new Error(`Sidecar exited before ready with code ${code}`));
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      child.on("message", onMessage);
      child.on("exit", onExit);
      child.on("error", onError);
    });
    return { child, url };
  } catch (error) {
    console.error(`Sidecar logs: ${logPath}`);
    throw error;
  }
}

async function waitForHealth(baseUrl: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    throwIfInterrupted();
    try {
      const response = await fetch(new URL("/global/health", baseUrl), {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        throwIfInterrupted();
        return;
      }
    } catch {
      throwIfInterrupted();
      // The sidecar may accept connections shortly after announcing its URL.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Sidecar health check timed out after 30 seconds");
}

async function verifyKoworkSidecar(baseUrl: string) {
  const response = await fetch(new URL("/experimental/tool/ids", baseUrl), {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok)
    throw new Error(`Unable to inspect sidecar tools: HTTP ${response.status}`);
  const tools = await response.text();
  if (!tools.includes("present_files"))
    throw new Error(
      "The evaluation server is not Kowork's compiled OpenCode sidecar",
    );
}

async function stopSidecar(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  sendSidecarStop(child);
  const stopped = await waitForExitWithin(child, 6_000);
  if (stopped) return;
  child.kill("SIGKILL");
  await waitForExitWithin(child, 2_000);
}

function sendSidecarStop(child: ChildProcess | undefined) {
  if (!child?.connected || child.exitCode !== null) return;
  child.send({ type: "stop" }, () => {
    // A concurrent child exit can close IPC before the message is delivered.
  });
}

async function terminateCommandTree(
  child: ChildProcess,
  signal: NodeJS.Signals,
) {
  if (child.exitCode !== null || !child.pid) return;

  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
      await waitForExitWithin(child, 5_000);
      return;
    }
    if (await waitForProcessGroupExit(child.pid, 5_000)) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await waitForProcessGroupExit(child.pid, 2_000);
    return;
  }

  const killer = spawn(
    "taskkill.exe",
    ["/pid", String(child.pid), "/t", "/f"],
    { stdio: "ignore", windowsHide: true },
  );
  try {
    const code = await waitForExit(killer);
    if (code !== 0 && child.exitCode === null) child.kill();
  } catch {
    if (child.exitCode === null) child.kill();
  }
}

async function waitForProcessGroupExit(pid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function waitForExitWithin(child: ChildProcess, timeoutMs: number) {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      waitForExit(child).then(
        () => true,
        () => child.exitCode !== null || child.signalCode !== null,
      ),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function waitForExit(child: ChildProcess) {
  return new Promise<number>((resolve, reject) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    if (child.signalCode !== null) {
      resolve(1);
      return;
    }
    const cleanup = () => {
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const onExit = (code: number | null) => {
      cleanup();
      resolve(code ?? 1);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

function formatError(error: unknown) {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

function throwIfInterrupted() {
  if (interrupted) throw new Error(`Interrupted by ${interrupted}`);
}
