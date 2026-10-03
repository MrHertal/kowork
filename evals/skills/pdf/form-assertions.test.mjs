import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, test } from "node:test";

import {
  evaluateFormWorkflow,
  evaluateStoredFormValues,
  filledFormHasRequestedValues,
  inspectStoredFormValues,
} from "./form-assertions.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const runtime = resolve(
  import.meta.dirname,
  "../../../packages/electron/resources/runtime",
);
const python = join(
  runtime,
  JSON.parse(readFileSync(join(runtime, "MANIFEST.json"))).paths.pythonExe,
);
const source = resolve(
  import.meta.dirname,
  "../../../packages/electron/resources/skills-builtin/pdf/evals/files/application-form.pdf",
);
const forms = resolve(
  import.meta.dirname,
  "../../../packages/electron/resources/skills-builtin/pdf/scripts/forms.py",
);

function call(tool, id, args, end = {}) {
  return [
    { type: "tool-start", tool, callID: id, args },
    { type: "tool-end", tool, callID: id, outputLength: 100, ...end },
  ];
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "kowork-pdf-form-test-"));
  roots.push(root);
  const formPath = join(root, "application-form.pdf");
  const filledPath = join(root, "application-filled.pdf");
  const approvedTempRoot = join(root, "temp", "opencode");
  const sessionId = "ses_1234";
  const work = join(approvedTempRoot, sessionId, "pdf-task-abc123");
  const previewDir = join(work, "preview");
  const preview = join(previewDir, "page_001.png");
  const valuesPath = join(work, "values.json");
  mkdirSync(previewDir, { recursive: true });
  writeFileSync(valuesPath, "{}");
  writeFileSync(join(work, "answers.json"), "{}");
  copyFileSync(source, formPath);
  copyFileSync(source, filledPath);
  writeFileSync(preview, "preview");
  const shell = (id, command) => call("bash", id, { command }, { exitCode: 0 });
  return {
    root,
    approvedTempRoot,
    sessionId,
    work,
    previewDir,
    valuesPath,
    formPath,
    filledPath,
    preview,
    events: [
      ...shell(
        "discover",
        `kowork-python /skill/forms.py fields "${formPath}"`,
      ),
      ...shell(
        "fill",
        `kowork-python /skill/forms.py fill "${formPath}" "${valuesPath}" -o "${filledPath}"`,
      ),
      ...shell(
        "render",
        `kowork-python /skill/render.py "${filledPath}" "${previewDir}"`,
      ),
      ...call("read", "preview", { filePath: preview }),
      ...shell("validate", `kowork-python /skill/validate.py "${filledPath}"`),
      ...call("present_files", "present", { files: [{ path: filledPath }] }),
      { type: "text", messageID: "msg_1", partID: "part_1" },
    ],
    finalAnswer: { messageID: "msg_1", partID: "part_1" },
  };
}

