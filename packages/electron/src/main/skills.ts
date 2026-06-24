import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { app } from "electron";

import { ensureSkillsPath } from "./opencode-config";

const root = path.dirname(fileURLToPath(import.meta.url));

function bundledSkillsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "skills")
    : path.join(root, "../../resources/skills");
}

export function managedSkillsDir(): string {
  return path.join(app.getPath("userData"), "skills");
}

// Resolve id to a path and confirm it stays inside the managed dir, so a
// malicious id (e.g. "../../something") can't redirect copy/delete elsewhere.
function resolveManagedSkill(id: string): string {
  const base = managedSkillsDir();
  const dest = path.join(base, id);
  if (!id || dest !== path.join(base, path.basename(id))) {
    throw new Error(`invalid skill id: ${id}`);
  }
  return dest;
}

export async function installBundledSkill(id: string): Promise<void> {
  const source = path.join(bundledSkillsDir(), id);
  const dest = resolveManagedSkill(id);
  await cp(source, dest, { recursive: true });
  await ensureSkillsPath(managedSkillsDir());
}

export async function uninstallBundledSkill(id: string): Promise<void> {
  await rm(resolveManagedSkill(id), { recursive: true, force: true });
}
