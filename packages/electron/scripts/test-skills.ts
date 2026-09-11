import { spawnSync } from "node:child_process";
import { delimiter } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertRuntimePack } from "../src/main/runtime-pack";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(scriptsDir, "..");
const runtimeDir = path.join(electronDir, "resources", "runtime");
const pack = assertRuntimePack({
  dir: runtimeDir,
  platform: process.platform,
  arch: process.arch,
});
const env = { ...process.env };
const pathKey =
  Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
env[pathKey] = [pack.binDir, env[pathKey]].filter(Boolean).join(delimiter);
const python =
  process.platform === "win32" ? "kowork-python.cmd" : "kowork-python";

for (const skill of ["docx", "pdf", "xlsx", "pptx", "image"]) {
  const result = spawnSync(
    python,
    [
      "-B",
      "-m",
      "unittest",
      "discover",
      "-s",
      path.join("resources", "skills-builtin", skill, "evals"),
      "-p",
      "test_*.py",
    ],
    {
      cwd: electronDir,
      env,
      shell: process.platform === "win32",
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${skill} skill tests failed with exit code ${String(result.status)}`,
    );
  }
}
