// @opencode-ref: opencode/packages/desktop/electron.vite.config.ts

import { defineConfig } from "electron-vite";
import appPlugin from "@kowork/app/vite";
import * as fs from "node:fs/promises";

const channel = (() => {
  const raw = process.env.KOWORK_CHANNEL;
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw;
  return "dev";
})();

const OPENCODE_SERVER_DIST = "../../opencode/packages/opencode/dist/node";

const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`;

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
          banner: `
// -- CommonJS Shims --
import __cjs_mod__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
`,
        },
      },
      externalizeDeps: { include: [nodePtyPkg] },
    },
    plugins: [
      {
        name: "kowork:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg;
        },
      },
      {
        name: "kowork:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:opencode-server")
            return this.resolve(`${OPENCODE_SERVER_DIST}/node.js`);
        },
      },
      {
        name: "kowork:copy-server-assets",
        async writeBundle() {
          for (const l of await fs.readdir(OPENCODE_SERVER_DIST)) {
            if (!l.endsWith(".wasm")) continue;
            await fs.writeFile(
              `./out/main/chunks/${l}`,
              await fs.readFile(`${OPENCODE_SERVER_DIST}/${l}`),
            );
          }
        },
      },
    ],
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