test("accepts discovery, fill, preview Read, validation, and presentation", () => {
  assert.equal(evaluateFormWorkflow(fixture()).pass, true);
});
test("accepts relative paths, info alias, quoted script, flags, and && chaining", () => {
  const input = fixture();
  input.events.splice(
    0,
    4,
    ...call(
      "bash",
      "chain",
      {
        workdir: input.root,
        command: `kowork-python -B '/skill/forms.py' inspect application-form.pdf && kowork-python '/skill/forms.py' fill application-form.pdf "${relative(input.root, join(input.work, "answers.json"))}" --out application-filled.pdf`,
      },
      { exitCode: 0 },
    ),
  );
  assert.equal(evaluateFormWorkflow(input).pass, true);
});
test("accepts an equals-style output option", () => {
  const input = fixture();
  input.events[2].args.command = input.events[2].args.command.replace(
    `-o "${input.filledPath}"`,
    `--out=${input.filledPath}`,
  );
  assert.equal(evaluateFormWorkflow(input).pass, true);
});
test("requires fresh validation and preview after a later successful refill", () => {
  const input = fixture();
  input.events.splice(
    10,
    0,
    ...call("bash", "refill", input.events[2].args, { exitCode: 0 }),
  );
  assert.match(evaluateFormWorkflow(input).reason, /validated/);
});
for (const separator of [";", "||", "\n"]) {
  test(`rejects validation whose failure can be hidden by ${JSON.stringify(separator)}`, () => {
    const input = fixture();
    input.events[8].args.command += `${separator} true`;
    assert.match(evaluateFormWorkflow(input).reason, /validated/);
  });
}
for (const [name, modify, reason] of [
  ["no discovery", (i) => i.events.splice(0, 2), /discovery/],
  [
    "discovery after fill",
    (i) => i.events.splice(4, 0, ...i.events.splice(0, 2)),
    /discovery/,
  ],
  [
    "failed discovery",
    (i) => {
      i.events[1].exitCode = 1;
    },
    /discovery/,
  ],
  [
    "discovery on output",
    (i) => {
      i.events[0].args.command = i.events[0].args.command.replace(
        i.formPath,
        i.filledPath,
      );
    },
    /discovery/,
  ],
  [
    "failed fill",
    (i) => {
      i.events[3].exitCode = 1;
    },
    /discovery/,
  ],
  ["render without Read", (i) => i.events.splice(6, 2), /Read/],
  [
    "Read source preview",
    (i) => {
      i.events[4].args.command = i.events[4].args.command.replace(
        i.filledPath,
        i.formPath,
      );
    },
    /render|Read/,
  ],
  [
    "Read unrelated image",
    (i) => {
      i.events[6].args.filePath = i.formPath;
    },
    /Read/,
  ],
  [
    "Read before render",
    (i) => i.events.splice(4, 0, ...i.events.splice(6, 2)),
    /Read/,
  ],
  ["failed Read", (i) => i.events.splice(7, 1), /Read/],
  [
    "failed validation",
    (i) => {
      i.events[9].exitCode = 1;
    },
    /validated/,
  ],
  [
    "structure-only validation",
    (i) => {
      i.events[8].args.command += " --no-render";
    },
    /validated/,
  ],
  [
    "partial validation",
    (i) => {
      i.events[8].args.command += " --pages=1";
    },
    /validated/,
  ],
  [
    "validation of source",
    (i) => {
      i.events[8].args.command = i.events[8].args.command.replace(
        i.filledPath,
        i.formPath,
      );
    },
    /validated/,
  ],
  [
    "early presentation",
    (i) => i.events.splice(8, 0, ...i.events.splice(10, 2)),
    /after validation/,
  ],
  ["failed presentation", (i) => i.events.splice(11, 1), /presentation/],
  [
    "extra preview presented",
    (i) => i.events[10].args.files.push({ path: i.preview }),
    /only application/,
  ],
  [
    "source presented",
    (i) => {
      i.events[10].args.files[0].path = i.formPath;
    },
    /only application/,
  ],
  [
    "early final answer",
    (i) => i.events.splice(10, 0, ...i.events.splice(12, 1)),
    /final answer/,
  ],
])
  test(`rejects ${name}`, () => {
    const input = fixture();
    modify(input);
    const result = evaluateFormWorkflow(input);
    assert.equal(result.pass, false);
    assert.match(result.reason, reason);
  });

const correct = {
  full_name: { type: "/Tx", flags: 0, value: "Dana Lee" },
  subscribe: { type: "/Btn", flags: 0, value: "/Yes" },
  plan: { type: "/Btn", flags: 1 << 15, value: "/Pro" },
};
test("accepts the authoritative text, checkbox, and radio values", () => {
  assert.equal(evaluateStoredFormValues(correct).pass, true);
});
for (const [name, field, value] of [
  ["wrong name", "full_name", "Dana"],
  ["unchecked checkbox", "subscribe", "/Off"],
  ["wrong radio", "plan", "/Basic"],
]) {
  test(`rejects stored ${name}`, () => {
    const fields = structuredClone(correct);
    fields[field].value = value;
    assert.equal(evaluateStoredFormValues(fields).pass, false);
  });
}
test("rejects text imitations of button fields and missing fields", () => {
  const fields = structuredClone(correct);
  fields.plan.type = "/Tx";
  assert.equal(evaluateStoredFormValues(fields).pass, false);
  assert.equal(evaluateStoredFormValues({}).pass, false);
});

function runPython(args) {
  const output = spawnSync(python, args, { encoding: "utf8", timeout: 20_000 });
  assert.equal(output.status, 0, output.stderr);
}
function artifactResult(input) {
  const previous = process.env.KOWORK_EVAL_PYTHON_EXE;
  process.env.KOWORK_EVAL_PYTHON_EXE = python;
  try {
    return filledFormHasRequestedValues("Dana Lee subscribed to Pro", {
      vars: {
        ...input,
        formSha256: createHash("sha256")
          .update(readFileSync(source))
          .digest("hex"),
      },
    });
  } finally {
    if (previous === undefined) delete process.env.KOWORK_EVAL_PYTHON_EXE;
    else process.env.KOWORK_EVAL_PYTHON_EXE = previous;
  }
}
test("inspects real filled PDF values through the bundled runtime and rejects wrong artifacts", () => {
  const input = fixture();
  const values = join(input.root, "answers.json");
  writeFileSync(
    values,
    JSON.stringify({ full_name: "Dana Lee", subscribe: "Yes", plan: "Pro" }),
  );
  runPython([forms, "fill", input.formPath, values, "-o", input.filledPath]);
  assert.equal(artifactResult(input).pass, true);
  for (const changes of [
    { full_name: "Other" },
    { subscribe: "Off" },
    { plan: "Basic" },
  ]) {
    writeFileSync(
      values,
      JSON.stringify({
        full_name: "Dana Lee",
        subscribe: "Yes",
        plan: "Pro",
        ...changes,
      }),
    );
    runPython([forms, "fill", input.formPath, values, "-o", input.filledPath]);
    assert.equal(artifactResult(input).pass, false);
  }
  copyFileSync(source, input.filledPath);
  assert.equal(artifactResult(input).pass, false);
  writeFileSync(input.filledPath, "broken PDF");
  assert.match(artifactResult(input).reason, /Could not inspect/);
  rmSync(input.filledPath);
  assert.match(artifactResult(input).reason, /missing/);
});
test("rejects flattened text-only output even with the correct visible words", () => {
  const input = fixture();
  runPython([
    "-c",
    `from reportlab.pdfgen import canvas
import sys
c = canvas.Canvas(sys.argv[1]); c.drawString(50, 700, 'Dana Lee Subscribe Yes Plan Pro'); c.save()`,
    input.filledPath,
  ]);
  assert.equal(artifactResult(input).pass, false);
});
test("rejects a modified or removed source", () => {
  const input = fixture();
  writeFileSync(input.formPath, "changed");
  assert.match(artifactResult(input).reason, /source.*changed/);
  rmSync(input.formPath);
  assert.match(artifactResult(input).reason, /source.*missing/);
});
test("inspection reports interpreter errors without misreporting values", () => {
  assert.ok(inspectStoredFormValues("/nonexistent/python", source).error);
});

