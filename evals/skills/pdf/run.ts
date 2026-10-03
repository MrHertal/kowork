import { createHash } from "node:crypto";
import { copyFile, readFile } from "node:fs/promises";
import * as path from "node:path";

import { runSidecarEval } from "../../run-sidecar-eval";
import { gradingSystemPrompt } from "../../system-prompt";
import {
  builtinSkillsDir,
  evalSystemPrompt,
  pdfAppendixFixturePath,
  pdfFixturePath,
  pdfFormFixturePath,
} from "./system-prompt";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const promptfooConfig = path.join(import.meta.dirname, "promptfooconfig.ts");
const resultsDir = path.join(repoRoot, "tmp/promptfoo/skills/pdf");

process.exitCode = await runSidecarEval({
  promptfooConfig,
  resultsDir,
  expectedSystemPrompt: evalSystemPrompt,
  gradingSystemPrompt,
  temporaryPrefix: "kowork-eval-skill-pdf-",
  skillPaths: [builtinSkillsDir],
  maxConcurrency: 1,
  async prepareTaskFolder({ taskFolder }) {
    const reportPath = path.join(taskFolder, "report.pdf");
    const appendixPath = path.join(taskFolder, "appendix.pdf");
    const formPath = path.join(taskFolder, "application-form.pdf");
    await copyFile(pdfFixturePath, reportPath);
    await copyFile(pdfAppendixFixturePath, appendixPath);
    await copyFile(pdfFormFixturePath, formPath);
    const [report, appendix] = await Promise.all([
      readFile(pdfFixturePath),
      readFile(pdfAppendixFixturePath),
    ]);
    return {
      KOWORK_EVAL_PDF_FORM_PATH: formPath,
      KOWORK_EVAL_PDF_FORM_SHA256: createHash("sha256")
        .update(await readFile(pdfFormFixturePath))
        .digest("hex"),
      KOWORK_EVAL_PDF_REPORT_PATH: reportPath,
      KOWORK_EVAL_PDF_REPORT_SHA256: createHash("sha256")
        .update(report)
        .digest("hex"),
      KOWORK_EVAL_PDF_APPENDIX_PATH: appendixPath,
      KOWORK_EVAL_PDF_APPENDIX_SHA256: createHash("sha256")
        .update(appendix)
        .digest("hex"),
    };
  },
  async verifySidecar({ baseUrl, taskFolder }) {
    const url = new URL("/skill", baseUrl);
    url.searchParams.set("directory", taskFolder);
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(
        `Unable to inspect sidecar skills: HTTP ${response.status}`,
      );
    }
    const skills = (await response.json()) as { name?: string }[];
    if (!skills.some((skill) => skill.name === "kowork-pdf")) {
      throw new Error("The kowork-pdf skill is not registered in the sidecar");
    }
  },
});
