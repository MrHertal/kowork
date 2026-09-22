import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import { readEvidence } from "../../trace-assertions.mjs";

function result(pass, reason) {
  return { pass, score: pass ? 1 : 0, reason };
}

function within(parent, child) {
  const rel = relative(parent, child);
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  );
}

function completedCall(events, startIndex) {
  const start = events[startIndex];
  const endIndex = events.findIndex(
    (event, index) =>
      index > startIndex &&
      event.type === "tool-end" &&
      event.tool === start.tool &&
      event.callID === start.callID,
  );
  return endIndex < 0
    ? null
    : { start, startIndex, end: events[endIndex], endIndex };
}

export function evaluateCreationWorkflow({
  events,
  sessionId,
  approvedTempRoot,
  quarterlyPath,
  finalAnswer,
}) {
  if (!/^ses_[a-zA-Z0-9]+$/.test(sessionId ?? ""))
    return result(false, "Missing PDF creation session ID.");
  if (!isAbsolute(approvedTempRoot ?? "") || !isAbsolute(quarterlyPath ?? ""))
    return result(false, "Missing absolute evaluation paths.");
  const sessionTemp = join(approvedTempRoot, sessionId);
  if (!existsSync(sessionTemp))
    return result(
      false,
      "The pre-approved session temporary directory was not created.",
    );

  const scripts = readdirSync(sessionTemp, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(sessionTemp, entry.name, "create_pdf.py"))
    .filter((file) => existsSync(file) && statSync(file).isFile())
    .filter((file) => within(realpathSync(sessionTemp), realpathSync(file)));
  if (!scripts.length)
    return result(
      false,
      "No retained create_pdf.py was found in a child of the approved session directory.",
    );

  const taskFolder = dirname(quarterlyPath);
  if (existsSync(join(taskFolder, "create_pdf.py")))
    return result(
      false,
      "The working create_pdf.py was placed in the task output folder.",
    );
  for (const event of events) {
    if (event.type !== "tool-start" || !["write", "edit"].includes(event.tool))
      continue;
    const filePath = event.args?.filePath;
    if (typeof filePath !== "string" || basename(filePath) !== "create_pdf.py")
      continue;
    if (!scripts.some((script) => resolve(filePath) === resolve(script)))
      return result(
        false,
        "A create_pdf.py edit targeted a path outside the approved working directory.",
      );
  }

  const calls = events.flatMap((event, index) =>
    event.type === "tool-start"
      ? [completedCall(events, index)].filter(Boolean)
      : [],
  );
  const python = /(?:^|[;&|]\s*)\s*kowork-python(?:\.cmd)?(?:\s|$)/;
  const create = calls.find(
    (call) =>
      call.start.tool === "bash" &&
      call.end.exitCode === 0 &&
      python.test(call.start.args?.command ?? "") &&
      scripts.some(
        (script) =>
          call.start.args.command.includes(script) ||
          (resolve(call.start.args?.workdir ?? taskFolder) ===
            dirname(script) &&
            /create_pdf\.py(?:[\s"']|$)/.test(call.start.args.command)),
      ) &&
      /quarterly\.pdf(?:[\s"']|$)/.test(call.start.args.command),
  );
  if (!create)
    return result(
      false,
      "No successful kowork-python call ran the approved working script to create quarterly.pdf.",
    );
  if (!existsSync(quarterlyPath) || !statSync(quarterlyPath).isFile())
    return result(
      false,
      "quarterly.pdf was not created in the task output folder.",
    );

  const validate = calls.find(
    (call) =>
      (call.startIndex > create.endIndex ||
        (call.startIndex === create.startIndex &&
          call.start.args.command.indexOf("validate.py") >
            call.start.args.command.indexOf("create_pdf.py") &&
          call.start.args.command
            .slice(
              call.start.args.command.indexOf("create_pdf.py"),
              call.start.args.command.indexOf("validate.py"),
            )
            .includes("&&"))) &&
      call.start.tool === "bash" &&
      call.end.exitCode === 0 &&
      python.test(call.start.args?.command ?? "") &&
      /validate\.py(?:[\s"']|$)/.test(call.start.args.command) &&
      /quarterly\.pdf(?:[\s"']|$)/.test(call.start.args.command) &&
      !/(?:^|\s)--no-render(?:\s|$)/.test(call.start.args.command),
  );
  if (!validate)
    return result(
      false,
      "The generated PDF was not successfully render-validated before presentation.",
    );

  const presentations = events.flatMap((event, index) =>
    event.type === "tool-start" && event.tool === "present_files"
      ? [
          {
            ...event,
            startIndex: index,
            completion: completedCall(events, index),
          },
        ]
      : [],
  );
  if (
    presentations.length !== 1 ||
    presentations[0].completion?.startIndex <= validate.endIndex ||
    !presentations[0].completion ||
    presentations[0].args?.files?.length !== 1 ||
    !existsSync(presentations[0].args.files[0]?.path ?? "") ||
    realpathSync(presentations[0].args.files[0].path) !==
      realpathSync(quarterlyPath)
  )
    return result(
      false,
      "Expected one successful present_files call with only the final PDF, after validation.",
    );

  const finalIndex = events.findLastIndex(
    (event) =>
      event.type === "text" &&
      event.messageID === finalAnswer?.messageID &&
      event.partID === finalAnswer?.partID,
  );
  if (finalIndex <= presentations[0].completion.endIndex)
    return result(
      false,
      "The final answer did not follow successful PDF presentation.",
    );
  return result(
    true,
    "The PDF was created from an approved working script, validated, and presented.",
  );
}

export function creationWorkflow(_output, context) {
  const evidence = readEvidence(context);
  if (evidence.error)
    return result(false, `Provider error: ${JSON.stringify(evidence.error)}`);
  return evaluateCreationWorkflow({
    events: evidence.events,
    sessionId: context.providerResponse.sessionId,
    approvedTempRoot: process.env.KOWORK_EVAL_APPROVED_TEMP_ROOT,
    quarterlyPath: context.vars?.quarterlyPath,
    finalAnswer: evidence.finalAnswer,
  });
}

export function createdPdfHasRequestedContent(_output, context) {
  const quarterlyPath = context.vars?.quarterlyPath;
  const python = process.env.KOWORK_EVAL_PYTHON_EXE;
  if (typeof quarterlyPath !== "string" || !python)
    throw new Error("Missing generated PDF path or bundled Python interpreter");
  if (!existsSync(quarterlyPath))
    return result(false, "quarterly.pdf is missing.");

  const inspection = spawnSync(
    python,
    [
      "-c",
      `import json, sys, pdfplumber
with pdfplumber.open(sys.argv[1]) as pdf:
    print(json.dumps({"text": "\\n".join(page.extract_text() or "" for page in pdf.pages),
                      "tables": [table for page in pdf.pages for table in page.extract_tables()]}))`,
      quarterlyPath,
    ],
    { encoding: "utf8", timeout: 20_000 },
  );
  if (inspection.status !== 0)
    return result(
      false,
      `Could not inspect PDF content: ${inspection.stderr?.trim() || inspection.error?.message || "unknown error"}`,
    );
  let document;
  try {
    document = JSON.parse(inspection.stdout);
  } catch {
    return result(false, "PDF content inspection returned invalid JSON.");
  }
  return evaluateCreatedPdfContent(document);
}

export function evaluateCreatedPdfContent(document) {
  const text = String(document.text ?? "");
  const table = document.tables?.find(
    (rows) =>
      rows.length === 3 &&
      ["item", "units", "revenue"].every((name, index) =>
        String(rows[0]?.[index] ?? "")
          .toLowerCase()
          .includes(name),
      ) &&
      rows
        .slice(1)
        .every(
          (row) =>
            row.length >= 3 &&
            row.slice(0, 3).every((cell) => String(cell ?? "").trim()),
        ),
  );
  const summary = text
    .replaceAll("\n", " ")
    .split(/(?<=[.!?])\s+/)
    .some(
      (sentence) =>
        sentence.trim().split(/\s+/).length >= 8 && /[.!?]\s*$/.test(sentence),
    );
  const pass = /Quarterly Report/i.test(text) && !!table && summary;
  return result(
    pass,
    pass
      ? "The PDF contains the title, a three-row Item/Units/Revenue table, and a summary paragraph."
      : "The PDF needs the requested title, three-row Item/Units/Revenue table, and summary paragraph.",
  );
}

export function containsRevenueByItem(output) {
  const normalized = String(output).replaceAll(",", "");
  const widgets = /widgets[\s\S]{0,120}(?:\$\s*)?2400/i.test(normalized);
  const gadgets = /gadgets[\s\S]{0,120}(?:\$\s*)?1600/i.test(normalized);
  const pass = widgets && gadgets;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? "The answer reports the expected revenue for Widgets and Gadgets."
      : "Expected Widgets revenue of $2,400 and Gadgets revenue of $1,600.",
  };
}

export function reportIsUnchanged(_output, context) {
  const reportPath = context.vars?.reportPath;
  const expected = context.vars?.reportSha256;
  if (typeof reportPath !== "string" || typeof expected !== "string") {
    throw new Error("Missing report path or expected checksum");
  }
  const actual = createHash("sha256")
    .update(readFileSync(reportPath))
    .digest("hex");
  const pass = actual === expected;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? "The source report remained unchanged."
      : `The source report changed (expected ${expected}, received ${actual}).`,
  };
}
