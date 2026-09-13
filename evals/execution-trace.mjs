import { appendFileSync } from "node:fs";
import { join } from "node:path";

export default async () => {
  const directory = process.env.KOWORK_EVAL_TRACE_DIR;
  if (!directory) throw new Error("Missing evaluation trace directory");

  function record(sessionID, event) {
    if (!/^ses_[a-zA-Z0-9]+$/.test(sessionID))
      throw new Error("Invalid evaluation session ID");
    appendFileSync(
      join(directory, `${sessionID}.jsonl`),
      `${JSON.stringify(event)}\n`,
    );
  }

  return {
    "tool.execute.before": ({ sessionID, tool, callID }, { args }) => {
      record(sessionID, { type: "tool-start", tool, callID, args });
    },
    "tool.execute.after": ({ sessionID, tool, callID }, result) => {
      record(sessionID, {
        type: "tool-end",
        tool,
        callID,
        outputLength:
          typeof result.output === "string" ? result.output.length : 0,
      });
    },
    "experimental.text.complete": (
      { sessionID, messageID, partID },
      _output,
    ) => {
      record(sessionID, { type: "text", messageID, partID });
    },
  };
};
