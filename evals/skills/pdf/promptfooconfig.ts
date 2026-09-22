import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
const createScenario = manifest.evals.find(({ id }) => id === 1);
const readScenario = manifest.evals.find(({ id }) => id === 2);
if (!createScenario || !readScenario)
  throw new Error("PDF skill creation or reading scenario is missing");
const quarterlyPath = join(dirname(reportPath), "quarterly.pdf");

const readRequest = `${readScenario.prompt}

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
      label: "kowork-pdf",
      description: "Kowork PDF skill evaluation",
      prompt: evalSystemPrompt,
    }),
  ],
  tests: [
    {
      description:
        "Creates, validates, and presents a PDF with the built-in PDF skill",
      vars: { request: createScenario.prompt, quarterlyPath },
      assert: [
        {
          type: "javascript",
          value: "file://../../trace-assertions.mjs:toolUsed",
          config: {
            tool: "skill",
            args: { name: "kowork-pdf" },
            status: "success",
            nonEmptyOutput: true,
            beforeFinalAnswer: true,
          },
        },
        {
          type: "javascript",
          value: "file://assertions.mjs:creationWorkflow",
        },
        {
          type: "javascript",
          value: "file://assertions.mjs:createdPdfHasRequestedContent",
        },
        { type: "icontains", value: "quarterly.pdf" },
      ],
    },
    {
      description: "Extracts a real table with the built-in PDF skill",
      vars: { request: readRequest, reportPath, reportSha256 },
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
