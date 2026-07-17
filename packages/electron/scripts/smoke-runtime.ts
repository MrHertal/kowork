import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertRuntimePack } from "../src/main/runtime-pack";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(scriptsDir, "..");
const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const runtimeDir = path.resolve(
  args[0] ?? path.join(electronDir, "resources", "runtime"),
);
const electronBin = path.resolve(args[1] ?? localElectronBin());

if (!existsSync(electronBin)) {
  throw new Error(`Electron executable is missing: ${electronBin}`);
}

const pack = assertRuntimePack({
  dir: runtimeDir,
  platform: process.platform,
  arch: process.arch,
});
const env: NodeJS.ProcessEnv = {
  ...process.env,
  KOWORK_PYTHON: pack.pythonExe,
  KOWORK_ELECTRON_BIN: electronBin,
  NODE_PATH: [pack.nodeModules, process.env.NODE_PATH]
    .filter(Boolean)
    .join(delimiter),
  PYTHONNOUSERSITE: "1",
  PYTHONDONTWRITEBYTECODE: "1",
};
delete env.PYTHONPATH;
delete env.PYTHONHOME;
delete env.VIRTUAL_ENV;
delete env.CONDA_PREFIX;

const pathKey =
  Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
env[pathKey] = [pack.binDir, pack.pythonBinDir, env[pathKey]]
  .filter(Boolean)
  .join(delimiter);

const suffix = process.platform === "win32" ? ".cmd" : "";
const probeDir = mkdtempSync(path.join(tmpdir(), "kowork-runtime-smoke-"));
try {
  writeFileSync(
    path.join(probeDir, "python-smoke.py"),
    [
      "import cryptography, defusedxml, lxml.etree, mammoth",
      "import openpyxl, pdfplumber, pypdf, pypdfium2, reportlab",
      "import PIL, pptx, xlsxwriter",
      'print("[smoke-runtime] Python launcher and imports OK")',
    ].join("\n") + "\n",
  );
  writeFileSync(
    path.join(probeDir, "node-smoke.cjs"),
    [
      'require("docx");',
      'require("pptxgenjs");',
      'console.log("[smoke-runtime] Node launcher and imports OK");',
    ].join("\n") + "\n",
  );

  run(`kowork-python${suffix}`, ["python-smoke.py"], probeDir);
  run(`kowork-node${suffix}`, ["node-smoke.cjs"], probeDir);
} finally {
  rmSync(probeDir, { recursive: true, force: true });
}

console.log(`[smoke-runtime] runtime OK: ${runtimeDir}`);

function localElectronBin(): string {
  const value: unknown = createRequire(import.meta.url)("electron");
  if (typeof value !== "string") {
    throw new Error("Could not resolve the development Electron executable");
  }
  return value;
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status === 0) return;
  throw new Error(
    `Runtime command failed with exit code ${String(result.status)}: ${command}`,
  );
}
