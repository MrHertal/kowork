import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateToolTrace,
  toolUsed,
} from "../../../../evals/trace-assertions.mjs";

const finalAnswer = { messageID: "msg_final", partID: "prt_final" };
const finalText = { type: "text" as const, ...finalAnswer };

describe("evaluateToolTrace", () => {
  it("accepts a successful call between progress text and the final answer", () => {
    const result = evaluateToolTrace(
      [
        { type: "text", messageID: "msg_progress", partID: "prt_progress" },
        {
          type: "tool-start",
          tool: "webfetch",
          callID: "call_1",
          args: {
            url: "https://getkowork.com/privacy/",
            format: "markdown",
          },
        },
        {
          type: "tool-end",
          tool: "webfetch",
          callID: "call_1",
          outputLength: 100,
        },
        finalText,
      ],
      {
        tool: "webfetch",
        args: { url: "https://getkowork.com/privacy/" },
        beforeFinalAnswer: true,
        nonEmptyOutput: true,
      },
      finalAnswer,
    );

    expect(result.pass).toBe(true);
  });

  it("rejects a successful call after the final answer", () => {
    const result = evaluateToolTrace(
      [
        finalText,
        {
          type: "tool-start",
          tool: "webfetch",
          callID: "call_1",
          args: { url: "https://getkowork.com/privacy/" },
        },
        {
          type: "tool-end",
          tool: "webfetch",
          callID: "call_1",
          outputLength: 100,
        },
      ],
      { tool: "webfetch", beforeFinalAnswer: true },
      finalAnswer,
    );

    expect(result.pass).toBe(false);
  });

  it("matches nested argument subsets", () => {
    const result = evaluateToolTrace(
      [
        {
          type: "tool-start",
          tool: "skill",
          callID: "call_1",
          args: { name: "documents", options: { mode: "edit", extra: true } },
        },
        {
          type: "tool-end",
          tool: "skill",
          callID: "call_1",
          outputLength: 20,
        },
      ],
      { tool: "skill", args: { options: { mode: "edit" } } },
    );

    expect(result.pass).toBe(true);
  });

  it("matches regular expressions in nested arguments", () => {
    const matches = (command: string) =>
      evaluateToolTrace(
        [
          {
            type: "tool-start",
            tool: "bash",
            callID: "call_1",
            args: { command },
          },
        ],
        {
          tool: "bash",
          status: "attempt",
          argsRegex: {
            command: String.raw`^\s*kowork-python(?:\.cmd)?(?:\s|$)`,
          },
        },
      ).pass;

    expect(matches("  kowork-python -c 'print(1)'")).toBe(true);
    expect(matches("kowork-python.cmd script.py")).toBe(true);
    expect(matches("echo kowork-python")).toBe(false);
    expect(matches("command -v kowork-python")).toBe(false);
  });

  it("can require a zero shell exit code", () => {
    const events = (exitCode: number) => [
      {
        type: "tool-start" as const,
        tool: "bash",
        callID: "call_1",
        args: { command: "kowork-python script.py" },
      },
      {
        type: "tool-end" as const,
        tool: "bash",
        callID: "call_1",
        outputLength: 10,
        exitCode,
      },
    ];
    const config = { tool: "bash", exitCode: 0 };

    expect(evaluateToolTrace(events(0), config).pass).toBe(true);
    expect(evaluateToolTrace(events(1), config).pass).toBe(false);
  });

  it("distinguishes command output from the shell placeholder", () => {
    const events = (commandOutput: boolean) => [
      {
        type: "tool-start" as const,
        tool: "bash",
        callID: "call_1",
        args: { command: "kowork-python script.py" },
      },
      {
        type: "tool-end" as const,
        tool: "bash",
        callID: "call_1",
        outputLength: 11,
        commandOutput,
      },
    ];
    const config = { tool: "bash", commandOutput: true };

    expect(evaluateToolTrace(events(true), config).pass).toBe(true);
    expect(evaluateToolTrace(events(false), config).pass).toBe(false);
  });

  it("distinguishes attempts, successes, and failures", () => {
    const events = [
      {
        type: "tool-start" as const,
        tool: "webfetch",
        callID: "call_failed",
        args: {},
      },
    ];

    expect(
      evaluateToolTrace(events, { tool: "webfetch", status: "attempt" }).pass,
    ).toBe(true);
    expect(
      evaluateToolTrace(events, { tool: "webfetch", status: "failure" }).pass,
    ).toBe(true);
    expect(
      evaluateToolTrace(events, { tool: "webfetch", status: "success" }).pass,
    ).toBe(false);
  });

  it("supports count bounds and forbidden calls", () => {
    const events = [
      {
        type: "tool-start" as const,
        tool: "webfetch",
        callID: "call_1",
        args: {},
      },
      {
        type: "tool-end" as const,
        tool: "webfetch",
        callID: "call_1",
        outputLength: 10,
      },
    ];

    expect(
      evaluateToolTrace(events, { tool: "webfetch", min: 1, max: 1 }).pass,
    ).toBe(true);
    expect(evaluateToolTrace(events, { tool: "webfetch", max: 0 }).pass).toBe(
      false,
    );
  });

  it("does not persist arguments or output content in metadata", () => {
    const result = evaluateToolTrace(
      [
        {
          type: "tool-start",
          tool: "connector",
          callID: "call_1",
          args: { secret: "private-value" },
        },
        {
          type: "tool-end",
          tool: "connector",
          callID: "call_1",
          outputLength: 42,
        },
      ],
      { tool: "connector" },
    );

    expect(JSON.stringify(result.metadata)).not.toContain("private-value");
    expect(JSON.stringify(result.metadata)).not.toContain("output content");
  });

  it("matches the final OpenCode response part to its trace event", () => {
    const directory = mkdtempSync(join(tmpdir(), "kowork-trace-test-"));
    const previousDirectory = process.env.KOWORK_EVAL_TRACE_DIR;
    process.env.KOWORK_EVAL_TRACE_DIR = directory;
    try {
      writeFileSync(
        join(directory, "ses_test.jsonl"),
        [
          {
            type: "tool-start",
            tool: "webfetch",
            callID: "call_1",
            args: { url: "https://getkowork.com/privacy/" },
          },
          {
            type: "tool-end",
            tool: "webfetch",
            callID: "call_1",
            outputLength: 100,
          },
          finalText,
        ]
          .map((event) => JSON.stringify(event))
          .join("\n"),
      );

      const result = toolUsed("answer", {
        config: {
          tool: "webfetch",
          beforeFinalAnswer: true,
        },
        providerResponse: {
          sessionId: "ses_test",
          raw: JSON.stringify({
            data: {
              info: { id: finalAnswer.messageID },
              parts: [
                {
                  type: "text",
                  id: finalAnswer.partID,
                  messageID: finalAnswer.messageID,
                  text: "answer",
                },
              ],
            },
          }),
        },
      });

      expect(result.pass).toBe(true);
    } finally {
      if (previousDirectory === undefined)
        delete process.env.KOWORK_EVAL_TRACE_DIR;
      else process.env.KOWORK_EVAL_TRACE_DIR = previousDirectory;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
