import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import * as http from "node:http";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import type { Event } from "electron";
import { app, BrowserWindow, dialog } from "electron";

import contextMenu from "electron-context-menu";
contextMenu({
  showSaveImageAs: true,
  showLookUpSelection: false,
  showSearchWithGoogle: false,
});

const defaultDir = join(homedir(), "kowork");

process.env.OPENCODE_DISABLE_EMBEDDED_WEB_UI = "true";

const APP_NAMES: Record<Channel, string> = {
  dev: "Kowork Dev",
  beta: "Kowork Beta",
  prod: "Kowork",
};
const APP_IDS: Record<Channel, string> = {
  dev: "app.kowork.desktop.dev",
  beta: "app.kowork.desktop.beta",
  prod: "app.kowork.desktop",
};
const jsCallStackFeature = "DocumentPolicyIncludeJSCallStacksInCrashReports";
const appId = app.isPackaged ? APP_IDS[CHANNEL] : "app.kowork.desktop.dev";
app.setName(app.isPackaged ? APP_NAMES[CHANNEL] : "Kowork Dev");
app.setAppUserModelId(appId);
app.setPath("userData", join(app.getPath("appData"), appId));

import type { ServerReadyData, WslConfig } from "../preload/types";
import { checkAppExists, resolveAppPath, wslPath } from "./apps";
import { type Channel, CHANNEL, UPDATER_ENABLED } from "./constants";
import { patchConfig, readConfig } from "./opencode-config";
import {
  ensureBuiltinSkillsRegistered,
  installBundledSkill,
  managedSkillsDir,
  uninstallBundledSkill,
} from "./skills";
import { registerIpcHandlers, sendDeepLinks, sendMenuCommand } from "./ipc";
import { initLogging } from "./logging";
import { parseMarkdown } from "./markdown";
import { createMenu } from "./menu";
import { requireRuntimePack } from "./runtime";
import {
  checkForUpdates,
  checkUpdate,
  installUpdate,
  setupAutoUpdater,
} from "./updater";
import {
  getDefaultServerUrl,
  getWslConfig,
  preferAppEnv,
  setDefaultServerUrl,
  setWslConfig,
  spawnLocalServer,
  type SidecarListener,
} from "./server";
import { createMainWindow, setBackgroundColor, setDockIcon } from "./windows";

let mainWindow: BrowserWindow | null = null;
let server: SidecarListener | null = null;

const pendingDeepLinks: string[] = [];

const serverReady = defer<ServerReadyData>();
const logger = initLogging();

logger.log("app starting", {
  version: app.getVersion(),
  packaged: app.isPackaged,
});

setupApp();

function setupApp() {
  try {
    setDefaultCACertificates([
      ...new Set([
        ...getCACertificates("default"),
        ...getCACertificates("system"),
      ]),
    ]);
  } catch (error) {
    logger.warn("failed to load system certificates", error);
  }

  ensureLoopbackNoProxy();
  useEnvProxy();
  app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>");
  const features = app.commandLine.getSwitchValue("enable-features");
  app.commandLine.appendSwitch(
    "enable-features",
    features ? `${jsCallStackFeature},${features}` : jsCallStackFeature,
  );
  if (!app.isPackaged)
    app.commandLine.appendSwitch("remote-debugging-port", "9222");

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  preferAppEnv(app.getPath("userData"));

  app.on("second-instance", (_event: Event, argv: string[]) => {
    const urls = argv.filter((arg: string) => arg.startsWith("kowork://"));
    if (urls.length) {
      logger.log("deep link received via second-instance", { urls });
      emitDeepLinks(urls);
    }
    focusMainWindow();
  });

  app.on("open-url", (event: Event, url: string) => {
    event.preventDefault();
    logger.log("deep link received via open-url", { url });
    emitDeepLinks([url]);
  });

  app.on("before-quit", () => {
    void killSidecar();
  });

  app.on("will-quit", () => {
    void killSidecar();
  });

  app.on("child-process-gone", (_event, details) => {
    logger.error("child process gone", { details });
  });

  app.on("render-process-gone", (_event, webContents, details) => {
    logger.error("render process gone", {
      url: webContents.getURL(),
      details,
    });
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void killSidecar().finally(() => app.exit(0));
    });
  }

  void app.whenReady().then(async () => {
    if (app.isPackaged) {
      try {
        requireRuntimePack();
      } catch (error) {
        const detail = error instanceof Error ? `\n\n${error.message}` : "";
        dialog.showErrorBox(
          "Unable to start Kowork",
          `Kowork's built-in document runtime is missing or invalid. Reinstall Kowork and try again.${detail}`,
        );
        app.exit(1);
        return;
      }
    }

    try {
      mkdirSync(defaultDir, { recursive: true });
      process.chdir(defaultDir);
    } catch (error) {
      const detail = error instanceof Error ? `\n\n${error.message}` : "";
      dialog.showErrorBox(
        "Unable to start Kowork",
        `Kowork could not access its default folder:\n\n${defaultDir}${detail}`,
      );
      app.exit(1);
      return;
    }

    app.setAsDefaultProtocolClient("kowork");
    setDockIcon();
    setupAutoUpdater();
    await initialize();
  });
}

