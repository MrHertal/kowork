import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import type { Platform } from "./contexts/platform";
import { ServerConnection } from "./contexts/server";
import { initI18nStrategy, setupI18n } from "./lib/i18n";

const mockPlatform: Platform = {
  platform: "web",
  version: "0.0.1",
  openLink: (url) => window.open(url, "_blank"),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  storage: () => ({
    getItem: async (key) => localStorage.getItem(key),
    setItem: async (key, value) => localStorage.setItem(key, value),
    removeItem: async (key) => localStorage.removeItem(key),
    clear: async () => localStorage.clear(),
    key: async (index) => localStorage.key(index) ?? undefined,
    getLength: async () => localStorage.length,
  }),
  restart: async () => window.location.reload(),
  notify: async () => undefined,
  fetch: (input, init) => fetch(input, init),
};

const getCurrentUrl = () => {
  if (import.meta.env.DEV)
    return `http://${import.meta.env.VITE_OPENCODE_SERVER_HOST ?? "localhost"}:${import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096"}`;
  return location.origin;
};

const rootElement = document.getElementById("root")!;

async function boot() {
  if (rootElement.innerHTML) return;

  const storage = mockPlatform.storage?.();
  await setupI18n(storage);
  initI18nStrategy(storage);

  const server: ServerConnection.Http = {
    type: "http",
    http: { url: getCurrentUrl() },
  };

  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <App
        platform={mockPlatform}
        defaultServer={ServerConnection.Key.make(getCurrentUrl())}
        servers={[server]}
      />
    </StrictMode>,
  );
}

void boot();
