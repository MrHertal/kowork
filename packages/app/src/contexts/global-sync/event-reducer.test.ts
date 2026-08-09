// @opencode-ref: opencode/packages/app/src/context/global-sync/event-reducer.test.ts
import { describe, expect, test } from "vitest";
import type {
  Message,
  Part,
  PermissionRequest,
  Project,
  QuestionRequest,
  Session,
} from "@opencode-ai/sdk/v2/client";
import { produce } from "immer";
import type { State } from "./types";
import {
  applyDirectoryEvent,
  applyGlobalEvent,
  cleanupDroppedSessionCaches,
} from "./event-reducer";

const rootSession = (input: {
  id: string;
  parentID?: string;
  archived?: number;
}) =>
  ({
    id: input.id,
    parentID: input.parentID,
    time: {
      created: 1,
      updated: 1,
      archived: input.archived,
    },
  }) as Session;

const userMessage = (id: string, sessionID: string) =>
  ({
    id,
    sessionID,
    role: "user",
    time: { created: 1 },
    agent: "assistant",
    model: { providerID: "openai", modelID: "gpt" },
  }) as Message;

const textPart = (id: string, sessionID: string, messageID: string) =>
  ({
    id,
    sessionID,
    messageID,
    type: "text",
    text: id,
  }) as Part;

const permissionRequest = (id: string, sessionID: string, title = id) =>
  ({
    id,
    sessionID,
    permission: title,
    patterns: ["*"],
    metadata: {},
    always: [],
  }) as PermissionRequest;

const questionRequest = (id: string, sessionID: string, title = id) =>
  ({
    id,
    sessionID,
    questions: [
      {
        question: title,
        header: title,
        options: [{ label: title, description: title }],
      },
    ],
  }) as QuestionRequest;

const defaults = (): State => ({
  status: "complete",
  agent: [],
  command: [],
  project: "",
  projectMeta: undefined,
  icon: undefined,
  provider_ready: true,
  provider: { all: [], connected: [], default: {} },
  config: {},
  path: {
    state: "",
    config: "",
    worktree: "/tmp",
    directory: "/tmp",
    home: "/home",
  },
  session: [],
  sessionTotal: 0,
  session_status: {},
  session_diff: {},
  todo: {},
  permission: {},
  question: {},
  mcp_ready: true,
  mcp: {},
  lsp_ready: true,
  lsp: [],
  vcs: undefined,
  limit: 10,
  message: {},
  message_loading: {},
  part: {},
});

const baseState = (input: Partial<State> = {}): State => ({
  ...defaults(),
  ...input,
});

// Mirrors how global-sync.tsx drives the store: setState with an immer recipe.
const createState = (input: Partial<State> = {}) => {
  let state = baseState(input);
  return {
    get state() {
      return state;
    },
    getState: () => state,
    setState: (fn: (draft: State) => void) => {
      state = produce(state, fn);
    },
  };
};

