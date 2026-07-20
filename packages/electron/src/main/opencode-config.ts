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
