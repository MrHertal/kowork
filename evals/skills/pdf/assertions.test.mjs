import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  evaluateCreatedPdfContent,
  evaluateCreationWorkflow,
} from "./assertions.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "kowork-pdf-assertion-test-"));
  roots.push(root);
  const approvedTempRoot = join(root, "temp", "opencode");
  const sessionId = "ses_1234";
  const work = join(approvedTempRoot, sessionId, "pdf-task-abc123");
  const script = join(work, "create_pdf.py");
  const quarterlyPath = join(root, "folder", "quarterly.pdf");
  mkdirSync(work, { recursive: true });
  mkdirSync(join(root, "folder"));
  writeFileSync(script, "# working copy");
  writeFileSync(quarterlyPath, "%PDF-1.7");

  const events = [
    {
      type: "tool-start",
      tool: "bash",
      callID: "create",
      args: { command: `kowork-python ${script} ${quarterlyPath}` },
    },
    { type: "tool-end", tool: "bash", callID: "create", exitCode: 0 },
    {
      type: "tool-start",
      tool: "bash",
      callID: "validate",
      args: { command: `kowork-python /skill/validate.py ${quarterlyPath}` },
    },
    { type: "tool-end", tool: "bash", callID: "validate", exitCode: 0 },
    {
      type: "tool-start",
      tool: "present_files",
      callID: "present",
      args: { files: [{ path: quarterlyPath }] },
    },
    { type: "tool-end", tool: "present_files", callID: "present" },
    { type: "text", messageID: "msg_1", partID: "part_1" },
  ];
  return {
    root,
    approvedTempRoot,
    sessionId,
    quarterlyPath,
    script,
    events,
    finalAnswer: { messageID: "msg_1", partID: "part_1" },
  };
}

test("accepts an approved working script followed by validation and presentation", () => {
  assert.equal(evaluateCreationWorkflow(fixture()).pass, true);
});

test("accepts a canonical presentation path for the same final PDF", () => {
  const input = fixture();
  input.events[4].args.files[0].path = realpathSync(input.quarterlyPath);
  assert.equal(evaluateCreationWorkflow(input).pass, true);
});

test("rejects a working script in the task output folder", () => {
  const input = fixture();
  writeFileSync(
    join(input.root, "folder", "create_pdf.py"),
    "# wrong location",
  );
  assert.match(evaluateCreationWorkflow(input).reason, /task output folder/);
});

test("rejects an edit targeting an unapproved temporary directory", () => {
  const input = fixture();
  input.events.unshift({
    type: "tool-start",
    tool: "edit",
    callID: "edit",
    args: { filePath: join(input.root, "temp", "other", "create_pdf.py") },
  });
  assert.match(evaluateCreationWorkflow(input).reason, /outside the approved/);
});

test("rejects presentation before validation", () => {
  const input = fixture();
  const validate = input.events.splice(2, 2);
  input.events.splice(6, 0, ...validate);
  assert.match(evaluateCreationWorkflow(input).reason, /after validation/);
});

test("rejects presentation of an extra temporary file", () => {
  const input = fixture();
  input.events[4].args.files.push({ path: input.script });
  assert.match(evaluateCreationWorkflow(input).reason, /only the final PDF/);
});

test("accepts a summary sentence wrapped across extracted text lines", () => {
  const result = evaluateCreatedPdfContent({
    text: "Quarterly Report\nItem Units Revenue\nWidgets 1,200 $58,000\nGadgets 450 $41,500\nThis quarter sales remained strong, with widgets and gadgets together\ngenerating just under $100,000 in total revenue.",
    tables: [
      [
        ["Item", "Units", "Revenue"],
        ["Widgets", "1,200", "$58,000"],
        ["Gadgets", "450", "$41,500"],
      ],
    ],
  });
  assert.equal(result.pass, true);
});
