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
  evaluateMergedPdfPages,
  evaluateMergeWorkflow,
  evaluateReadingWorkflow,
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
  const previewDir = join(work, "preview");
  mkdirSync(previewDir, { recursive: true });
  const preview = join(previewDir, "page_001.png");
  writeFileSync(preview, "preview");
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
      tool: "bash",
      callID: "render",
      args: {
        command: `kowork-python /skill/render.py ${quarterlyPath} ${previewDir}`,
      },
    },
    { type: "tool-end", tool: "bash", callID: "render", exitCode: 0 },
    {
      type: "tool-start",
      tool: "read",
      callID: "preview",
      args: { filePath: preview },
    },
    { type: "tool-end", tool: "read", callID: "preview", outputLength: 100 },
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
    preview,
    previewDir,
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
  input.events[8].args.files[0].path = realpathSync(input.quarterlyPath);
  assert.equal(evaluateCreationWorkflow(input).pass, true);
});

test("accepts a successful retry after changing into the approved script directory", () => {
  const input = fixture();
  input.events[0].args.command =
    `cd "${join(input.approvedTempRoot, input.sessionId, "pdf-task-abc123")}" && ` +
    `kowork-python -c "print('repair')" && kowork-python create_pdf.py "${input.quarterlyPath}"`;
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

test("accepts an edit through the canonical path to the approved script", () => {
  const input = fixture();
  input.events.unshift({
    type: "tool-start",
    tool: "edit",
    callID: "edit",
    args: { filePath: realpathSync(input.script) },
  });
  assert.equal(evaluateCreationWorkflow(input).pass, true);
});

test("rejects presentation before validation", () => {
  const input = fixture();
  const validate = input.events.splice(2, 2);
  input.events.splice(8, 0, ...validate);
  assert.match(evaluateCreationWorkflow(input).reason, /after validation/);
});

test("rejects presentation of an extra temporary file", () => {
  const input = fixture();
  input.events[8].args.files.push({ path: input.script });
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

function mergeFixture() {
  const root = mkdtempSync(join(tmpdir(), "kowork-pdf-merge-test-"));
  roots.push(root);
  const approvedTempRoot = join(root, "temp", "opencode");
  const sessionId = "ses_1234";
  const previewDir = join(
    approvedTempRoot,
    sessionId,
    "pdf-task-abc123",
    "preview",
  );
  mkdirSync(previewDir, { recursive: true });
  const preview = join(previewDir, "page_001.png");
  writeFileSync(preview, "preview");
  const combinedPath = join(root, "combined.pdf");
  writeFileSync(combinedPath, "%PDF-1.7");
  const events = [
    {
      type: "tool-start",
      tool: "bash",
      callID: "merge",
      args: {
        command: `kowork-python /skill/pages.py merge ${root}/report.pdf ${root}/appendix.pdf -o ${combinedPath}`,
      },
    },
    { type: "tool-end", tool: "bash", callID: "merge", exitCode: 0 },
    {
      type: "tool-start",
      tool: "bash",
      callID: "validate",
      args: { command: `kowork-python /skill/validate.py ${combinedPath}` },
    },
    { type: "tool-end", tool: "bash", callID: "validate", exitCode: 0 },
    {
      type: "tool-start",
      tool: "bash",
      callID: "render",
      args: {
        command: `kowork-python /skill/render.py ${combinedPath} ${previewDir}`,
      },
    },
    { type: "tool-end", tool: "bash", callID: "render", exitCode: 0 },
    {
      type: "tool-start",
      tool: "read",
      callID: "preview",
      args: { filePath: preview },
    },
    { type: "tool-end", tool: "read", callID: "preview", outputLength: 100 },
    {
      type: "tool-start",
      tool: "present_files",
      callID: "present",
      args: { files: [{ path: combinedPath }] },
    },
    { type: "tool-end", tool: "present_files", callID: "present" },
    { type: "text", messageID: "msg_1", partID: "part_1" },
  ];
  return {
    combinedPath,
    approvedTempRoot,
    sessionId,
    preview,
    previewDir,
    events,
    finalAnswer: { messageID: "msg_1", partID: "part_1" },
  };
}

test("accepts the ordered merge, full validation, and presentation", () => {
  assert.equal(evaluateMergeWorkflow(mergeFixture()).pass, true);
});

test("rejects a merge with appendix first", () => {
  const input = mergeFixture();
  input.events[0].args.command = input.events[0].args.command.replace(
    /report\.pdf (.*)appendix\.pdf/,
    "appendix.pdf $1report.pdf",
  );
  assert.match(
    evaluateMergeWorkflow(input).reason,
    /report\.pdf then appendix/,
  );
});

test("rejects validation limited to one page", () => {
  const input = mergeFixture();
  input.events[2].args.command += " --pages 1";
  assert.match(evaluateMergeWorkflow(input).reason, /all pages/);
});

test("rejects presentation before validation", () => {
  const input = mergeFixture();
  const validate = input.events.splice(2, 2);
  input.events.splice(8, 0, ...validate);
  assert.match(evaluateMergeWorkflow(input).reason, /after validation/);
});

test("rejects an extra incomplete presentation attempt", () => {
  const input = mergeFixture();
  input.events.splice(10, 0, {
    type: "tool-start",
    tool: "present_files",
    callID: "extra",
    args: { files: [{ path: input.combinedPath }] },
  });
  assert.match(evaluateMergeWorkflow(input).reason, /one present_files call/);
});

test("rejects an external PDF utility", () => {
  const input = mergeFixture();
  input.events[0].args.command += " && qpdf --check combined.pdf";
  assert.match(evaluateMergeWorkflow(input).reason, /external PDF utility/);
});

test("accepts three pages in source order", () => {
  assert.equal(
    evaluateMergedPdfPages({
      report: ["Report page 1", "Report page 2"],
      appendix: ["Appendix page"],
      combined: ["Report page 1", "Report\npage 2", "Appendix page"],
    }).pass,
    true,
  );
});

test("rejects reversed pages even when the page count is three", () => {
  assert.equal(
    evaluateMergedPdfPages({
      report: ["Report page 1", "Report page 2"],
      appendix: ["Appendix page"],
      combined: ["Appendix page", "Report page 1", "Report page 2"],
    }).pass,
    false,
  );
});

for (const [name, makeFixture, evaluate, outputKey] of [
  ["creation", fixture, evaluateCreationWorkflow, "quarterlyPath"],
  ["merge", mergeFixture, evaluateMergeWorkflow, "combinedPath"],
]) {
  const start = (input, id) =>
    input.events.find(
      (event) => event.type === "tool-start" && event.callID === id,
    );
  const end = (input, id) =>
    input.events.find(
      (event) => event.type === "tool-end" && event.callID === id,
    );
  for (const flag of [
    "--pages 1",
    "--pages=1",
    "--no-render",
    "--no-r",
    "--pag 1",
  ])
    test(`${name} rejects weakened validation ${flag}`, () => {
      const input = makeFixture();
      start(input, "validate").args.command += ` ${flag}`;
      assert.equal(evaluate(input).pass, false);
    });
  for (const separator of [";", "||", "\n"])
    test(`${name} rejects validation with hidden exit status ${JSON.stringify(separator)}`, () => {
      const input = makeFixture();
      start(input, "validate").args.command += `${separator} true`;
      assert.equal(evaluate(input).pass, false);
    });
  test(`${name} rejects validation targeting another PDF`, () => {
    const input = makeFixture();
    start(input, "validate").args.command =
      `kowork-python /skill/validate.py ${input.root}/other.pdf`;
    assert.equal(evaluate(input).pass, false);
  });
  test(`${name} rejects extra host-runtime attempts`, () => {
    const input = makeFixture();
    input.events.unshift({
      type: "tool-start",
      tool: "bash",
      callID: "wrong-runtime",
      args: { command: "python3 helper.py" },
    });
    assert.match(evaluate(input).reason, /runtime invocation/);
  });
  test(`${name} rejects missing or failed output rendering`, () => {
    const input = makeFixture();
    end(input, "render").exitCode = 1;
    assert.match(evaluate(input).reason, /successful render/);
  });
  test(`${name} rejects rendering the source instead of the output`, () => {
    const input = makeFixture();
    start(input, "render").args.command =
      `kowork-python /skill/render.py ${input.root}/source.pdf ${input.previewDir}`;
    assert.match(evaluate(input).reason, /successful render/);
  });
  test(`${name} rejects rendering without reading the image`, () => {
    const input = makeFixture();
    input.events = input.events.filter((event) => event.callID !== "preview");
    assert.match(evaluate(input).reason, /Read/);
  });
  test(`${name} rejects an empty preview Read`, () => {
    const input = makeFixture();
    end(input, "preview").outputLength = 0;
    assert.match(evaluate(input).reason, /Read/);
  });
  test(`${name} rejects previews outside the approved task directory`, () => {
    const input = makeFixture();
    start(input, "render").args.command =
      `kowork-python /skill/render.py ${input[outputKey]} ${input.root}`;
    assert.match(evaluate(input).reason, /previews must be inside/);
  });
  test(`${name} rejects a preview Read after presentation`, () => {
    const input = makeFixture();
    const read = input.events.splice(6, 2);
    input.events.splice(8, 0, ...read);
    assert.match(evaluate(input).reason, /Read/);
  });
  test(`${name} accepts validation and rendering in one successful && call`, () => {
    const input = makeFixture();
    start(input, "validate").args.command +=
      ` && kowork-python /skill/render.py ${input[outputKey]} ${input.previewDir}`;
    input.events.splice(4, 2);
    assert.equal(evaluate(input).pass, true);
  });
  test(`${name} accepts options before the validation and render paths`, () => {
    const input = makeFixture();
    start(input, "validate").args.command =
      `kowork-python /skill/validate.py --password irrelevant ${input[outputKey]}`;
    start(input, "render").args.command =
      `kowork-python /skill/render.py --dpi 150 ${input[outputKey]} ${input.previewDir}`;
    assert.equal(evaluate(input).pass, true);
  });
  test(`${name} rejects stale validation after a later output modification`, () => {
    const input = makeFixture();
    const mutation = structuredClone(input.events.slice(0, 2));
    mutation.forEach((event) => {
      event.callID = "retry";
    });
    input.events.splice(8, 0, ...mutation);
    assert.equal(evaluate(input).pass, false);
  });
}
test("merge accepts inspecting page two when that is the rendered selection", () => {
  const input = mergeFixture();
  const image = join(input.previewDir, "page_002.png");
  writeFileSync(image, "preview");
  input.events[4].args.command += " --pages 2";
  input.events[6].args.filePath = image;
  assert.equal(evaluateMergeWorkflow(input).pass, true);
});
test("merge rejects reading a stale image outside the rendered page selection", () => {
  const input = mergeFixture();
  input.events[4].args.command += " --pages 2";
  assert.match(evaluateMergeWorkflow(input).reason, /Read/);
});

function readingFixture() {
  return {
    reportPath: "/task/report.pdf",
    finalAnswer: { messageID: "msg_final", partID: "part_final" },
    events: [
      {
        type: "tool-start",
        tool: "bash",
        callID: "read",
        args: {
          command: "kowork-python /skill/read_pdf.py /task/report.pdf --tables",
        },
      },
      {
        type: "tool-end",
        tool: "bash",
        callID: "read",
        exitCode: 0,
        outputLength: 100,
        commandOutput: true,
      },
      { type: "text", messageID: "msg_final", partID: "part_final" },
    ],
  };
}
test("reading accepts direct and constant-variable invocations with real output", () => {
  const input = readingFixture();
  assert.equal(evaluateReadingWorkflow(input).pass, true);
  input.events[0].args.command =
    'cd /task && S=/skill && env FOO=bar kowork-python "$S/read_pdf.py" --tables report.pdf';
  assert.equal(evaluateReadingWorkflow(input).pass, true);
});
for (const [name, modify] of [
  [
    "failed extraction",
    (i) => {
      i.events[1].exitCode = 1;
    },
  ],
  [
    "missing output",
    (i) => {
      i.events[1].commandOutput = false;
    },
  ],
  [
    "empty output",
    (i) => {
      i.events[1].outputLength = 0;
    },
  ],
  [
    "wrong source",
    (i) => {
      i.events[0].args.command = i.events[0].args.command.replace(
        "report.pdf",
        "other.pdf",
      );
    },
  ],
  [
    "no table mode",
    (i) => {
      i.events[0].args.command = i.events[0].args.command.replace(
        " --tables",
        "",
      );
    },
  ],
  [
    "command only mentioned",
    (i) => {
      i.events[0].args.command = `echo '${i.events[0].args.command}'`;
    },
  ],
  [
    "answer before extraction",
    (i) => {
      i.events.unshift(i.events.pop());
    },
  ],
])
  test(`reading rejects ${name}`, () => {
    const input = readingFixture();
    modify(input);
    assert.equal(evaluateReadingWorkflow(input).pass, false);
  });
