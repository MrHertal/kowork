// @opencode-ref: opencode/packages/desktop/src/renderer/index.tsx

import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ACCEPTED_FILE_EXTENSIONS,
  ACCEPTED_FILE_TYPES,
  App,
  MENU_COMMAND_EVENT,
  ServerConnection,
  type Platform,
  type AsyncStorage,
  initI18nStrategy,
  setupI18n,
} from "@kowork/app";
import type { ServerReadyData } from "../preload/types";
import pkg from "../../package.json";
import { UPDATER_ENABLED } from "./updater";
import {
  getWebviewZoom,
  onWebviewZoomChange,
  resetZoom,
  zoomIn,
  zoomOut,
} from "./webview-zoom";
import "./styles.css";

const root = document.getElementById("root");
if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html?",
  );
}

const deepLinkEvent = "kowork:deep-link";

const emitDeepLinks = (urls: string[]) => {
  if (urls.length === 0) return;
  window.__KOWORK__ ??= {};
  const pending = window.__KOWORK__.deepLinks ?? [];
  window.__KOWORK__.deepLinks = [...pending, ...urls];
  window.dispatchEvent(new CustomEvent(deepLinkEvent, { detail: { urls } }));
};

const listenForDeepLinks = () => {
  const startUrls = window.__KOWORK__?.deepLinks ?? [];
  if (startUrls.length) emitDeepLinks(startUrls);
  return window.api.onDeepLink((urls) => emitDeepLinks(urls));
};

function createStorage() {
  const cache = new Map<string, AsyncStorage>();

  const createStore = (name: string): AsyncStorage => ({
    getItem: (key: string) => window.api.storeGet(name, key),
    setItem: (key: string, value: string) =>
      window.api.storeSet(name, key, value),
    removeItem: (key: string) => window.api.storeDelete(name, key),
    clear: () => window.api.storeClear(name),
    key: async (index: number) => (await window.api.storeKeys(name))[index],
    getLength: () => window.api.storeLength(name),
  });

  return (name = "default.dat") => {
    const cached = cache.get(name);
    if (cached) return cached;
    const store = createStore(name);
    cache.set(name, store);
    return store;
  };
}

