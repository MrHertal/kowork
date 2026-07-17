import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertRuntimePack,
  computeRuntimeSourceFingerprint,
  formatRuntimeValidationIssues,
  validateRuntimePack,
} from "../src/main/runtime-pack";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(scriptsDir, "..");
const runtimeDir = path.join(electronDir, "resources", "runtime");

const options = {
  dir: runtimeDir,
  platform: process.platform,
  arch: process.arch,
  sourceFingerprint: computeRuntimeSourceFingerprint(electronDir),
};
const result = validateRuntimePack(options);

if (result.ok) {
  console.log("[ensure-runtime] runtime pack is current");
} else {
  console.log(
    `[ensure-runtime] ${formatRuntimeValidationIssues(result.issues)}`,
  );
  console.log("[ensure-runtime] rebuilding runtime pack");
  execSync("tsx ./scripts/build-runtime.ts", {
    cwd: electronDir,
    stdio: "inherit",
  });
  assertRuntimePack({
    ...options,
    sourceFingerprint: computeRuntimeSourceFingerprint(electronDir),
  });
  console.log("[ensure-runtime] rebuilt runtime pack is valid");
}