test("rejects extra host runtime calls even when the fill workflow is correct", () => {
  const input = fixture();
  input.events.unshift({
    type: "tool-start",
    tool: "bash",
    callID: "extra",
    args: { command: "python3 helper.py" },
  });
  assert.match(evaluateFormWorkflow(input).reason, /runtime invocation/);
});
test("rejects values JSON in the user's task output folder", () => {
  const input = fixture();
  const wrong = join(input.root, "values.json");
  writeFileSync(wrong, "{}");
  input.events[2].args.command = input.events[2].args.command.replace(
    input.valuesPath,
    wrong,
  );
  assert.match(evaluateFormWorkflow(input).reason, /Form JSON files/);
});
test("rejects values JSON directly in the approved session root", () => {
  const input = fixture();
  const wrong = join(input.approvedTempRoot, input.sessionId, "values.json");
  writeFileSync(wrong, "{}");
  input.events[2].args.command = input.events[2].args.command.replace(
    input.valuesPath,
    wrong,
  );
  assert.match(evaluateFormWorkflow(input).reason, /Form JSON files/);
});
test("accepts retained field discovery JSON inside the task directory", () => {
  const input = fixture();
  const fields = join(input.work, "fields.json");
  writeFileSync(fields, "{}");
  input.events[0].args.command = `kowork-python /skill/forms.py fields --out="${fields}" "${input.formPath}"`;
  assert.equal(evaluateFormWorkflow(input).pass, true);
});
test("rejects field discovery JSON outside the task directory", () => {
  const input = fixture();
  const fields = join(input.root, "fields.json");
  writeFileSync(fields, "{}");
  input.events[0].args.command += ` -o "${fields}"`;
  assert.match(evaluateFormWorkflow(input).reason, /Form JSON files/);
});
test("rejects another temporary JSON written outside the approved task directory", () => {
  const input = fixture();
  const wrong = join(input.root, "intermediate.json");
  writeFileSync(wrong, "{}");
  input.events.unshift(
    ...call("write", "extra-json", { filePath: wrong, content: "{}" }),
  );
  assert.match(evaluateFormWorkflow(input).reason, /Form JSON files/);
});
test("rejects missing retained values JSON", () => {
  const input = fixture();
  rmSync(input.valuesPath);
  assert.match(evaluateFormWorkflow(input).reason, /Form JSON files/);
});
test("rejects an output preview in the user's folder", () => {
  const input = fixture();
  input.events[4].args.command = input.events[4].args.command.replace(
    input.previewDir,
    input.root,
  );
  assert.match(evaluateFormWorkflow(input).reason, /previews must be inside/);
});
test("rejects an output preview directly under the session root", () => {
  const input = fixture();
  input.events[4].args.command = input.events[4].args.command.replace(
    input.previewDir,
    join(input.approvedTempRoot, input.sessionId),
  );
  assert.match(evaluateFormWorkflow(input).reason, /previews must be inside/);
});

test("accepts the constant-variable form workflow observed in the model trace", () => {
  const input = fixture();
  input.events[2].args.command = `S='/skill' && T='${input.work}' && F='${input.root}' && kowork-python "$S/forms.py" fill "$F/application-form.pdf" "$T/values.json" -o "$F/application-filled.pdf" && kowork-python "$S/validate.py" "$F/application-filled.pdf"`;
  input.events[4].args.command = `S='/skill' && T='${input.work}' && kowork-python "$S/render.py" '${input.filledPath}' "$T/preview"`;
  input.events.splice(8, 2);
  assert.equal(evaluateFormWorkflow(input).pass, true);
});
