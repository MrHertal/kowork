// @vitest-environment jsdom
import type {
  OpencodeClient,
  PermissionRequest,
  QuestionRequest,
  Session,
} from "@opencode-ai/sdk/v2/client";
import { Store } from "@tanstack/react-store";
import { act, renderHook, waitFor } from "@testing-library/react";
import { produce } from "immer";
import { toast } from "sonner";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { State } from "@/contexts/global-sync/types";
import type { PermissionContextValue } from "@/contexts/permission";
import { useSessionComposerState } from "./session-composer-state";

const directory = "/tmp/project";

const session = (input: { id: string; parentID?: string }) =>
  ({
    id: input.id,
    parentID: input.parentID,
  }) as Session;

const permissionRequest = (id: string, sessionID: string) =>
  ({
    id,
    sessionID,
    permission: "bash",
    patterns: ["*"],
    metadata: {},
    always: [],
  }) as PermissionRequest;

const questionRequest = (id: string, sessionID: string) =>
  ({
    id,
    sessionID,
    questions: [],
  }) as QuestionRequest;

type ChildState = Pick<State, "session" | "permission" | "question">;

const children = new Map<string, Store<ChildState>>();

const sync = {
  _child(dir: string) {
    const hit = children.get(dir);
    if (hit) return hit;
    const created = new Store<ChildState>({
      session: [],
      permission: {},
      question: {},
    });
    children.set(dir, created);
    return created;
  },
};

vi.mock("@/contexts/global-sync", async () => {
  const { useStore } = await import("@tanstack/react-store");
  return {
    useGlobalSync: () => sync,
    useChildData: <T,>(
      dir: string,
      selector: (state: ChildState) => T,
      compare?: (a: T, b: T) => boolean,
    ) => useStore(sync._child(dir), selector, compare),
  };
});

type RespondInput = Parameters<OpencodeClient["permission"]["respond"]>[0];

const sdk = {
  client: {
    permission: {
      respond: vi.fn<(input: RespondInput) => Promise<void>>(() =>
        Promise.resolve(),
      ),
    },
  },
};

vi.mock("@/contexts/sdk", () => ({
  useSDK: () => sdk,
}));

const permission = {
  autoResponds: vi.fn<PermissionContextValue["autoResponds"]>(() => false),
};

