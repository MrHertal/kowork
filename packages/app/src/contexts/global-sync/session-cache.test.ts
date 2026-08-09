// @opencode-ref: opencode/packages/app/src/context/global-sync/session-cache.test.ts
import { describe, expect, test } from "vitest";
import type {
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  SessionStatus,
  SnapshotFileDiff,
  Todo,
} from "@opencode-ai/sdk/v2/client";
import { dropSessionCaches } from "./session-cache";

const msg = (id: string, sessionID: string) =>
  ({
    id,
    sessionID,
    role: "user",
    time: { created: 1 },
    agent: "assistant",
    model: { providerID: "openai", modelID: "gpt" },
  }) as Message;

const part = (id: string, sessionID: string, messageID: string) =>
  ({
    id,
    sessionID,
    messageID,
    type: "text",
    text: id,
  }) as Part;

type Store = {
  session_status: Record<string, SessionStatus | undefined>;
  session_diff: Record<string, SnapshotFileDiff[] | undefined>;
  todo: Record<string, Todo[] | undefined>;
  message: Record<string, Message[] | undefined>;
  part: Record<string, Part[] | undefined>;
  permission: Record<string, PermissionRequest[] | undefined>;
  question: Record<string, QuestionRequest[] | undefined>;
};

describe("session cache", () => {
  test("dropSessionCaches clears orphaned parts without message rows", () => {
    const store: Store = {
      session_status: { ses_1: { type: "busy" } },
      session_diff: { ses_1: [] },
      todo: { ses_1: [] },
      message: {},
      part: { msg_1: [part("prt_1", "ses_1", "msg_1")] },
      permission: { ses_1: [] },
      question: { ses_1: [] },
    };

    dropSessionCaches(store, ["ses_1"]);

    expect(store.message.ses_1).toBeUndefined();
    expect(store.part.msg_1).toBeUndefined();
    expect(store.todo.ses_1).toBeUndefined();
    expect(store.session_diff.ses_1).toBeUndefined();
    expect(store.session_status.ses_1).toBeUndefined();
    expect(store.permission.ses_1).toBeUndefined();
    expect(store.question.ses_1).toBeUndefined();
  });

  test("dropSessionCaches clears message-backed parts", () => {
    const m = msg("msg_1", "ses_1");
    const store: Store = {
      session_status: {},
      session_diff: {},
      todo: {},
      message: { ses_1: [m] },
      part: { [m.id]: [part("prt_1", "ses_1", m.id)] },
      permission: {},
      question: {},
    };

    dropSessionCaches(store, ["ses_1"]);

    expect(store.message.ses_1).toBeUndefined();
    expect(store.part[m.id]).toBeUndefined();
  });

  test("dropSessionCaches preserves other sessions", () => {
    const m1 = msg("msg_1", "ses_1");
    const m2 = msg("msg_2", "ses_2");
    const store: Store = {
      session_status: { ses_1: { type: "busy" }, ses_2: { type: "idle" } },
      session_diff: { ses_1: [], ses_2: [] },
      todo: { ses_1: [], ses_2: [] },
      message: { ses_1: [m1], ses_2: [m2] },
      part: {
        [m1.id]: [part("prt_1", "ses_1", m1.id)],
        [m2.id]: [part("prt_2", "ses_2", m2.id)],
      },
      permission: { ses_2: [] },
      question: {},
    };

    dropSessionCaches(store, ["ses_1"]);

    expect(store.message.ses_2).toEqual([m2]);
    expect(store.part[m2.id]).toHaveLength(1);
    expect(store.session_status.ses_2).toEqual({ type: "idle" });
    expect(store.todo.ses_2).toEqual([]);
    expect(store.session_diff.ses_2).toEqual([]);
    expect(store.permission.ses_2).toEqual([]);
  });
});
