import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";

// Bundling the OpenCode server dist exceeds Node's default heap on 8 GB machines.
const HEAP_FLAG = "--max-old-space-size=4096";

// The exports map only exposes package.json; resolve the bin relative to it.
const require = createRequire(import.meta.url);
const pkg = require.resolve("electron-vite/package.json");
const cli = path.join(path.dirname(pkg), "bin", "electron-vite.js");

const options = process.env.NODE_OPTIONS ?? "";
const env = options.includes("--max-old-space-size")
  ? process.env
  : { ...process.env, NODE_OPTIONS: `${options} ${HEAP_FLAG}`.trim() };

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
