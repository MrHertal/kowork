import { readFileSync } from "node:fs";

import { createKoworkEvalProvider } from "../../opencode-provider";
import { evalSystemPrompt, pdfEvalManifestPath } from "./system-prompt";

type PdfScenario = {
  id: number;
  prompt: string;
};

const baseUrl = process.env.KOWORK_EVAL_BASE_URL;
const reportPath = process.env.KOWORK_EVAL_PDF_REPORT_PATH;
const reportSha256 = process.env.KOWORK_EVAL_PDF_REPORT_SHA256;
if (!baseUrl || !reportPath || !reportSha256) {
  throw new Error("Run this evaluation with `pnpm eval:skill:pdf`.");
}

const manifest = JSON.parse(readFileSync(pdfEvalManifestPath, "utf8")) as {
  evals: PdfScenario[];
};
const scenario = manifest.evals.find(({ id }) => id === 2);
if (!scenario) throw new Error("PDF skill scenario 2 is missing");

const request = `${scenario.prompt}

<kowork_attachments>
  <attachment>
    <name>report.pdf</name>
    <path>${reportPath}</path>
    <format>pdf</format>
    <position>1</position>
  </attachment>
</kowork_attachments>`;

export default {
  description: "Kowork PDF skill",
  prompts: ["{{request}}"],
  providers: [
    createKoworkEvalProvider({
      baseUrl,
      label: "pdf-read",
      description: "Kowork PDF skill evaluation",
      prompt: evalSystemPrompt,
    }),
  ],
  tests: [
    {
      description: "Extracts a real table with the built-in PDF skill",
      vars: { request, reportPath, reportSha256 },
      assert: [
        {
          type: "javascript",
          value: "file://../../trace-assertions.mjs:toolUsed",
          config: {
            tool: "skill",
            args: { name: "kowork-pdf" },
            status: "success",
            min: 1,
            nonEmptyOutput: true,
            beforeFinalAnswer: true,
          },
        },
        {
          type: "javascript",
          value: "file://../../trace-assertions.mjs:toolUsed",
          config: {
            tool: "bash",
            argsRegex: {
              command: String.raw`^\s*kowork-python(?:\.cmd)?(?=[\s\S]*read_pdf\.py)(?=[\s\S]*report\.pdf)(?=[\s\S]*--tables(?:\s|$))`,
            },
            status: "success",
            exitCode: 0,
            min: 1,
            commandOutput: true,
            nonEmptyOutput: true,
            beforeFinalAnswer: true,
          },
        },
        {
          type: "javascript",
          value: "file://../../trace-assertions.mjs:toolUsed",
          config: {
            tool: "present_files",
            status: "attempt",
            max: 0,
          },
        },
        {
          type: "javascript",
          value: "file://assertions.mjs:containsRevenueByItem",
        },
        {
          type: "javascript",
          value: "file://assertions.mjs:reportIsUnchanged",
        },
      ],
    },
  ],
};
