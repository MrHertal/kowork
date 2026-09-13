// @opencode-ref: opencode/packages/desktop/electron.vite.config.ts

import { defineConfig } from "electron-vite";
import appPlugin from "@kowork/app/vite";
import {
  nodeBundleBanner,
  nodePtyPackage,
  opencodeServerPlugins,
} from "./scripts/opencode-server-build";

const channel = (() => {
  const raw = process.env.KOWORK_CHANNEL;
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw;
  return "dev";
})();

export default defineConfig({
  main: {
    define: {
      "import.meta.env.KOWORK_CHANNEL": JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        input: { index: "src/main/index.ts", sidecar: "src/main/sidecar.ts" },
        // Keep this identical to electron-vite's Node 20.11+ shim. Its regex insertion can
        // corrupt bundled TypeScript, while a Rollup banner places the shim safely.
        output: {
          banner: nodeBundleBanner,
        },
      },
      externalizeDeps: { include: [nodePtyPackage] },
    },
    plugins: opencodeServerPlugins(),
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
      },
    },
  },
  renderer: {
    plugins: [appPlugin],
    publicDir: "../../../app/public",
    root: "src/renderer",
    define: {
      "import.meta.env.VITE_KOWORK_CHANNEL": JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
        },
      },
    },
  },
});
