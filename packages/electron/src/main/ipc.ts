// @opencode-ref: opencode/packages/desktop/src/main/ipc.ts

import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import {
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

import type {
  ServerReadyData,
  ThemeSource,
  TitlebarTheme,
  WslConfig,
} from "../preload/types";
import { getStore } from "./store";
import { setTitlebar } from "./windows";

const pickerFilters = (ext?: string[]) => {
  if (!ext || ext.length === 0) return undefined;
  return [{ name: "Files", extensions: ext }];
};

type ConfigPointer = ReadonlyArray<string | number>;

type Deps = {
  killSidecar: () => void;
  relaunch: () => void;
  awaitInitialization: () => Promise<ServerReadyData>;
  getDefaultServerUrl: () => Promise<string | null> | string | null;
  setDefaultServerUrl: (url: string | null) => Promise<void> | void;
  getWslConfig: () => Promise<WslConfig>;
  setWslConfig: (config: WslConfig) => Promise<void> | void;
  getDisplayBackend: () => Promise<string | null>;
  setDisplayBackend: (backend: string | null) => Promise<void> | void;
  parseMarkdown: (markdown: string) => Promise<string> | string;
  checkAppExists: (appName: string) => Promise<boolean> | boolean;
  wslPath: (
    path: string,
    mode: "windows" | "linux" | null,
    distro?: string,
  ) => Promise<string>;
  resolveAppPath: (appName: string) => Promise<string | null>;
  checkUpdate: () => Promise<{ updateAvailable: boolean; version?: string }>;
  installUpdate: () => Promise<void> | void;
  setBackgroundColor: (color: string) => void;
  opencodeConfigRead: () => Promise<unknown>;
  opencodeConfigPatch: (
    pointer: ConfigPointer,
    value: unknown,
  ) => Promise<void>;
  managedSkillsDir: () => string;
  installBundledSkill: (id: string) => Promise<void>;
  uninstallBundledSkill: (id: string) => Promise<void>;
};

export function registerIpcHandlers(deps: Deps) {
  ipcMain.handle("kill-sidecar", () => deps.killSidecar());
  ipcMain.handle("await-initialization", () => deps.awaitInitialization());
  ipcMain.handle("get-default-server-url", () => deps.getDefaultServerUrl());
  ipcMain.handle(
    "set-default-server-url",
    (_event: IpcMainInvokeEvent, url: string | null) =>
      deps.setDefaultServerUrl(url),
  );
  ipcMain.handle("get-wsl-config", () => deps.getWslConfig());
  ipcMain.handle(
    "set-wsl-config",
    (_event: IpcMainInvokeEvent, config: WslConfig) =>
      deps.setWslConfig(config),
  );
  ipcMain.handle("get-display-backend", () => deps.getDisplayBackend());
  ipcMain.handle(
    "set-display-backend",
    (_event: IpcMainInvokeEvent, backend: string | null) =>
      deps.setDisplayBackend(backend),
  );
  ipcMain.handle(
    "parse-markdown",
    (_event: IpcMainInvokeEvent, markdown: string) =>
      deps.parseMarkdown(markdown),
  );
  ipcMain.handle(
    "check-app-exists",
    (_event: IpcMainInvokeEvent, appName: string) =>
      deps.checkAppExists(appName),
  );
  ipcMain.handle(
    "wsl-path",
    (
      _event: IpcMainInvokeEvent,
      path: string,
      mode: "windows" | "linux" | null,
      distro?: string,
    ) => deps.wslPath(path, mode, distro),
  );
  ipcMain.handle(
    "resolve-app-path",
    (_event: IpcMainInvokeEvent, appName: string) =>
      deps.resolveAppPath(appName),
  );
  ipcMain.handle("check-update", () => deps.checkUpdate());
  ipcMain.handle("install-update", () => deps.installUpdate());
  ipcMain.handle(
    "set-background-color",
    (_event: IpcMainInvokeEvent, color: string) =>
      deps.setBackgroundColor(color),
  );
  ipcMain.handle("opencode-config-read", () => deps.opencodeConfigRead());
  ipcMain.handle(
    "opencode-config-patch",
    (_event: IpcMainInvokeEvent, pointer: ConfigPointer, value: unknown) =>
      deps.opencodeConfigPatch(pointer, value),
  );
  ipcMain.handle("managed-skills-dir", () => deps.managedSkillsDir());
  ipcMain.handle(
    "install-bundled-skill",
    (_event: IpcMainInvokeEvent, id: string) => deps.installBundledSkill(id),
  );
  ipcMain.handle(
    "uninstall-bundled-skill",
    (_event: IpcMainInvokeEvent, id: string) => deps.uninstallBundledSkill(id),
  );
  ipcMain.handle(
    "store-get",
    (_event: IpcMainInvokeEvent, name: string, key: string) => {
      const store = getStore(name);
      const value = store.get(key);
      if (value === undefined || value === null) return null;
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  );
  ipcMain.handle(
    "store-set",
    (_event: IpcMainInvokeEvent, name: string, key: string, value: string) => {
      getStore(name).set(key, value);
    },
  );
  ipcMain.handle(
    "store-delete",
    (_event: IpcMainInvokeEvent, name: string, key: string) => {
      getStore(name).delete(key);
    },
  );
  ipcMain.handle("store-clear", (_event: IpcMainInvokeEvent, name: string) => {
    getStore(name).clear();
  });
  ipcMain.handle("store-keys", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name);
    return Object.keys(store.store);
  });
  ipcMain.handle("store-length", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name);
    return Object.keys(store.store).length;
  });

  ipcMain.handle(
    "open-directory-picker",
    async (
      _event: IpcMainInvokeEvent,
      opts?: { multiple?: boolean; title?: string; defaultPath?: string },
    ) => {
      const result = await dialog.showOpenDialog({
        properties: [
          "openDirectory",
          ...(opts?.multiple ? ["multiSelections" as const] : []),
          "createDirectory",
        ],
        title: opts?.title ?? "Choose a folder",
        defaultPath: opts?.defaultPath,
      });
      if (result.canceled) return null;
      return opts?.multiple ? result.filePaths : result.filePaths[0];
    },
  );

  ipcMain.handle(
    "open-file-picker",
    async (
      _event: IpcMainInvokeEvent,
      opts?: {
        multiple?: boolean;
        title?: string;
        defaultPath?: string;
        accept?: string[];
        extensions?: string[];
      },
    ) => {
      const result = await dialog.showOpenDialog({
        properties: [
          "openFile",
          ...(opts?.multiple ? ["multiSelections" as const] : []),
        ],
        title: opts?.title ?? "Choose a file",
        defaultPath: opts?.defaultPath,
        filters: pickerFilters(opts?.extensions),
      });
      if (result.canceled) return null;
      return opts?.multiple ? result.filePaths : result.filePaths[0];
    },
  );

  ipcMain.handle(
    "save-file-picker",
    async (
      _event: IpcMainInvokeEvent,
      opts?: { title?: string; defaultPath?: string },
    ) => {
      const result = await dialog.showSaveDialog({
        title: opts?.title ?? "Save file",
        defaultPath: opts?.defaultPath,
      });
      if (result.canceled) return null;
      return result.filePath ?? null;
    },
  );

  ipcMain.on("open-link", (_event: IpcMainEvent, url: string) => {
    void shell.openExternal(url);
  });

  ipcMain.handle(
    "open-path",
    async (_event: IpcMainInvokeEvent, path: string, app?: string) => {
      if (!app) {
        const error = await shell.openPath(path);
        if (error) throw new Error(error);
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const [cmd, args] =
          process.platform === "darwin"
            ? (["open", ["-a", app, path]] as const)
            : ([app, [path]] as const);
        execFile(cmd, args, (err) => (err ? reject(err) : resolve()));
      });
    },
  );

  ipcMain.handle(
    "show-item-in-folder",
    async (_event: IpcMainInvokeEvent, path: string) => {
      await lstat(path);
      shell.showItemInFolder(path);
    },
  );

  ipcMain.handle("read-clipboard-image", () => {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;
    const buffer = image.toPNG().buffer;
    const size = image.getSize();
    return { buffer, width: size.width, height: size.height };
  });

  ipcMain.handle("get-window-focused", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isFocused() ?? false;
  });

  ipcMain.handle("set-window-focus", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.focus();
  });

  ipcMain.handle("show-window", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.show();
  });

  ipcMain.on("relaunch", () => deps.relaunch());

  ipcMain.handle("get-zoom-factor", (event: IpcMainInvokeEvent) =>
    event.sender.getZoomFactor(),
  );
  ipcMain.handle(
    "set-zoom-factor",
    (event: IpcMainInvokeEvent, factor: number) =>
      event.sender.setZoomFactor(factor),
  );
  ipcMain.handle(
    "set-titlebar",
    (event: IpcMainInvokeEvent, theme: TitlebarTheme) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return;
      setTitlebar(win, theme);
    },
  );
  ipcMain.handle(
    "set-theme-source",
    (_event: IpcMainInvokeEvent, source: ThemeSource) => {
      if (source !== "light" && source !== "dark" && source !== "system")
        return;
      nativeTheme.themeSource = source;
    },
  );
}

export function sendMenuCommand(win: BrowserWindow, id: string) {
  win.webContents.send("menu-command", id);
}

export function sendDeepLinks(win: BrowserWindow, urls: string[]) {
  win.webContents.send("deep-link", urls);
}
