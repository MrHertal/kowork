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

const suites = [
  ...["docx", "pdf", "xlsx", "pptx", "image"].map((skill) => ({
    name: skill,
    startDirectory: path.join("resources", "skills-builtin", skill, "evals"),
  })),
  {
    name: "skill-creator",
    startDirectory: path.join(
      "resources",
      "skills",
      "skill-creator",
      "scripts",
    ),
  },
];

for (const suite of suites) {
  const result = spawnSync(
    python,
    [
      "-B",
      "-m",
      "unittest",
      "discover",
      "-s",
      suite.startDirectory,
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
      `${suite.name} skill tests failed with exit code ${String(result.status)}`,
    );
  }
}
