import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { readEvidence } from "../../trace-assertions.mjs";

import {
  approvedTaskPath,
  before,
  completedCalls,
  evaluateRuntimeCompliance,
  fullValidation,
  inspectOutputPreview,
  optionValue,
  positionals,
  result,
  sameFile,
  scriptSteps,
  targets,
} from "./workflow.mjs";

export function evaluateFormWorkflow({
  events,
  formPath,
  filledPath,
  finalAnswer,
  approvedTempRoot,
  sessionId,
}) {
  if (!isAbsolute(formPath ?? "") || !isAbsolute(filledPath ?? ""))
    return result(false, "Missing absolute form evaluation paths.");
  const runtime = evaluateRuntimeCompliance(events);
  if (!runtime.pass) return runtime;
  const calls = completedCalls(events);
  const steps = scriptSteps(calls, dirname(formPath));
  const fills = steps.filter(
    (s) =>
      s.script === "forms.py" &&
      positionals(s)[0] === "fill" &&
      targets(s, positionals(s)[1], formPath) &&
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
        ["info", "inspect", "fields"].includes(positionals(s)[0]) &&
        targets(s, positionals(s)[1], formPath) &&
        before(s, fill),
    );
  if (!discovered)
    return result(
      false,
      "Expected successful field discovery on the source before filling the output.",
    );

  const temporaryFiles = [
    ...fills.map((s) => resolve(s.cwd, positionals(s)[2] ?? "")),
    ...steps
      .filter((s) => s.script === "forms.py" && positionals(s)[0] === "fields")
      .map((s) => ({ step: s, output: optionValue(s.argv, ["-o", "--out"]) }))
      .filter(({ output }) => output !== undefined)
      .map(({ step, output }) => resolve(step.cwd, output)),
  ];
  for (const event of events) {
    if (
      event.type === "tool-start" &&
      ["write", "edit"].includes(event.tool) &&
      typeof event.args?.filePath === "string" &&
      event.args.filePath.endsWith(".json")
    )
      temporaryFiles.push(event.args.filePath);
  }
  if (
    temporaryFiles.some(
      (file) => !approvedTaskPath({ approvedTempRoot, sessionId }, file),
    )
  )
    return result(
      false,
      "Form JSON files must be retained inside a task directory under the approved session temporary directory.",
    );

  const validate = fullValidation(steps, fill, filledPath);
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

  const preview = inspectOutputPreview({
    calls,
    steps,
    mutation: fill,
    outputPath: filledPath,
    presentation: present,
    approvedTempRoot,
    sessionId,
  });
  if (!preview.pass) return preview;
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
    approvedTempRoot: process.env.KOWORK_EVAL_APPROVED_TEMP_ROOT,
    sessionId: context.providerResponse.sessionId,
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
