import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { applyEdits, modify, parse } from "jsonc-parser";

const CONFIG_DIR = path.join(homedir(), ".config", "kowork");
const JSONC_PATH = path.join(CONFIG_DIR, "opencode.jsonc");
const JSON_PATH = path.join(CONFIG_DIR, "opencode.json");

function getConfigPath(): string {
  if (existsSync(JSONC_PATH)) return JSONC_PATH;
  if (existsSync(JSON_PATH)) return JSON_PATH;
  return JSONC_PATH;
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
  await mkdir(CONFIG_DIR, { recursive: true });
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
