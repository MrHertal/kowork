import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const electronRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const opencodeServerDist = path.resolve(
  electronRoot,
  "../../opencode/packages/opencode/dist/node",
);

export const nodePtyPackage = `@lydell/node-pty-${process.platform}-${process.arch}`;

export const nodeBundleBanner = `
// -- CommonJS Shims --
import __cjs_mod__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
`;

export function opencodeServerPlugins(): Plugin[] {
  return [
    {
      name: "kowork:node-pty-narrower",
      enforce: "pre",
      resolveId(source) {
        if (source === "@lydell/node-pty") return nodePtyPackage;
      },
    },
    {
      name: "kowork:virtual-server-module",
      enforce: "pre",
      resolveId(id) {
        if (id === "virtual:opencode-server")
          return this.resolve(path.join(opencodeServerDist, "node.js"));
      },
    },
    {
      name: "kowork:copy-server-assets",
      async writeBundle(options) {
        if (!options.dir) throw new Error("OpenCode build output needs a dir");
        const chunks = path.join(options.dir, "chunks");
        await fs.mkdir(chunks, { recursive: true });
        for (const filename of await fs.readdir(opencodeServerDist)) {
          if (!filename.endsWith(".wasm")) continue;
          await fs.copyFile(
            path.join(opencodeServerDist, filename),
            path.join(chunks, filename),
          );
        }
      },
    },
  ];
}
