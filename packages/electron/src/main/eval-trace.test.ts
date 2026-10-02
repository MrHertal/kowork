import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readEvidence, toolUsed } from "../../../../evals/trace-assertions.mjs";

const originalDirectory = process.env.KOWORK_EVAL_TRACE_DIR;
let directory: string | undefined;
afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  if (originalDirectory === undefined) delete process.env.KOWORK_EVAL_TRACE_DIR;
  else process.env.KOWORK_EVAL_TRACE_DIR = originalDirectory;
});

function context(raw: unknown) {
  directory = mkdtempSync(join(tmpdir(), "kowork-trace-test-"));
  process.env.KOWORK_EVAL_TRACE_DIR = directory;
  return {
    providerResponse: { sessionId: "ses_1234", raw: JSON.stringify(raw) },
  };
}

describe("evaluation trace responses", () => {
  it("reports an SDK transport error without crashing the assertion", () => {
    const result = toolUsed(
      "",
      context({ error: {}, request: { timeout: false } }),
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("Provider error");
  });

  it("reports a malformed response without an assistant message", () => {
    expect(readEvidence(context({ data: {} })).error).toBe(
      "OpenCode response contains no assistant message",
    );
  });

  it("retains tool evidence and final answer for a valid response", () => {
    const input = context({
      data: {
        info: { id: "msg_1" },
        parts: [
          { id: "part_1", messageID: "msg_1", type: "text", text: "Done" },
        ],
      },
    });
    writeFileSync(
      join(directory!, "ses_1234.jsonl"),
      JSON.stringify({
        type: "tool-end",
        tool: "webfetch",
        callID: "call_1",
      }) + "\n",
    );
    const evidence = readEvidence(input);
    expect(evidence.error).toBeUndefined();
    expect(evidence.events).toHaveLength(1);
    expect(evidence.finalAnswer).toEqual({
      messageID: "msg_1",
      partID: "part_1",
    });
  });
});
