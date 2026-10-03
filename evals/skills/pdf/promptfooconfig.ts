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
const appendixPath = process.env.KOWORK_EVAL_PDF_APPENDIX_PATH;
const appendixSha256 = process.env.KOWORK_EVAL_PDF_APPENDIX_SHA256;
const formPath = process.env.KOWORK_EVAL_PDF_FORM_PATH;
const formSha256 = process.env.KOWORK_EVAL_PDF_FORM_SHA256;
if (
  !baseUrl ||
  !reportPath ||
  !reportSha256 ||
  !appendixPath ||
  !appendixSha256 ||
  !formPath ||
  !formSha256
) {
  throw new Error("Run this evaluation with `pnpm eval:skill:pdf`.");
}

const manifest = JSON.parse(readFileSync(pdfEvalManifestPath, "utf8")) as {
  evals: PdfScenario[];
};
const createScenario = manifest.evals.find(({ id }) => id === 1);
const readScenario = manifest.evals.find(({ id }) => id === 2);
const mergeScenario = manifest.evals.find(({ id }) => id === 3);
const formScenario = manifest.evals.find(({ id }) => id === 5);
if (!createScenario || !readScenario || !mergeScenario || !formScenario)
  throw new Error(
    "PDF skill creation, reading, merge, or form scenario is missing",
  );
const quarterlyPath = join(dirname(reportPath), "quarterly.pdf");
const combinedPath = join(dirname(reportPath), "combined.pdf");
const filledPath = join(dirname(formPath), "application-filled.pdf");
const formRequest = `${formScenario.prompt}

<kowork_attachments>
  <attachment>
    <name>application-form.pdf</name>
    <path>${formPath}</path>
    <format>pdf</format>
    <position>1</position>
  </attachment>
</kowork_attachments>`;

const readRequest = `${readScenario.prompt}

<kowork_attachments>
  <attachment>
    <name>report.pdf</name>
    <path>${reportPath}</path>
    <format>pdf</format>
    <position>1</position>
  </attachment>
</kowork_attachments>`;

const mergeRequest = `${mergeScenario.prompt}

<kowork_attachments>
  <attachment>
    <name>report.pdf</name>
    <path>${reportPath}</path>
    <format>pdf</format>
    <position>1</position>
  </attachment>
  <attachment>
    <name>appendix.pdf</name>
    <path>${appendixPath}</path>
    <format>pdf</format>
    <position>2</position>
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
        "Fills and presents real AcroForm values with the built-in PDF skill",
      vars: { request: formRequest, formPath, formSha256, filledPath },
      assert: [
        { type: "javascript", value: "file://workflow.mjs:runtimeCompliance" },
        {
          type: "javascript",
          value: "file://../../trace-assertions.mjs:toolUsed",
          config: {
            tool: "skill",
            args: { name: "kowork-pdf" },
            nonEmptyOutput: true,
            beforeFinalAnswer: true,
          },
        },
        {
          type: "javascript",
          value: "file://form-assertions.mjs:formWorkflow",
        },
        {
          type: "javascript",
          value: "file://form-assertions.mjs:filledFormHasRequestedValues",
        },
      ],
    },
    {
      description:
        "Creates, validates, and presents a PDF with the built-in PDF skill",
      vars: { request: createScenario.prompt, quarterlyPath },
      assert: [
        { type: "javascript", value: "file://workflow.mjs:runtimeCompliance" },
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
        { type: "javascript", value: "file://workflow.mjs:runtimeCompliance" },
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
          value: "file://assertions.mjs:readingWorkflow",
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
    {
      description: "Merges two PDFs in order with the built-in PDF skill",
      vars: {
        request: mergeRequest,
        reportPath,
        reportSha256,
        appendixPath,
        appendixSha256,
        combinedPath,
      },
      assert: [
        { type: "javascript", value: "file://workflow.mjs:runtimeCompliance" },
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
          value: "file://assertions.mjs:mergeWorkflow",
        },
        {
          type: "javascript",
          value: "file://assertions.mjs:mergedPdfHasRequestedPages",
        },
        { type: "icontains", value: "combined.pdf" },
      ],
    },
  ],
};
