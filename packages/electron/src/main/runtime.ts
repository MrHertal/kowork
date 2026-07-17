import path from "node:path";
import { fileURLToPath } from "node:url";

import { app } from "electron";

import {
  assertRuntimePack,
  validateRuntimePack,
  type RuntimePack,
} from "./runtime-pack";

const root = path.dirname(fileURLToPath(import.meta.url));

// Mirrors bundledSkillsDir() in skills.ts.
function bundledRuntimeDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "runtime")
    : path.join(root, "../../resources/runtime");
}

export type { RuntimePack } from "./runtime-pack";

// null when no pack is present, so callers fall back to the system toolchain.
export function resolveRuntimePack(): RuntimePack | null {
  const dir = bundledRuntimeDir();
  const result = validateRuntimePack({
    dir,
    platform: process.platform,
    arch: process.arch,
  });
  return result.ok ? result.pack : null;
}

export function requireRuntimePack(): RuntimePack {
  return assertRuntimePack({
    dir: bundledRuntimeDir(),
    platform: process.platform,
    arch: process.arch,
  });
}
