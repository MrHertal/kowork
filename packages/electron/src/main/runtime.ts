import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app } from "electron";

const root = path.dirname(fileURLToPath(import.meta.url));

// Mirrors bundledSkillsDir() in skills.ts.
function bundledRuntimeDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "runtime")
    : path.join(root, "../../resources/runtime");
}

export type RuntimePack = {
  dir: string;
  pythonExe: string;
  /** Dir containing the interpreter (python/bin; python on Windows). */
  pythonBinDir: string;
  /** Pack bin/ with the node + npm shims. */
  binDir: string;
  /** Resolved by the agent via NODE_PATH. */
  nodeModules: string;
};

type RuntimeManifest = {
  paths?: { pythonExe?: string; binDir?: string; nodeModules?: string };
};

// null when no pack is present, so callers fall back to the system toolchain.
export function resolveRuntimePack(): RuntimePack | null {
  const dir = bundledRuntimeDir();
  const manifestPath = path.join(dir, "MANIFEST.json");
  if (!existsSync(manifestPath)) return null;

  let manifest: RuntimeManifest;
  try {
    manifest = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as RuntimeManifest;
  } catch {
    return null;
  }

  const rel = manifest.paths;
  if (!rel?.pythonExe || !rel.binDir || !rel.nodeModules) return null;

  const pythonExe = path.join(dir, rel.pythonExe);
  if (!existsSync(pythonExe)) return null;

  return {
    dir,
    pythonExe,
    pythonBinDir: path.dirname(pythonExe),
    binDir: path.join(dir, rel.binDir),
    nodeModules: path.join(dir, rel.nodeModules),
  };
}
