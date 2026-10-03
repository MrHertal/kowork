import { existsSync, realpathSync } from "node:fs";
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

export const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason });

export function completedCalls(events) {
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

// Only visible shell invocations are evidence. Heredoc contents are data/code,
// not separate shell commands; quoted prose must not look like a runtime call.
function heredocDelimiters(line) {
  const delimiters = [];
  let quote;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && quote !== "'") {
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) break;
    const match = line.slice(i).match(/^<<(-?)\s*(['"]?)([A-Za-z_]\w*)\2/);
    if (match) {
      delimiters.push(match);
      i += match[0].length - 1;
    } else if (ch === "'" || ch === '"') quote = ch;
  }
  return delimiters;
}
function shellTokens(command) {
  const lines = command.split("\n");
  const headers = [];
  for (let i = 0; i < lines.length; i++) {
    headers.push(lines[i]);
    const delimiters = heredocDelimiters(lines[i]);
    for (const [, tabs, , delimiter] of delimiters) {
      while (
        ++i < lines.length &&
        (tabs ? lines[i].replace(/^\t+/, "") : lines[i]) !== delimiter
      ) {}
    }
  }
  const source = headers.join("\n");
  const tokens = [];
  let value = "",
    active = false,
    quote,
    parts = [];
  const append = (text, expand = quote !== "'") => {
    value += text;
    const last = parts.at(-1);
    if (last?.expand === expand) last.text += text;
    else parts.push({ text, expand });
  };
  const flush = () => {
    if (active) tokens.push({ value, parts });
    value = "";
    active = false;
    parts = [];
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      else if (
        ch === "\\" &&
        quote === '"' &&
        /["\\$`\n]/.test(source[i + 1] ?? "")
      )
        append(source[++i], false);
      else append(ch);
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      active = true;
    } else if (ch === "\\") {
      if (source[i + 1] === "\n") i++;
      else {
        append(source[++i] ?? "", false);
        active = true;
      }
    } else if (ch === "#" && !active) {
      while (i < source.length && source[i] !== "\n") i++;
      i--;
    } else if (/[;&|()\n]/.test(ch)) {
      flush();
      let operator = ch;
      if ((ch === "&" || ch === "|") && source[i + 1] === ch)
        operator += source[++i];
      tokens.push({ operator });
    } else if (/\s/.test(ch)) flush();
    else {
      append(ch);
      active = true;
    }
  }
  flush();
  return tokens;
}

function segments(command) {
  const tokens = shellTokens(command.trim());
  const commands = [{ words: [] }];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (
      token.operator === "\n" &&
      (tokens[i - 1]?.operator === "&&" || tokens[i + 1]?.operator === "&&")
    )
      continue;
    if (token.operator) commands.push({ words: [], connector: token.operator });
    else commands.at(-1).words.push(token);
  }
  // Resolve constant assignments only within this shell call. Unknown variables,
  // substitutions, and expansions remain unresolved; single quotes stay literal.
  const variables = new Map();
  return commands
    .filter((command) => command.words.length)
    .map(({ words, connector }) => {
      const argv = words.map((word) =>
        word.parts
          .map((part) =>
            !part.expand
              ? part.text
              : part.text.replace(
                  /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g,
                  (match, braced, simple) =>
                    variables.get(braced ?? simple) ?? match,
                ),
          )
          .join(""),
      );
      const assignments = argv[0] === "export" ? argv.slice(1) : argv;
      if (assignments.every((arg) => /^[A-Za-z_]\w*=/.test(arg))) {
        for (const assignment of assignments) {
          const index = assignment.indexOf("=");
          variables.set(
            assignment.slice(0, index),
            assignment.slice(index + 1),
          );
        }
      }
      return { argv, connector };
    });
}

function executableArgs(argv) {
  let args = argv.slice();
  while (["if", "elif", "then", "else", "do", "!"].includes(args[0]))
    args.shift();
  while (/^[A-Za-z_]\w*=/.test(args[0] ?? "")) args.shift();
  if (basename(args[0] ?? "") === "env") {
    args.shift();
    while (args.length) {
      if (["-u", "--unset"].includes(args[0])) args.splice(0, 2);
      else if (
        /^[A-Za-z_]\w*=/.test(args[0]) ||
        ["-i", "--ignore-environment", "--"].includes(args[0]) ||
        args[0].startsWith("--unset=")
      )
        args.shift();
      else break;
    }
  }
  if (basename(args[0] ?? "") === "command") {
    args.shift();
    while (["--", "-p"].includes(args[0])) args.shift();
  }
  if (basename(args[0] ?? "") === "timeout") {
    args.shift();
    while (args[0]?.startsWith("-")) {
      if (["-s", "--signal", "-k", "--kill-after"].includes(args[0]))
        args.splice(0, 2);
      else args.shift();
    }
    args.shift();
  }
  if (basename(args[0] ?? "") === "nice") {
    args.shift();
    if (["-n", "--adjustment"].includes(args[0])) args.splice(0, 2);
    else if (args[0]?.startsWith("-")) args.shift();
  }
  return args;
}

const externalPdfTools = new Set([
  "qpdf",
  "pdftk",
  "gs",
  "ghostscript",
  "pdftoppm",
  "pdftocairo",
  "pdftotext",
  "pdfinfo",
  "pdfimages",
  "mutool",
  "tesseract",
  "soffice",
  "libreoffice",
  "magick",
]);
function prohibitedInvocation(command, depth = 0) {
  if (depth > 4) return null;
  for (const { argv } of segments(command)) {
    const args = executableArgs(argv);
    const name = basename(args[0] ?? "")
      .toLowerCase()
      .replace(/\.(?:exe|cmd)$/, "");
    if (/^(?:python(?:\d+(?:\.\d+)*)?|py|node(?:js)?)$/.test(name))
      return `Disallowed runtime invocation: ${name}; use Kowork's bundled launcher.`;
    if (externalPdfTools.has(name))
      return `An external PDF utility was invoked: ${name}.`;
    if (["bash", "sh", "zsh", "dash"].includes(name)) {
      const flag = args.findIndex((arg) => /^-[a-z]*c[a-z]*$/.test(arg));
      if (flag >= 0 && args[flag + 1]) {
        const violation = prohibitedInvocation(args[flag + 1], depth + 1);
        if (violation) return violation;
      }
    }
  }
  return null;
}

export function evaluateRuntimeCompliance(events) {
  for (const event of events) {
    if (event.type !== "tool-start" || event.tool !== "bash") continue;
    const violation = prohibitedInvocation(event.args?.command ?? "");
    if (violation) return result(false, violation);
  }
  return result(
    true,
    "No visible disallowed runtime or external PDF utility invocation.",
  );
}
export function runtimeCompliance(_output, context) {
  const evidence = readEvidence(context);
  if (evidence.error)
    return result(false, `Provider error: ${JSON.stringify(evidence.error)}`);
  return evaluateRuntimeCompliance(evidence.events);
}

// Successful separate calls and && chains prove each step's exit status.
// Other shell control flow cannot establish that from the existing trace.
export function scriptSteps(calls, taskFolder) {
  return calls.flatMap((call) => {
    if (call.start.tool !== "bash" || call.end.exitCode !== 0) return [];
    const commands = segments(call.start.args?.command ?? "");
    if (commands.some((c) => c.connector && c.connector !== "&&")) return [];
    let cwd = resolve(taskFolder, call.start.args?.workdir ?? taskFolder);
    return commands.flatMap(({ argv }, step) => {
      if (["!", "if", "elif", "then", "else", "do"].includes(argv[0]))
        return [];
      const args = executableArgs(argv);
      if (args[0] === "cd" && args.length === 2) {
        cwd = resolve(cwd, args[1]);
        return [];
      }
      if (!/^kowork-python(?:\.cmd)?$/.test(basename(args[0] ?? ""))) return [];
      let index = 1;
      while (["-B", "-u"].includes(args[index])) index++;
      if (!args[index]?.endsWith(".py")) return [];
      return [
        {
          ...call,
          step,
          script: basename(args[index]),
          scriptPath: resolve(cwd, args[index]),
          argv: args.slice(index + 1),
          cwd,
        },
      ];
    });
  });
}
export function before(a, b) {
  return a.startIndex === b.startIndex
    ? a.step < b.step
    : a.endIndex < b.startIndex;
}
export function sameFile(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    existsSync(a) &&
    existsSync(b) &&
    realpathSync(a) === realpathSync(b)
  );
}
export function targets(step, arg, file) {
  return (
    typeof arg === "string" &&
    (resolve(step.cwd, arg) === resolve(file) ||
      sameFile(resolve(step.cwd, arg), file))
  );
}
export function optionValue(argv, names) {
  for (let i = 0; i < argv.length; i++) {
    if (names.includes(argv[i])) return argv[i + 1];
    for (const name of names)
      if (argv[i].startsWith(`${name}=`)) return argv[i].slice(name.length + 1);
  }
}
export function positionals(step) {
  const takesValue = new Set([
    "-o",
    "--out",
    "--pages",
    "--dpi",
    "--scale",
    "--format",
    "--jpeg-quality",
    "--password",
  ]);
  const args = [];
  for (let i = 0; i < step.argv.length; i++) {
    const arg = step.argv[i];
    if (takesValue.has(arg)) i++;
    else if (!arg.startsWith("--")) args.push(arg);
  }
  return args;
}
function inside(parent, child) {
  const rel = relative(parent, child);
  return rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
export function approvedTaskPath({ approvedTempRoot, sessionId }, file) {
  if (
    !isAbsolute(approvedTempRoot ?? "") ||
    !/^ses_[a-zA-Z0-9]+$/.test(sessionId ?? "") ||
    !existsSync(file)
  )
    return false;
  const sessionRoot = join(approvedTempRoot, sessionId);
  if (
    !existsSync(sessionRoot) ||
    !inside(realpathSync(approvedTempRoot), realpathSync(sessionRoot))
  )
    return false;
  const canonical = realpathSync(file);
  const rel = relative(realpathSync(sessionRoot), canonical);
  return (
    !!inside(realpathSync(sessionRoot), canonical) && rel.split(sep).length >= 2
  );
}

export function fullValidation(steps, mutation, outputPath) {
  return steps.find(
    (s) =>
      s.script === "validate.py" &&
      targets(s, positionals(s)[0], outputPath) &&
      !s.argv.some((arg) => {
        const flag = arg.split("=")[0];
        return (
          flag.length > 2 &&
          flag.startsWith("--") &&
          ["--no-render", "--pages"].some((name) => name.startsWith(flag))
        );
      }) &&
      before(mutation, s),
  );
}

export function inspectOutputPreview({
  calls,
  steps,
  mutation,
  outputPath,
  presentation,
  approvedTempRoot,
  sessionId,
}) {
  const renders = steps.filter(
    (s) =>
      s.script === "render.py" &&
      targets(s, positionals(s)[0], outputPath) &&
      before(mutation, s),
  );
  if (!renders.length)
    return result(
      false,
      "No successful render of the final PDF after its last modification.",
    );
  for (const render of renders) {
    const previewDir = resolve(render.cwd, positionals(render)[1] ?? "");
    if (!approvedTaskPath({ approvedTempRoot, sessionId }, previewDir))
      return result(
        false,
        "PDF previews must be inside a task directory under the approved session temporary directory.",
      );
  }
  const inspected = renders.some((render) =>
    calls.some((call) => {
      const image = call.start.args?.filePath;
      if (
        call.start.tool !== "read" ||
        call.startIndex <= render.endIndex ||
        call.endIndex >= presentation.startIndex ||
        !(call.end.outputLength > 0) ||
        typeof image !== "string" ||
        !existsSync(image)
      )
        return false;
      const name = basename(image);
      if (
        !/^page_\d{3,}\.(?:png|jpg)$/.test(name) ||
        !sameFile(
          dirname(image),
          resolve(render.cwd, positionals(render)[1] ?? ""),
        ) ||
        !approvedTaskPath({ approvedTempRoot, sessionId }, image)
      )
        return false;
      const selection = optionValue(render.argv, ["--pages"]);
      const page = Number(name.match(/\d+/)[0]);
      return (
        !selection ||
        selection.split(",").some((range) => {
          const [first, last = first] = range.split("-").map(Number);
          return page >= first && page <= last;
        })
      );
    }),
  );
  return result(
    inspected,
    inspected
      ? "A rendered output preview was read before presentation."
      : "No successful Read of a rendered output preview before presentation.",
  );
}
