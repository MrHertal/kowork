import { readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";

import { KOWORK_SYSTEM_PROMPT } from "../../../packages/app/src/constants/kowork-system-prompt";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

export const builtinSkillsDir = path.join(
  repoRoot,
  "packages/electron/resources/skills-builtin",
);
export const pdfEvalManifestPath = path.join(
  builtinSkillsDir,
  "pdf/evals/evals.json",
);
export const pdfFixturePath = path.join(
  builtinSkillsDir,
  "pdf/evals/files/report.pdf",
);

const skills = readdirSync(builtinSkillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const source = readFileSync(
      path.join(builtinSkillsDir, entry.name, "SKILL.md"),
      "utf8",
    );
    const name = source.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    if (!name) throw new Error(`Built-in skill ${entry.name} has no name`);
    return name;
  })
  .sort((a, b) => a.localeCompare(b));

const configuration = [
  "### Skills",
  "",
  ...skills.map((name) => `- ${name}`),
].join("\n");

export const evalSystemPrompt = KOWORK_SYSTEM_PROMPT.replace(
  "{{version}}",
  "unknown",
).replace("{{configuration}}", configuration);