vi.mock("@/contexts/permission", () => ({
  usePermission: () => permission,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  children.clear();
  sdk.client.permission.respond.mockImplementation(() => Promise.resolve());
  permission.autoResponds.mockImplementation(() => false);
});

function seedChild(
  dir: string,
  input: {
    session?: Session[];
    permission?: ChildState["permission"];
    question?: ChildState["question"];
  },
) {
  children.set(
    dir,
    new Store<ChildState>({
      session: input.session ?? [],
      permission: input.permission ?? {},
      question: input.question ?? {},
    }),
  );
}

function setup(sessionID: string | undefined = "ses_1") {
  return renderHook(
    (props: { sessionID: string | undefined }) =>
      useSessionComposerState({ sessionID: props.sessionID, directory }),
    { initialProps: { sessionID } },
  );
}

describe("useSessionComposerState", () => {
  test("surfaces the session's pending permission request and blocks the composer", () => {
    seedChild(directory, {
      session: [session({ id: "ses_1" })],
      permission: { ses_1: [permissionRequest("perm_1", "ses_1")] },
    });

    const { result } = setup();

    expect(result.current.permissionRequest?.id).toBe("perm_1");
    expect(result.current.questionRequest).toBeUndefined();
    expect(result.current.blocked).toBe(true);
    expect(result.current.permissionResponding).toBe(false);
  });

  test("surfaces a child session's permission request", () => {
    seedChild(directory, {
      session: [
        session({ id: "ses_1" }),
        session({ id: "ses_2", parentID: "ses_1" }),
      ],
      permission: { ses_2: [permissionRequest("perm_1", "ses_2")] },
    });

    const { result } = setup();

    expect(result.current.permissionRequest?.id).toBe("perm_1");
  });

  test("hides requests that auto-respond", () => {
    permission.autoResponds.mockImplementation(() => true);
    seedChild(directory, {
      session: [session({ id: "ses_1" })],
      permission: { ses_1: [permissionRequest("perm_1", "ses_1")] },
    });

    const { result } = setup();

    expect(result.current.permissionRequest).toBeUndefined();
    expect(result.current.blocked).toBe(false);
  });

  test("blocks the composer while a question is pending", () => {
    seedChild(directory, {
      session: [session({ id: "ses_1" })],
      question: { ses_1: [questionRequest("q_1", "ses_1")] },
    });

    const { result } = setup();

    expect(result.current.questionRequest?.id).toBe("q_1");
    expect(result.current.permissionRequest).toBeUndefined();
    expect(result.current.blocked).toBe(true);
  });

  test("stops showing the request once it leaves the store", () => {
    seedChild(directory, {
      session: [session({ id: "ses_1" })],
      permission: { ses_1: [permissionRequest("perm_1", "ses_1")] },
    });
    const { result } = setup();
    expect(result.current.permissionRequest?.id).toBe("perm_1");

    act(() => {
      sync._child(directory).setState((prev) =>
        produce(prev, (draft) => {
          draft.permission = {};
        }),
      );
    });

    expect(result.current.permissionRequest).toBeUndefined();
    expect(result.current.blocked).toBe(false);
  });

  test("decide responds with the request identity", () => {
    seedChild(directory, { session: [session({ id: "ses_1" })] });
    const { result } = setup();

    act(() => result.current.decide("perm_1", "ses_1", "once"));
    act(() => result.current.decide("perm_2", "ses_1", "always"));
    act(() => result.current.decide("perm_3", "ses_1", "reject"));

    expect(sdk.client.permission.respond).toHaveBeenCalledTimes(3);
    expect(sdk.client.permission.respond).toHaveBeenCalledWith({
      sessionID: "ses_1",
      permissionID: "perm_1",
      response: "once",
    });
    expect(sdk.client.permission.respond).toHaveBeenCalledWith({
      sessionID: "ses_1",
      permissionID: "perm_2",
      response: "always",
    });
    expect(sdk.client.permission.respond).toHaveBeenCalledWith({
      sessionID: "ses_1",
      permissionID: "perm_3",
      response: "reject",
    });
  });

  test("dedupes repeated decides while a response is in flight", async () => {
    let resolveRespond: () => void = () => undefined;
    sdk.client.permission.respond.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRespond = resolve;
        }),
    );
    seedChild(directory, {
      session: [session({ id: "ses_1" })],
      permission: { ses_1: [permissionRequest("perm_1", "ses_1")] },
    });
    const { result } = setup();

    act(() => result.current.decide("perm_1", "ses_1", "once"));
    act(() => result.current.decide("perm_1", "ses_1", "once"));

    expect(sdk.client.permission.respond).toHaveBeenCalledTimes(1);
    expect(result.current.permissionResponding).toBe(true);

    resolveRespond();
    await waitFor(() =>
      expect(result.current.permissionResponding).toBe(false),
    );
  });

  test("toasts when respond fails and clears responding", async () => {
    sdk.client.permission.respond.mockImplementation(() =>
      Promise.reject(new Error("offline")),
    );
    seedChild(directory, {
      session: [session({ id: "ses_1" })],
      permission: { ses_1: [permissionRequest("perm_1", "ses_1")] },
    });
    const { result } = setup();

    act(() => result.current.decide("perm_1", "ses_1", "once"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Request failed", {
        description: "offline",
      }),
    );
    expect(result.current.permissionResponding).toBe(false);
  });

  test("does not leak responding across sessions", async () => {
    let resolveRespond: () => void = () => undefined;
    sdk.client.permission.respond.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRespond = resolve;
        }),
    );
    seedChild(directory, {
      session: [session({ id: "ses_1" }), session({ id: "ses_2" })],
      permission: {
        ses_1: [permissionRequest("perm_1", "ses_1")],
        ses_2: [permissionRequest("perm_2", "ses_2")],
      },
    });
    const { result, rerender } = setup("ses_1");

    act(() => result.current.decide("perm_1", "ses_1", "once"));
    expect(result.current.permissionResponding).toBe(true);

    rerender({ sessionID: "ses_2" });

    expect(result.current.permissionRequest?.id).toBe("perm_2");
    expect(result.current.permissionResponding).toBe(false);

    resolveRespond();
    await waitFor(() =>
      expect(result.current.permissionResponding).toBe(false),
    );
  });
});
