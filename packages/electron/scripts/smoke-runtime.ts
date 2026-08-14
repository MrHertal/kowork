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
// Mirror applyRuntimeEnv in src/main/server.ts: only the kowork-* shims go on
// PATH; isolation env is the shims' job, which the probes below exercise.
const env: NodeJS.ProcessEnv = {
  ...process.env,
  KOWORK_PYTHON: pack.pythonExe,
  KOWORK_ELECTRON_BIN: electronBin,
};

const pathKey =
  Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
env[pathKey] = [pack.binDir, env[pathKey]].filter(Boolean).join(delimiter);

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

  writeFileSync(
    path.join(probeDir, "python-no-pip.py"),
    [
      "import importlib.util",
      "assert importlib.util.find_spec('pip') is None, 'pip must not be bundled'",
      'print("[smoke-runtime] pip absent from embedded runtime OK")',
    ].join("\n") + "\n",
  );

  run(`kowork-python${suffix}`, ["python-smoke.py"], probeDir);
  run(`kowork-python${suffix}`, ["python-no-pip.py"], probeDir);
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