function emitDeepLinks(urls: string[]) {
  if (urls.length === 0) return;
  pendingDeepLinks.push(...urls);
  if (mainWindow) sendDeepLinks(mainWindow, urls);
}

function focusMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

async function initialize() {
  // Register always-on bundled skills before the sidecar starts, so its first
  // config read already sees them.
  await ensureBuiltinSkillsRegistered().catch((error) =>
    logger.warn("failed to register builtin skills", error),
  );

  const port = await getSidecarPort();
  const hostname = "127.0.0.1";
  const url = `http://${hostname}:${port}`;
  const password = randomUUID();

  const loadingTask = (async () => {
    logger.log("spawning sidecar", { url });
    const { listener, health } = await spawnLocalServer(
      hostname,
      port,
      password,
      {
        userDataPath: app.getPath("userData"),
        onStdout: (message) => logger.log("server stdout", { message }),
        onStderr: (message) => logger.warn("server stderr", { message }),
        onExit: (code) => logger.warn("sidecar exited", { code }),
      },
    );
    server = listener;
    serverReady.resolve({
      url,
      username: "opencode",
      password,
    });

    await Promise.race([
      health.wait,
      delay(30_000).then(() => {
        throw new Error("Sidecar health check timed out");
      }),
    ]).catch((error) => {
      logger.error("sidecar health check failed", error);
    });

    logger.log("loading task finished");
  })();

  const globals = {
    updaterEnabled: UPDATER_ENABLED,
    deepLinks: pendingDeepLinks,
  };

  await loadingTask;

  mainWindow = createMainWindow(globals);
  wireMenu();
}

function wireMenu() {
  if (!mainWindow) return;
  createMenu({
    trigger: (id) => mainWindow && sendMenuCommand(mainWindow, id),
    checkForUpdates: () => {
      void checkForUpdates(true, killSidecar);
    },
    reload: () => mainWindow?.reload(),
    relaunch: () => relaunchApp(),
  });
}

registerIpcHandlers({
  killSidecar: () => killSidecar(),
  relaunch: () => relaunchApp(),
  awaitInitialization: async () => {
    logger.log("awaiting server ready");
    const res = await serverReady.promise;
    logger.log("server ready", { url: res.url });
    return res;
  },
  getDefaultServerUrl: () => getDefaultServerUrl(),
  setDefaultServerUrl: (url) => setDefaultServerUrl(url),
  getWslConfig: () => Promise.resolve(getWslConfig()),
  setWslConfig: (config: WslConfig) => setWslConfig(config),
  getDisplayBackend: async () => null,
  setDisplayBackend: async () => undefined,
  parseMarkdown: async (markdown) => parseMarkdown(markdown),
  checkAppExists: async (appName) => checkAppExists(appName),
  wslPath: async (path, mode) => wslPath(path, mode),
  resolveAppPath: async (appName) => resolveAppPath(appName),
  runUpdater: async (alertOnFail) => checkForUpdates(alertOnFail, killSidecar),
  checkUpdate: async () => checkUpdate(),
  installUpdate: async () => installUpdate(killSidecar),
  setBackgroundColor: (color) => setBackgroundColor(color),
  opencodeConfigRead: () => readConfig(),
  opencodeConfigPatch: (pointer, value) => patchConfig(pointer, value),
  managedSkillsDir: () => managedSkillsDir(),
  installBundledSkill: (id) => installBundledSkill(id),
  uninstallBundledSkill: (id) => uninstallBundledSkill(id),
});

async function killSidecar() {
  if (!server) return;
  const current = server;
  server = null;
  await current.stop();
}

function relaunchApp() {
  // We chdir at startup, so a relative app path in argv (".") would resolve
  // against the wrong cwd on relaunch. Rewrite it to the absolute path.
  const args = process.argv
    .slice(1)
    .map((arg) => (arg === "." ? app.getAppPath() : arg));
  void killSidecar().finally(() => {
    app.relaunch({ args });
    app.exit(0);
  });
}

function useEnvProxy() {
  try {
    (
      http as unknown as { setGlobalProxyFromEnv: () => void }
    ).setGlobalProxyFromEnv();
  } catch (error) {
    logger.warn("failed to load proxy environment", error);
  }
}

function ensureLoopbackNoProxy() {
  const loopback = ["127.0.0.1", "localhost", "::1"];
  const upsert = (key: string) => {
    const items = (process.env[key] ?? "")
      .split(",")
      .map((value: string) => value.trim())
      .filter((value: string) => Boolean(value));

    for (const host of loopback) {
      if (items.some((value: string) => value.toLowerCase() === host)) continue;
      items.push(host);
    }

    process.env[key] = items.join(",");
  };

  upsert("NO_PROXY");
  upsert("no_proxy");
}

async function getSidecarPort() {
  const fromEnv = process.env.OPENCODE_PORT;
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || !address) {
        server.close();
        reject(new Error("Failed to get port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
