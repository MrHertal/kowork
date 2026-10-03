import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateRuntimeCompliance,
  completedCalls,
  scriptSteps,
} from "./workflow.mjs";

const trace = (command) => [
  { type: "tool-start", tool: "bash", callID: "shell", args: { command } },
];
for (const command of [
  "python script.py",
  "python3 script.py",
  "/usr/bin/python3.12 script.py",
  '"/usr/bin/python3" script.py',
  "py.exe script.py",
  "node helper.js",
  "nodejs helper.js",
  "env -u PYTHONPATH python3 script.py",
  "env FOO=bar python3 script.py",
  "FOO=bar python3 script.py",
  "command -- python3 script.py",
  "timeout 20 python3 script.py",
  "nice -n 10 python3 script.py",
  "bash -lc 'python3 script.py'",
  "sh -c 'env FOO=bar node helper.js'",
  "if python3 script.py; then echo done; fi",
  "echo ready; python3 script.py",
  "echo ready\npython3 script.py",
  "echo ready || python3 script.py",
  "kowork-python good.py && python3 bad.py",
  "(python3 script.py)",
  "python3 - <<'PY'\nprint('hi')\nPY",
])
  test(`rejects visible host runtime: ${command.split("\n")[0]}`, () => {
    assert.equal(evaluateRuntimeCompliance(trace(command)).pass, false);
  });
for (const name of [
  "qpdf",
  "pdftk",
  "gs",
  "pdftoppm",
  "tesseract",
  "soffice",
  "magick",
]) {
  test(`rejects ${name} even as an extra incomplete/failed attempt`, () => {
    const events = [
      ...trace("kowork-python good.py"),
      ...trace(`/usr/bin/${name} input.pdf`),
    ];
    assert.match(
      evaluateRuntimeCompliance(events).reason,
      /external PDF utility/,
    );
  });
}
for (const command of [
  "kowork-python script.py",
  "kowork-python.cmd script.py",
  "env FOO=bar kowork-python -B script.py",
  'echo "python3 qpdf node"',
  "printf '%s' 'python3 script.py'",
  "which python3",
  "command -v python3",
  "# python3 bad.py\nkowork-python good.py",
  "bash -c 'echo python3'",
  "kowork-python - <<'PY'\npython = 'python3'\nnode = 'qpdf'\nprint(python)\nPY",
  "cat <<'JSON'\npython3 is text in this fixture\nqpdf is text too\nJSON",
])
  test(`allows harmless/runtime-compliant command: ${command.split("\n")[0]}`, () => {
    assert.equal(evaluateRuntimeCompliance(trace(command)).pass, true);
  });
test("quoted or commented heredoc text cannot conceal a later runtime violation", () => {
  for (const header of ["echo 'example <<EOF'", "echo okay # <<EOF"]) {
    assert.equal(
      evaluateRuntimeCompliance(trace(`${header}\npython3 bad.py`)).pass,
      false,
    );
  }
});
test("ignores heredoc data but audits commands after its terminator", () => {
  assert.equal(
    evaluateRuntimeCompliance(
      trace("cat <<'JSON'\npython3 is data\nJSON\npython3 bad.py"),
    ).pass,
    false,
  );
});
test("successful script evidence accepts quoted paths, env, options, cd, and multiline &&", () => {
  const events = [
    ...trace(
      "cd '/task with spaces' &&\n env FOO=bar kowork-python -B '/skill/forms.py' fields report.pdf",
    ),
    { type: "tool-end", tool: "bash", callID: "shell", exitCode: 0 },
  ];
  const [step] = scriptSteps(completedCalls(events), "/task");
  assert.equal(step.cwd, "/task with spaces");
  assert.equal(step.script, "forms.py");
  assert.deepEqual(step.argv, ["fields", "report.pdf"]);
});
test("script names mentioned in output do not count as execution", () => {
  const events = [
    ...trace("echo 'kowork-python /skill/validate.py output.pdf'"),
    { type: "tool-end", tool: "bash", callID: "shell", exitCode: 0 },
  ];
  assert.deepEqual(scriptSteps(completedCalls(events), "/task"), []);
});

