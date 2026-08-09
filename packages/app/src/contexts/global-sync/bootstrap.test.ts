// @opencode-ref: opencode/packages/app/src/context/global-sync/bootstrap.test.ts
import { describe, expect, test, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type {
  Config,
  OpencodeClient,
  Project,
} from "@opencode-ai/sdk/v2/client";
import { produce } from "immer";
import { bootstrapDirectory } from "./bootstrap";
import type { State } from "./types";

const path = {
  state: "",
  config: "",
  worktree: "/project",
  directory: "/project",
  home: "/home",
};

const defaults = (): State => ({
  status: "loading",
  agent: [],
  command: [],
  project: "",
  projectMeta: undefined,
  icon: undefined,
  provider_ready: true,
  provider: { all: [], connected: [], default: {} },
  config: {},
  path,
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
  limit: 5,
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

describe("bootstrapDirectory", () => {
  test("marks a loading directory partial during bootstrap and complete after success", async () => {
    const store = createState();

    await bootstrapDirectory({
      directory: "/project",
      serverUrl: "http://localhost:4096",
      global: {
        config: {} satisfies Config,
        path,
        project: [{ id: "project", worktree: "/project" } as Project],
        provider: { all: [], connected: [], default: {} },
      },
      sdk: {
        app: {
          agents: () =>
            Promise.resolve({ data: [{ name: "build", mode: "primary" }] }),
          skills: () => Promise.resolve({ data: [] }),
        },
        config: { get: () => Promise.resolve({ data: {} }) },
        session: { status: () => Promise.resolve({ data: {} }) },
        vcs: { get: () => Promise.resolve({ data: undefined }) },
        command: { list: () => Promise.resolve({ data: [] }) },
        permission: { list: () => Promise.resolve({ data: [] }) },
        question: { list: () => Promise.resolve({ data: [] }) },
        mcp: { status: () => Promise.resolve({ data: {} }) },
        provider: {
          list: () =>
            Promise.resolve({ data: { all: [], connected: [], default: {} } }),
        },
      } as unknown as OpencodeClient,
      getState: store.getState,
      setState: store.setState,
      loadSessions() {},
      translate: (key) => key,
      queryClient: new QueryClient(),
    });

    expect(store.state.status).toBe("partial");

    await vi.waitFor(() => {
      expect(store.state.status).toBe("complete");
    });

    expect(store.state.agent.map((x) => x.name)).toEqual(["build"]);
    expect(store.state.provider_ready).toBe(true);
  });
});
