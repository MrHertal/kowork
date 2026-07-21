import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { app } from "electron";
import { applyEdits, modify, parse } from "jsonc-parser";

import { getSidecarConfigPath } from "./sidecar-storage";

function getConfigPath(): string {
  const dir = getSidecarConfigPath(app.getPath("userData"));
  const jsonc = path.join(dir, "opencode.jsonc");
  const json = path.join(dir, "opencode.json");
  if (existsSync(jsonc)) return jsonc;
  if (existsSync(json)) return json;
  return jsonc;
}

async function readSource(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return "{\n}\n";
    }
    throw err;
  }
}

export async function readConfig(): Promise<unknown> {
  const file = getConfigPath();
  const source = await readSource(file);
  return parse(source);
}

export async function patchConfig(
  pointer: ReadonlyArray<string | number>,
  value: unknown,
): Promise<void> {
  const file = getConfigPath();
  const source = await readSource(file);
  const edits = modify(source, [...pointer], value, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
  });
  const next = applyEdits(source, edits);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, next, "utf8");
}

function readPaths(config: unknown): string[] {
  const skills =
    config && typeof config === "object"
      ? (config as { skills?: unknown }).skills
      : undefined;
  const paths =
    skills && typeof skills === "object"
      ? (skills as { paths?: unknown }).paths
      : undefined;
  return Array.isArray(paths)
    ? paths.filter((p): p is string => typeof p === "string")
    : [];
}

const permissionActions = new Set(["allow", "ask", "deny"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPermissionAction(value: unknown): value is string {
  return typeof value === "string" && permissionActions.has(value);
}

export async function ensureSkillDenied(name: string): Promise<void> {
  const config = await readConfig();
  const permission = isRecord(config) ? config.permission : undefined;
  if (permission === "deny") return;

  if (isPermissionAction(permission)) {
    await patchConfig(["permission"], {
      "*": permission,
      skill: { [name]: "deny" },
    });
    return;
  }
  if (permission !== undefined && !isRecord(permission)) {
    throw new Error("invalid permission configuration");
  }

  const skill = permission?.skill;
  if (skill !== undefined && !isPermissionAction(skill) && !isRecord(skill)) {
    throw new Error("invalid skill permission configuration");
  }
  const skillLast = Object.keys(permission ?? {}).at(-1) === "skill";
  if (
    skillLast &&
    (skill === "deny" ||
      (isRecord(skill) &&
        skill[name] === "deny" &&
        Object.keys(skill).at(-1) === name))
  ) {
    return;
  }

  if (!skillLast) {
    const nextSkill =
      skill === "deny"
        ? skill
        : isRecord(skill)
          ? {
              ...Object.fromEntries(
                Object.entries(skill).filter(([key]) => key !== name),
              ),
              [name]: "deny",
            }
          : {
              ...(isPermissionAction(skill) ? { "*": skill } : {}),
              [name]: "deny",
            };
    if (skill !== undefined) {
      await patchConfig(["permission", "skill"], undefined);
    }
    await patchConfig(["permission", "skill"], nextSkill);
    return;
  }

  if (isRecord(skill)) {
    if (Object.hasOwn(skill, name)) {
      await patchConfig(["permission", "skill", name], undefined);
    }
    await patchConfig(["permission", "skill", name], "deny");
    return;
  }

  await patchConfig(["permission", "skill"], {
    ...(isPermissionAction(skill) ? { "*": skill } : {}),
    [name]: "deny",
  });
}

export async function ensureSkillsPath(dir: string): Promise<void> {
  const paths = readPaths(await readConfig());
  if (paths.includes(dir)) return;
  await patchConfig(["skills", "paths"], [...paths, dir]);
}

// Register an always-on skills directory whose absolute path lives inside the
// app bundle, so it changes when the app moves or updates. We can't just append
// like ensureSkillsPath, or a moved/updated install would leave a dead path
// behind. Self-heal instead: drop any prior entry that shares this dir's
// basename (our marker, e.g. "skills-builtin") and re-add the current one. User
// folders never share that basename, so they're left untouched.
export async function registerBuiltinSkillsPath(dir: string): Promise<void> {
  const marker = path.basename(dir);
  const paths = readPaths(await readConfig());
  const hasStale = paths.some((p) => p !== dir && path.basename(p) === marker);
  if (paths.includes(dir) && !hasStale) return;
  const next = [...paths.filter((p) => path.basename(p) !== marker), dir];
  await patchConfig(["skills", "paths"], next);
}
