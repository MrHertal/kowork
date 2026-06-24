#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.resolve(here, "..", "messages");
const files = (await readdir(messagesDir))
  .filter((f) => f.endsWith(".json"))
  .sort();

function prefixOf(key) {
  return key.split("_", 1)[0];
}

function format(data) {
  const { $schema, ...rest } = data;
  const keys = Object.keys(rest).sort();
  const lines = ["{"];
  if ($schema !== undefined) {
    lines.push(`  ${JSON.stringify("$schema")}: ${JSON.stringify($schema)},`);
    lines.push("");
  }
  let prevPrefix = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const prefix = prefixOf(key);
    if (prevPrefix !== null && prefix !== prevPrefix) lines.push("");
    const trailing = i < keys.length - 1 ? "," : "";
    lines.push(
      `  ${JSON.stringify(key)}: ${JSON.stringify(rest[key])}${trailing}`,
    );
    prevPrefix = prefix;
  }
  lines.push("}", "");
  return lines.join("\n");
}

for (const name of files) {
  const file = path.join(messagesDir, name);
  const data = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, format(data), "utf8");
  console.log(`sorted ${name}`);
}