function createPlatform(): Platform {
  const os = (() => {
    const ua = navigator.userAgent;
    if (ua.includes("Mac")) return "macos" as const;
    if (ua.includes("Windows")) return "windows" as const;
    if (ua.includes("Linux")) return "linux" as const;
    return undefined;
  })();

  const isWslEnabled = async () => {
    if (os !== "windows") return false;
    return window.api
      .getWslConfig()
      .then((config) => config.enabled)
      .catch(() => false);
  };

  const resolveNativePath = async (path: string) => {
    if (os !== "windows" || !(await isWslEnabled())) return path;
    return window.api.wslPath(path, "windows").catch(() => path);
  };

  const wslHome = async () => {
    if (!(await isWslEnabled())) return undefined;
    return window.api.wslPath("~", "windows").catch(() => undefined);
  };

  const handleWslPicker = async <T extends string | string[]>(
    result: T | null,
  ): Promise<T | null> => {
    if (!result || !(await isWslEnabled())) return result;
    if (Array.isArray(result)) {
      return Promise.all(
        result.map((path) =>
          window.api.wslPath(path, "linux").catch(() => path),
        ),
      ) as any;
    }
    return window.api.wslPath(result, "linux").catch(() => result) as any;
  };

  const storage = createStorage();

  return {
    platform: "desktop",
    os,
    version: pkg.version,

    async openDirectoryPickerDialog(opts) {
      const defaultPath = await (async () => {
        if (!opts?.defaultPath) return wslHome();
        if (!(await isWslEnabled())) return opts.defaultPath;
        return window.api
          .wslPath(opts.defaultPath, "windows")
          .catch(() => opts.defaultPath);
      })();
      const result = await window.api.openDirectoryPicker({
        multiple: opts?.multiple ?? false,
        title: opts?.title ?? "Choose a folder",
        defaultPath,
      });
      return handleWslPicker(result);
    },

    async openFilePickerDialog(opts) {
      const result = await window.api.openFilePicker({
        multiple: opts?.multiple ?? false,
        title: opts?.title ?? "Choose a file",
        accept: opts?.accept ?? ACCEPTED_FILE_TYPES,
        extensions: opts?.extensions ?? ACCEPTED_FILE_EXTENSIONS,
      });
      return handleWslPicker(result);
    },

    async getPathForFile(file) {
      const result = window.api.getPathForFile(file);
      if (!result) return null;
      if (!(await isWslEnabled())) return result;
      return window.api.wslPath(result, "linux").catch(() => null);
    },

    async saveFilePickerDialog(opts) {
      const result = await window.api.saveFilePicker({
        title: opts?.title ?? "Save file",
        defaultPath: opts?.defaultPath,
      });
      return handleWslPicker(result);
    },

    openLink(url: string) {
      window.api.openLink(url);
    },

    async openPath(path: string, app?: string) {
      if (os === "windows") {
        const resolvedApp = app
          ? await window.api.resolveAppPath(app).catch(() => null)
          : null;
        const resolvedPath = await resolveNativePath(path);
        return window.api.openPath(resolvedPath, resolvedApp ?? undefined);
      }
      return window.api.openPath(path, app);
    },

    async showItemInFolder(path: string) {
      return window.api.showItemInFolder(await resolveNativePath(path));
    },

    back() {
      window.history.back();
    },

    forward() {
      window.history.forward();
    },

    storage,

    checkUpdate: async () => {
      if (!UPDATER_ENABLED()) return { updateAvailable: false };
      return window.api.checkUpdate();
    },

    update: async () => {
      if (!UPDATER_ENABLED()) return;
      await window.api.installUpdate();
    },

    restart: async () => {
      await window.api.killSidecar().catch(() => undefined);
      window.api.relaunch();
    },

    notify: async (title, description, href) => {
      if (!("Notification" in window)) return;

      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission().catch(() => "denied")
          : Notification.permission;
      if (permission !== "granted") return;

      const focused = await window.api
        .getWindowFocused()
        .catch(() => document.hasFocus());
      if (focused) return;

      const notification = new Notification(title, {
        body: description ?? "",
      });
      notification.onclick = () => {
        void window.api.showWindow();
        void window.api.setWindowFocus();
        notification.close();
      };
    },

    fetch: (input, init) => {
      if (input instanceof Request) return fetch(input);
      return fetch(input, init);
    },

    getWslEnabled: async () => {
      const next = await window.api.getWslConfig().catch(() => null);
      if (next) return next.enabled;
      return window.__KOWORK__?.wsl ?? false;
    },

    setWslEnabled: async (enabled) => {
      await window.api.setWslConfig({ enabled });
    },

    getDefaultServer: async () => {
      const url = await window.api.getDefaultServerUrl().catch(() => null);
      if (!url) return null;
      return ServerConnection.Key.make(url);
    },

    setDefaultServer: async (url) => {
      await window.api.setDefaultServerUrl(url);
    },

    getDisplayBackend: async () => {
      return window.api.getDisplayBackend().catch(() => null);
    },

    setDisplayBackend: async (backend) => {
      await window.api.setDisplayBackend(backend);
    },

    parseMarkdown: (markdown: string) =>
      window.api.parseMarkdownCommand(markdown),

    checkAppExists: async (appName: string) => {
      return window.api.checkAppExists(appName);
    },

    async readClipboardImage() {
      const image = await window.api.readClipboardImage().catch(() => null);
      if (!image) return null;
      const blob = new Blob([image.buffer], { type: "image/png" });
      return new File([blob], `pasted-image-${Date.now()}.png`, {
        type: "image/png",
      });
    },

    opencodeConfigRead: () => window.api.opencodeConfigRead(),
    opencodeConfigPatch: (pointer, value) =>
      window.api.opencodeConfigPatch(pointer, value),
    managedSkillsDir: () => window.api.managedSkillsDir(),
    installBundledSkill: (id) => window.api.installBundledSkill(id),
    uninstallBundledSkill: (id) => window.api.uninstallBundledSkill(id),
  };
}

window.api.onMenuCommand((id) => {
  if (id === "view.zoomIn") return zoomIn();
  if (id === "view.zoomOut") return zoomOut();
  if (id === "view.zoomReset") return resetZoom();
  window.dispatchEvent(new CustomEvent(MENU_COMMAND_EVENT, { detail: id }));
});
listenForDeepLinks();

function ElectronApp() {
  const platform = useMemo(() => createPlatform(), []);
  const [zoom, setZoom] = useState(getWebviewZoom());

  useEffect(() => onWebviewZoomChange(setZoom), []);

  const [sidecar, setSidecar] = useState<ServerReadyData | null>(null);
  const [defaultServer, setDefaultServer] =
    useState<ServerConnection.Key | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      window.api.awaitInitialization(),
      platform.getDefaultServer?.().catch(() => null),
    ]).then(([serverData, savedDefault]) => {
      if (cancelled) return;
      setSidecar(serverData);
      setDefaultServer(savedDefault ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [platform]);

  const servers = useMemo((): ServerConnection.Any[] => {
    if (!sidecar) return [];
    const server: ServerConnection.Sidecar = {
      displayName: "Local Server",
      type: "sidecar",
      variant: "base",
      http: {
        url: sidecar.url,
        username: sidecar.username ?? undefined,
        password: sidecar.password ?? undefined,
      },
    };
    return [server];
  }, [sidecar]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest(
        "a.external-link",
      ) as HTMLAnchorElement | null;
      if (link?.href) {
        e.preventDefault();
        platform.openLink(link.href);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [platform]);

  const platformWithZoom = useMemo<Platform>(
    () => ({ ...platform, webviewZoom: zoom }),
    [platform, zoom],
  );

  if (loading) return null;

  return (
    <App
      platform={platformWithZoom}
      memoryHistory
      defaultServer={defaultServer ?? ServerConnection.Key.make("sidecar")}
      disableHealthCheck
      servers={servers}
    />
  );
}

async function boot() {
  const storage = createStorage()("kowork.global.dat");
  await setupI18n(storage);
  initI18nStrategy(storage);

  createRoot(root!).render(<ElectronApp />);
}

void boot();
