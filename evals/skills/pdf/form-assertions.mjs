import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { readEvidence } from "../../trace-assertions.mjs";

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason });

function completedCalls(events) {
  return events.flatMap((start, startIndex) => {
    if (start.type !== "tool-start") return [];
    const endIndex = events.findIndex(
      (end, index) =>
        index > startIndex &&
        end.type === "tool-end" &&
        end.tool === start.tool &&
        end.callID === start.callID,
    );
    return endIndex < 0
      ? []
      : [{ start, startIndex, end: events[endIndex], endIndex }];
  });
}

// Recognize script invocations rather than requiring a particular quoting style,
// absolute script path, JSON filename, or one tool call per command. Only &&
// chains prove that earlier steps succeeded from the shell's final exit status.
function scriptSteps(calls, taskFolder) {
  return calls.flatMap((call) => {
    if (call.start.tool !== "bash" || call.end.exitCode !== 0) return [];
    const tokens =
      (call.start.args?.command ?? "")
        .trim()
        .match(/(?:[^\s"';&|]+|"[^"]*"|'[^']*')+|&&|[;&|\n]/g) ?? [];
    // A later command can hide an earlier failure with these separators.
    // Ignore only line breaks continuing an && chain.
    if (
      tokens.some(
        (token, i) =>
          /^[;&|\n]$/.test(token) &&
          !(
            token === "\n" &&
            (tokens[i - 1] === "&&" || tokens[i + 1] === "&&")
          ),
      )
    )
      return [];
    const segments = [[]];
    for (const token of tokens) {
      if (token === "&&") segments.push([]);
      else if (token !== "\n")
        segments.at(-1).push(token.replace(/(["'])(.*?)\1/g, "$2"));
    }
    let cwd = resolve(taskFolder, call.start.args?.workdir ?? taskFolder);
    return segments.flatMap((argv, step) => {
      if (argv[0] === "cd" && argv.length === 2) {
        cwd = resolve(cwd, argv[1]);
        return [];
      }
      if (!/^kowork-python(?:\.cmd)?$/.test(basename(argv[0] ?? ""))) return [];
      let index = 1;
      while (["-B", "-u"].includes(argv[index])) index++;
      if (
        !["forms.py", "render.py", "validate.py"].includes(
          basename(argv[index] ?? ""),
        )
      )
        return [];
      return [
        {
          ...call,
          step,
          script: basename(argv[index]),
          argv: argv.slice(index + 1),
          cwd,
        },
      ];
    });
  });
}

function before(a, b) {
  return a.startIndex === b.startIndex
    ? a.step < b.step
    : a.endIndex < b.startIndex;
}
function targets(step, argument, path) {
  return (
    typeof argument === "string" &&
    resolve(step.cwd, argument) === resolve(path)
  );
}
function sameFile(a, b) {
  return (
    typeof a === "string" &&
    existsSync(a) &&
    existsSync(b) &&
    realpathSync(a) === realpathSync(b)
  );
}

export function evaluateFormWorkflow({
  events,
  formPath,
  filledPath,
  finalAnswer,
}) {
  if (!isAbsolute(formPath ?? "") || !isAbsolute(filledPath ?? ""))
    return result(false, "Missing absolute form evaluation paths.");
  const calls = completedCalls(events);
  const steps = scriptSteps(calls, dirname(formPath));
  const fills = steps.filter(
    (s) =>
      s.script === "forms.py" &&
      s.argv[0] === "fill" &&
      targets(s, s.argv[1], formPath) &&
      s.argv.some(
        (arg, i) =>
          (["-o", "--out"].includes(arg) &&
            targets(s, s.argv[i + 1], filledPath)) ||
          (arg.startsWith("--out=") && targets(s, arg.slice(6), filledPath)),
      ),
  );
  const fill = fills.at(-1);
  const discovered =
    fill &&
    steps.some(
      (s) =>
        s.script === "forms.py" &&
        ["info", "inspect", "fields"].includes(s.argv[0]) &&
        targets(s, s.argv[1], formPath) &&
        before(s, fill),
    );
  if (!discovered)
    return result(
      false,
      "Expected successful field discovery on the source before filling the output.",
    );

  const validate = steps.find(
    (s) =>
      s.script === "validate.py" &&
      targets(s, s.argv[0], filledPath) &&
      !s.argv.some((arg) => /^--(?:no-render|pages)(?:=|$)/.test(arg)) &&
      before(fill, s),
  );
  if (!validate)
    return result(
      false,
      "The filled PDF was not successfully validated with full rendering after filling.",
    );

  const presentations = events.filter(
    (e) => e.type === "tool-start" && e.tool === "present_files",
  );
  const present = calls.find((c) => c.start === presentations[0]);
  if (
    presentations.length !== 1 ||
    !present ||
    present.startIndex <= validate.endIndex ||
    present.start.args?.files?.length !== 1 ||
    !sameFile(present.start.args.files[0]?.path, filledPath)
  )
    return result(
      false,
      "Expected one successful presentation of only application-filled.pdf after validation.",
    );

  const inspectedPreview = steps.some((s) => {
    if (
      s.script !== "render.py" ||
      !targets(s, s.argv[0], filledPath) ||
      !before(fill, s)
    )
      return false;
    const previewDir = resolve(s.cwd, s.argv[1] ?? "");
    return calls.some((c) => {
      const image = c.start.args?.filePath;
      return (
        c.start.tool === "read" &&
        c.startIndex > s.endIndex &&
        c.endIndex < present.startIndex &&
        c.end.outputLength > 0 &&
        typeof image === "string" &&
        [
          join(previewDir, "page_001.png"),
          join(previewDir, "page_001.jpg"),
        ].some((p) => sameFile(image, p))
      );
    });
  });
  if (!inspectedPreview)
    return result(
      false,
      "No successful Read of a rendered filled-output preview before presentation.",
    );
  const finalIndex = events.findLastIndex(
    (e) =>
      e.type === "text" &&
      e.messageID === finalAnswer?.messageID &&
      e.partID === finalAnswer?.partID,
  );
  if (finalIndex <= present.endIndex)
    return result(
      false,
      "The final answer did not follow successful presentation.",
    );
  return result(
    true,
    "Discovered fields, filled, inspected a rendered preview, validated, and presented the final PDF.",
  );
}

export function formWorkflow(_output, context) {
  const evidence = readEvidence(context);
  if (evidence.error)
    return result(false, `Provider error: ${JSON.stringify(evidence.error)}`);
  return evaluateFormWorkflow({
    ...evidence,
    formPath: context.vars?.formPath,
    filledPath: context.vars?.filledPath,
  });
}

// Inspect /V directly, independently of the skill's fields command or page text.
export function inspectStoredFormValues(python, filledPath) {
  const inspection = spawnSync(
    python,
    [
      "-c",
      `import json, sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
fields = reader.get_fields() or {}
print(json.dumps({name: {"type": str(field.get("/FT", "")),
                         "flags": int(field.get("/Ff", 0)),
                         "value": str(field["/V"]) if "/V" in field else None}
                  for name, field in fields.items()}))`,
      filledPath,
    ],
    { encoding: "utf8", timeout: 20_000 },
  );
  if (inspection.status !== 0)
    return {
      error:
        inspection.stderr?.trim() ||
        inspection.error?.message ||
        "PDF inspection failed",
    };
  try {
    return { fields: JSON.parse(inspection.stdout) };
  } catch {
    return { error: "PDF inspection returned invalid JSON" };
  }
}

export function evaluateStoredFormValues(fields) {
  const pass =
    fields?.full_name?.type === "/Tx" &&
    fields.full_name.value === "Dana Lee" &&
    fields?.subscribe?.type === "/Btn" &&
    !(fields.subscribe.flags & ((1 << 15) | (1 << 16))) &&
    fields.subscribe.value === "/Yes" &&
    fields?.plan?.type === "/Btn" &&
    !!(fields.plan.flags & (1 << 15)) &&
    fields.plan.value === "/Pro";
  return result(
    pass,
    pass
      ? "Stored AcroForm values are Dana Lee, subscribed, and Pro."
      : "Expected real text, checkbox, and radio fields with stored values Dana Lee, /Yes, and /Pro.",
  );
}

export function filledFormHasRequestedValues(_output, context) {
  const { formPath, formSha256, filledPath } = context.vars ?? {};
  const python = process.env.KOWORK_EVAL_PYTHON_EXE;
  if (
    ![formPath, formSha256, filledPath, python].every(
      (v) => typeof v === "string" && v,
    )
  )
    throw new Error(
      "Missing form paths, checksum, or bundled Python interpreter",
    );
  if (!existsSync(formPath))
    return result(false, "The source application form is missing.");
  if (
    createHash("sha256").update(readFileSync(formPath)).digest("hex") !==
    formSha256
  )
    return result(false, "The source application form changed.");
  if (!existsSync(filledPath))
    return result(false, "application-filled.pdf is missing.");
  const inspection = inspectStoredFormValues(python, filledPath);
  if (inspection.error)
    return result(
      false,
      `Could not inspect stored PDF fields: ${inspection.error}`,
    );
  return evaluateStoredFormValues(inspection.fields);
}