test("approved temporary paths reject root files, other sessions, missing files, and symlink escapes", async () => {
  const {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    symlinkSync,
    rmSync,
    realpathSync,
  } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { approvedTaskPath } = await import("./workflow.mjs");
  const root = mkdtempSync(join(tmpdir(), "kowork-pdf-path-test-"));
  try {
    const approvedTempRoot = join(root, "approved");
    const sessionId = "ses_1234";
    const session = join(approvedTempRoot, sessionId);
    const task = join(session, "task with spaces");
    mkdirSync(task, { recursive: true });
    const valid = join(task, "values.json");
    writeFileSync(valid, "{}");
    const direct = join(session, "values.json");
    writeFileSync(direct, "{}");
    const outside = join(root, "outside.json");
    writeFileSync(outside, "{}");
    const other = join(approvedTempRoot, "ses_other", "task", "values.json");
    mkdirSync(join(approvedTempRoot, "ses_other", "task"), { recursive: true });
    writeFileSync(other, "{}");
    const escape = join(task, "escape.json");
    symlinkSync(outside, escape);
    const alias = join(task, "alias.json");
    symlinkSync(valid, alias);
    const config = { approvedTempRoot, sessionId };
    assert.equal(approvedTaskPath(config, valid), true);
    assert.equal(approvedTaskPath(config, realpathSync(valid)), true);
    assert.equal(approvedTaskPath(config, alias), true);
    for (const wrong of [
      session,
      direct,
      outside,
      other,
      escape,
      join(task, "missing.json"),
    ])
      assert.equal(approvedTaskPath(config, wrong), false);
    assert.equal(approvedTaskPath({}, valid), false);
    const escapingSession = join(approvedTempRoot, "ses_escape");
    symlinkSync(root, escapingSession);
    assert.equal(
      approvedTaskPath(
        { approvedTempRoot, sessionId: "ses_escape" },
        join(
          escapingSession,
          "approved",
          sessionId,
          "task with spaces",
          "values.json",
        ),
      ),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("negated interpreter calls cannot prove successful validation", () => {
  const events = [
    ...trace("! kowork-python /skill/validate.py output.pdf"),
    { type: "tool-end", tool: "bash", callID: "shell", exitCode: 0 },
  ];
  assert.deepEqual(scriptSteps(completedCalls(events), "/task"), []);
});

test("resolves constant variables within a successful shell call", () => {
  const events = [
    ...trace(
      'S="/skill" && T="/task with spaces" && kowork-python "$S/forms.py" fill input.pdf "${T}/values.json" -o output.pdf',
    ),
    { type: "tool-end", tool: "bash", callID: "shell", exitCode: 0 },
  ];
  const [step] = scriptSteps(completedCalls(events), "/task");
  assert.equal(step.scriptPath, "/skill/forms.py");
  assert.deepEqual(step.argv, [
    "fill",
    "input.pdf",
    "/task with spaces/values.json",
    "-o",
    "output.pdf",
  ]);
});
test("runtime auditing catches an interpreter invoked through a constant variable", () => {
  assert.equal(
    evaluateRuntimeCompliance(trace('P=python3 && "$P" script.py')).pass,
    false,
  );
});
test("single quotes and escaped dollar signs remain literal", () => {
  for (const literal of ["'$T/values.json'", '"\\$T/values.json"']) {
    const events = [
      ...trace(
        `T=/temp && kowork-python forms.py fill input.pdf ${literal} -o output.pdf`,
      ),
      { type: "tool-end", tool: "bash", callID: "shell", exitCode: 0 },
    ];
    assert.equal(
      scriptSteps(completedCalls(events), "/task")[0].argv[2],
      "$T/values.json",
    );
  }
});
test("variables are not inherited from a different shell tool call", () => {
  const events = [
    ...trace("S=/skill"),
    { type: "tool-end", tool: "bash", callID: "shell", exitCode: 0 },
    {
      type: "tool-start",
      tool: "bash",
      callID: "second",
      args: { command: 'kowork-python "$S/forms.py" fields input.pdf' },
    },
    { type: "tool-end", tool: "bash", callID: "second", exitCode: 0 },
  ];
  assert.equal(
    scriptSteps(completedCalls(events), "/task")[0].scriptPath,
    "/task/$S/forms.py",
  );
});
