import { describe, expect, it } from "vitest";
import type {
  AssistantMessage,
  Message,
  Provider,
} from "@opencode-ai/sdk/v2/client";
import { getSessionContextUsage } from "./session-context";

const assistant = (
  id: string,
  tokens: {
    input: number;
    output: number;
    reasoning?: number;
    cache?: { read: number; write: number };
  },
  providerID = "openai",
  modelID = "gpt-5",
) =>
  ({
    id,
    sessionID: "ses_1",
    role: "assistant",
    time: { created: 1 },
    parentID: "msg_parent",
    modelID,
    providerID,
    mode: "build",
    agent: "build",
    path: { cwd: "/repo", root: "/repo" },
    cost: 0,
    tokens: {
      input: tokens.input,
      output: tokens.output,
      reasoning: tokens.reasoning ?? 0,
      cache: tokens.cache ?? { read: 0, write: 0 },
    },
  }) as AssistantMessage;

const user = (id: string) =>
  ({
    id,
    sessionID: "ses_1",
    role: "user",
    time: { created: 1 },
    agent: "build",
    model: { providerID: "openai", modelID: "gpt-5" },
  }) as Message;

const provider = (context: number | undefined) =>
  ({
    id: "openai",
    models: {
      "gpt-5": { limit: { context } },
    },
  }) as unknown as Provider;

describe("getSessionContextUsage", () => {
  it("returns undefined without assistant messages", () => {
    expect(
      getSessionContextUsage([user("msg_1")], [provider(1000)]),
    ).toBeUndefined();
    expect(getSessionContextUsage([], [])).toBeUndefined();
  });

  it("sums all token buckets of the last assistant message", () => {
    const messages = [
      assistant("msg_1", { input: 100, output: 50 }),
      assistant("msg_2", {
        input: 100,
        output: 50,
        reasoning: 25,
        cache: { read: 20, write: 5 },
      }),
    ];

    const usage = getSessionContextUsage(messages, [provider(1000)]);

    expect(usage?.message.id).toBe("msg_2");
    expect(usage?.tokens).toBe(200);
  });

  it("skips assistant messages without tokens", () => {
    const messages = [
      assistant("msg_1", { input: 100, output: 50 }),
      assistant("msg_2", { input: 0, output: 0 }),
    ];

    const usage = getSessionContextUsage(messages, [provider(1000)]);

    expect(usage?.message.id).toBe("msg_1");
  });

  it("computes the percent against the model context limit", () => {
    const messages = [assistant("msg_1", { input: 400, output: 100 })];

    const usage = getSessionContextUsage(messages, [provider(1000)]);

    expect(usage?.percent).toBe(50);
  });

  it("rounds the percent", () => {
    const messages = [assistant("msg_1", { input: 1, output: 0 })];

    const usage = getSessionContextUsage(messages, [provider(3)]);

    expect(usage?.percent).toBe(33);
  });

  it("reports a null percent when the model limit is unknown", () => {
    const messages = [assistant("msg_1", { input: 400, output: 100 })];
    const other = { ...provider(1000), id: "anthropic" };

    expect(
      getSessionContextUsage(messages, [provider(undefined)])?.percent,
    ).toBeNull();
    expect(getSessionContextUsage(messages, [other])?.percent).toBeNull();
    expect(getSessionContextUsage(messages, [])?.percent).toBeNull();
  });
});