describe("applyGlobalEvent", () => {
  test("upserts project.updated in sorted position", () => {
    const project = [{ id: "a" }, { id: "c" }] as Project[];
    let refreshCount = 0;
    applyGlobalEvent({
      event: { type: "project.updated", properties: { id: "b" } },
      project,
      refresh: () => {
        refreshCount += 1;
      },
      setGlobalProject(next) {
        if (typeof next === "function") next(project);
      },
    });

    expect(project.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(refreshCount).toBe(0);
  });

  test("handles global.disposed by triggering refresh", () => {
    let refreshCount = 0;
    applyGlobalEvent({
      event: { type: "global.disposed" },
      project: [],
      refresh: () => {
        refreshCount += 1;
      },
      setGlobalProject() {},
    });

    expect(refreshCount).toBe(1);
  });

  test("handles server.connected by triggering refresh", () => {
    let refreshCount = 0;
    applyGlobalEvent({
      event: { type: "server.connected" },
      project: [],
      refresh: () => {
        refreshCount += 1;
      },
      setGlobalProject() {},
    });

    expect(refreshCount).toBe(1);
  });
});

describe("applyDirectoryEvent", () => {
  test("inserts root sessions in sorted order and updates sessionTotal", () => {
    const store = createState({
      session: [rootSession({ id: "b" })],
      sessionTotal: 1,
    });

    applyDirectoryEvent({
      event: {
        type: "session.created",
        properties: { info: rootSession({ id: "a" }) },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });

    expect(store.state.session.map((x) => x.id)).toEqual(["a", "b"]);
    expect(store.state.sessionTotal).toBe(2);

    applyDirectoryEvent({
      event: {
        type: "session.created",
        properties: { info: rootSession({ id: "c", parentID: "a" }) },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });

    expect(store.state.sessionTotal).toBe(2);
  });

  test("cleans session caches when archived", () => {
    const message = userMessage("msg_1", "ses_1");
    const store = createState({
      session: [rootSession({ id: "ses_1" }), rootSession({ id: "ses_2" })],
      sessionTotal: 2,
      message: { ses_1: [message] },
      part: { [message.id]: [textPart("prt_1", "ses_1", message.id)] },
      session_diff: { ses_1: [] },
      todo: { ses_1: [] },
      permission: { ses_1: [] },
      question: { ses_1: [] },
      session_status: { ses_1: { type: "busy" } },
    });

    applyDirectoryEvent({
      event: {
        type: "session.updated",
        properties: { info: rootSession({ id: "ses_1", archived: 10 }) },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });

    expect(store.state.session.map((x) => x.id)).toEqual(["ses_2"]);
    expect(store.state.sessionTotal).toBe(1);
    expect(store.state.message.ses_1).toBeUndefined();
    expect(store.state.part[message.id]).toBeUndefined();
    expect(store.state.session_diff.ses_1).toBeUndefined();
    expect(store.state.todo.ses_1).toBeUndefined();
    expect(store.state.permission.ses_1).toBeUndefined();
    expect(store.state.question.ses_1).toBeUndefined();
    expect(store.state.session_status.ses_1).toBeUndefined();
  });

  test("cleans session caches when deleted and decrements only root totals", () => {
    const cases = [
      { info: rootSession({ id: "ses_1" }), expectedTotal: 1 },
      {
        info: rootSession({ id: "ses_2", parentID: "ses_1" }),
        expectedTotal: 2,
      },
    ];

    for (const item of cases) {
      const message = userMessage("msg_1", item.info.id);
      const store = createState({
        session: [
          rootSession({ id: "ses_1" }),
          rootSession({ id: "ses_2", parentID: "ses_1" }),
          rootSession({ id: "ses_3" }),
        ],
        sessionTotal: 2,
        message: { [item.info.id]: [message] },
        part: { [message.id]: [textPart("prt_1", item.info.id, message.id)] },
        session_diff: { [item.info.id]: [] },
        todo: { [item.info.id]: [] },
        permission: { [item.info.id]: [] },
        question: { [item.info.id]: [] },
        session_status: { [item.info.id]: { type: "busy" } },
      });

      applyDirectoryEvent({
        event: { type: "session.deleted", properties: { info: item.info } },
        getState: store.getState,
        setState: store.setState,
        push() {},
        directory: "/tmp",
        loadLsp() {},
      });

      expect(
        store.state.session.find((x) => x.id === item.info.id),
      ).toBeUndefined();
      expect(store.state.sessionTotal).toBe(item.expectedTotal);
      expect(store.state.message[item.info.id]).toBeUndefined();
      expect(store.state.part[message.id]).toBeUndefined();
      expect(store.state.session_diff[item.info.id]).toBeUndefined();
      expect(store.state.todo[item.info.id]).toBeUndefined();
      expect(store.state.permission[item.info.id]).toBeUndefined();
      expect(store.state.question[item.info.id]).toBeUndefined();
      expect(store.state.session_status[item.info.id]).toBeUndefined();
    }
  });

  test("cleans caches for trimmed sessions on session.created", () => {
    const dropped = rootSession({ id: "ses_b" });
    const kept = rootSession({ id: "ses_a" });
    const message = userMessage("msg_1", dropped.id);
    // No message rows for ses_b: sessions with loaded messages are protected
    // from trimming via `protect: Object.keys(draft.message)`.
    const store = createState({
      limit: 1,
      session: [dropped],
      part: { [message.id]: [textPart("prt_1", dropped.id, message.id)] },
      session_diff: { [dropped.id]: [] },
      todo: { [dropped.id]: [] },
      permission: { [dropped.id]: [] },
      question: { [dropped.id]: [] },
      session_status: { [dropped.id]: { type: "busy" } },
      message_loading: { "proj\nses_a": true, "proj\nses_b": true },
    });

    applyDirectoryEvent({
      event: { type: "session.created", properties: { info: kept } },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });

    expect(store.state.session.map((x) => x.id)).toEqual([kept.id]);
    expect(store.state.part[message.id]).toBeUndefined();
    expect(store.state.session_diff[dropped.id]).toBeUndefined();
    expect(store.state.todo[dropped.id]).toBeUndefined();
    expect(store.state.permission[dropped.id]).toBeUndefined();
    expect(store.state.question[dropped.id]).toBeUndefined();
    expect(store.state.session_status[dropped.id]).toBeUndefined();
    expect(store.state.message_loading["proj\nses_b"]).toBeUndefined();
    expect(store.state.message_loading["proj\nses_a"]).toBe(true);
  });

  test("cleanupDroppedSessionCaches clears part-only orphan state", () => {
    const store = createState({
      session: [rootSession({ id: "ses_keep" })],
      part: { msg_1: [textPart("prt_1", "ses_drop", "msg_1")] },
    });

    store.setState((draft) => {
      cleanupDroppedSessionCaches(draft, store.getState().session);
    });

    expect(store.state.part.msg_1).toBeUndefined();
  });

  test("upserts and removes messages while clearing orphaned parts", () => {
    const sessionID = "ses_1";
    const store = createState({
      message: {
        [sessionID]: [
          userMessage("msg_1", sessionID),
          userMessage("msg_3", sessionID),
        ],
      },
      part: { msg_2: [textPart("prt_1", sessionID, "msg_2")] },
    });

    applyDirectoryEvent({
      event: {
        type: "message.updated",
        properties: { info: userMessage("msg_2", sessionID) },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });

    expect(store.state.message[sessionID]?.map((x) => x.id)).toEqual([
      "msg_1",
      "msg_2",
      "msg_3",
    ]);

    applyDirectoryEvent({
      event: {
        type: "message.updated",
        properties: {
          info: {
            ...userMessage("msg_2", sessionID),
            role: "assistant",
          } as Message,
        },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });

    expect(
      store.state.message[sessionID]?.find((x) => x.id === "msg_2")?.role,
    ).toBe("assistant");

    applyDirectoryEvent({
      event: {
        type: "message.removed",
        properties: { sessionID, messageID: "msg_2" },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });

    expect(store.state.message[sessionID]?.map((x) => x.id)).toEqual([
      "msg_1",
      "msg_3",
    ]);
    expect(store.state.part.msg_2).toBeUndefined();
  });

  test("upserts and prunes message parts", () => {
    const sessionID = "ses_1";
    const messageID = "msg_1";
    const store = createState({
      part: {
        [messageID]: [
          textPart("prt_1", sessionID, messageID),
          textPart("prt_3", sessionID, messageID),
        ],
      },
    });

    applyDirectoryEvent({
      event: {
        type: "message.part.updated",
        properties: { part: textPart("prt_2", sessionID, messageID) },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });
    expect(store.state.part[messageID]?.map((x) => x.id)).toEqual([
      "prt_1",
      "prt_2",
      "prt_3",
    ]);

    applyDirectoryEvent({
      event: {
        type: "message.part.updated",
        properties: {
          part: {
            ...textPart("prt_2", sessionID, messageID),
            text: "changed",
          } as Part,
        },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });
    const updated = store.state.part[messageID]?.find((x) => x.id === "prt_2");
    expect(updated?.type).toBe("text");
    if (updated?.type === "text") expect(updated.text).toBe("changed");

    for (const partID of ["prt_1", "prt_2", "prt_3"]) {
      applyDirectoryEvent({
        event: {
          type: "message.part.removed",
          properties: { messageID, partID },
        },
        getState: store.getState,
        setState: store.setState,
        push() {},
        directory: "/tmp",
        loadLsp() {},
      });
    }

    expect(store.state.part[messageID]).toBeUndefined();
  });

  test("tracks permission and question request lifecycles", () => {
    const sessionID = "ses_1";
    const store = createState({
      permission: {
        [sessionID]: [
          permissionRequest("perm_1", sessionID),
          permissionRequest("perm_3", sessionID),
        ],
      },
      question: {
        [sessionID]: [
          questionRequest("q_1", sessionID),
          questionRequest("q_3", sessionID),
        ],
      },
    });

    applyDirectoryEvent({
      event: {
        type: "permission.asked",
        properties: permissionRequest("perm_2", sessionID),
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });
    expect(store.state.permission[sessionID]?.map((x) => x.id)).toEqual([
      "perm_1",
      "perm_2",
      "perm_3",
    ]);

    applyDirectoryEvent({
      event: {
        type: "permission.asked",
        properties: permissionRequest("perm_2", sessionID, "updated"),
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });
    expect(
      store.state.permission[sessionID]?.find((x) => x.id === "perm_2")
        ?.permission,
    ).toBe("updated");

    applyDirectoryEvent({
      event: {
        type: "permission.replied",
        properties: { sessionID, requestID: "perm_2" },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });
    expect(store.state.permission[sessionID]?.map((x) => x.id)).toEqual([
      "perm_1",
      "perm_3",
    ]);

    applyDirectoryEvent({
      event: {
        type: "question.asked",
        properties: questionRequest("q_2", sessionID),
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });
    expect(store.state.question[sessionID]?.map((x) => x.id)).toEqual([
      "q_1",
      "q_2",
      "q_3",
    ]);

    applyDirectoryEvent({
      event: {
        type: "question.asked",
        properties: questionRequest("q_2", sessionID, "updated"),
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });
    expect(
      store.state.question[sessionID]?.find((x) => x.id === "q_2")?.questions[0]
        ?.header,
    ).toBe("updated");

    applyDirectoryEvent({
      event: {
        type: "question.rejected",
        properties: { sessionID, requestID: "q_2" },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });
    expect(store.state.question[sessionID]?.map((x) => x.id)).toEqual([
      "q_1",
      "q_3",
    ]);
  });

  test("updates vcs branch in store", () => {
    const store = createState({
      vcs: { branch: "main", default_branch: "main" },
    });

    applyDirectoryEvent({
      event: {
        type: "vcs.branch.updated",
        properties: { branch: "feature/test" },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });

    expect(store.state.vcs).toEqual({
      branch: "feature/test",
      default_branch: "main",
    });

    applyDirectoryEvent({
      event: {
        type: "vcs.branch.updated",
        properties: { branch: "feature/test" },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });

    expect(store.state.vcs).toEqual({
      branch: "feature/test",
      default_branch: "main",
    });
  });

  test("routes disposal and lsp events to side-effect handlers", () => {
    const store = createState();
    const pushes: string[] = [];
    let lspLoads = 0;

    applyDirectoryEvent({
      event: { type: "server.instance.disposed" },
      getState: store.getState,
      setState: store.setState,
      push(directory) {
        pushes.push(directory);
      },
      directory: "/tmp",
      loadLsp() {
        lspLoads += 1;
      },
    });

    applyDirectoryEvent({
      event: { type: "lsp.updated" },
      getState: store.getState,
      setState: store.setState,
      push(directory) {
        pushes.push(directory);
      },
      directory: "/tmp",
      loadLsp() {
        lspLoads += 1;
      },
    });

    expect(pushes).toEqual(["/tmp"]);
    expect(lspLoads).toBe(1);
  });

  test("appends message part deltas to the existing field value", () => {
    const sessionID = "ses_1";
    const messageID = "msg_1";
    const store = createState({
      part: {
        [messageID]: [
          { ...textPart("prt_1", sessionID, messageID), text: "hello" } as Part,
        ],
      },
    });

    applyDirectoryEvent({
      event: {
        type: "message.part.delta",
        properties: {
          messageID,
          partID: "prt_1",
          field: "text",
          delta: " world",
        },
      },
      getState: store.getState,
      setState: store.setState,
      push() {},
      directory: "/tmp",
      loadLsp() {},
    });

    const updated = store.state.part[messageID]?.find((x) => x.id === "prt_1");
    expect(updated?.type).toBe("text");
    if (updated?.type === "text") expect(updated.text).toBe("hello world");
  });

  test("skips step-start and step-finish parts", () => {
    const sessionID = "ses_1";
    const messageID = "msg_1";
    const store = createState();

    for (const type of ["step-start", "step-finish"]) {
      applyDirectoryEvent({
        event: {
          type: "message.part.updated",
          properties: {
            part: { id: `prt_${type}`, sessionID, messageID, type } as Part,
          },
        },
        getState: store.getState,
        setState: store.setState,
        push() {},
        directory: "/tmp",
        loadLsp() {},
      });
    }

    expect(store.state.part[messageID]).toBeUndefined();
  });
});
