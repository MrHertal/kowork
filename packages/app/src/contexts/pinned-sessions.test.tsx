// @vitest-environment jsdom
import type {
  Event,
  OpencodeClient,
  Session,
} from "@opencode-ai/sdk/v2/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  PlatformProvider,
  type AsyncStorage,
  type Platform,
} from "@/contexts/platform";
import { createEmitter } from "@/utils/emitter";
import {
  MAX_PINNED_SESSIONS,
  PinnedSessionsProvider,
  usePinnedSessions,
  type PinnedSessionsContextValue,
} from "./pinned-sessions";

const directory = "/tmp/project";

const session = (input: {
  id: string;
  title?: string;
  parentID?: string;
  created?: number;
  updated?: number;
  archived?: number;
}) =>
  ({
    id: input.id,
    title: input.title ?? input.id,
    parentID: input.parentID,
    time: {
      created: input.created ?? 1,
      updated: input.updated,
      archived: input.archived,
    },
  }) as Session;

const updatedEvent = (info: Session): Event => ({
  id: `evt_updated_${info.id}`,
  type: "session.updated",
  properties: { sessionID: info.id, info },
});

const deletedEvent = (info: Session): Event => ({
  id: `evt_deleted_${info.id}`,
  type: "session.deleted",
  properties: { sessionID: info.id, info },
});

type EventMap = { [key: string]: Event };

type GetInput = Parameters<OpencodeClient["session"]["get"]>[0];
type GetResult = { data?: Session; response: Response };

const sdk = {
  client: {
    session: {
      get: vi.fn<(input: GetInput) => Promise<GetResult>>(),
    },
  },
  event: createEmitter<EventMap>(),
};

vi.mock("@/contexts/global-sdk", () => ({
  useGlobalSDK: () => sdk,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

function createStorage(memory: Map<string, string>): AsyncStorage {
  return {
    getItem: (key) => Promise.resolve(memory.get(key) ?? null),
    setItem: (key, value) => {
      memory.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      memory.delete(key);
      return Promise.resolve();
    },
    clear: () => {
      memory.clear();
      return Promise.resolve();
    },
    key: (index) => Promise.resolve([...memory.keys()][index]),
    getLength: () => Promise.resolve(memory.size),
  };
}

let memory: Map<string, string>;
let server: Map<string, Session>;
let platform: Platform;
let queryClient: QueryClient;

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  sdk.event = createEmitter<EventMap>();
  memory = new Map();
  server = new Map();
  queryClient = new QueryClient();
  platform = {
    platform: "web",
    openLink: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    restart: () => Promise.resolve(),
    notify: () => Promise.resolve(),
    storage: () => createStorage(memory),
  };
  sdk.client.session.get.mockImplementation((input) => {
    const found = server.get(input.sessionID);
    return Promise.resolve({
      data: found,
      response: new Response(null, { status: found ? 200 : 404 }),
    });
  });
});

let pinned: PinnedSessionsContextValue;

function Capture() {
  const ctx = usePinnedSessions();
  useEffect(() => {
    pinned = ctx;
  });
  return null;
}

function renderProvider() {
  render(
    <PlatformProvider value={platform}>
      <QueryClientProvider client={queryClient}>
        <PinnedSessionsProvider>
          <Capture />
        </PinnedSessionsProvider>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

async function setup() {
  renderProvider();
  await waitFor(() => expect(pinned._store.state.ready).toBe(true));
}

const persisted = () =>
  JSON.parse(memory.get("pinned-sessions") ?? "{}") as unknown;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("PinnedSessionsProvider", () => {
  test("hydrates pinned ids and fetches their sessions", async () => {
    memory.set("pinned-sessions", JSON.stringify({ ids: ["ses_1", "ses_2"] }));
    server.set("ses_1", session({ id: "ses_1" }));
    server.set("ses_2", session({ id: "ses_2" }));

    await setup();
    await waitFor(() =>
      expect(Object.keys(pinned._store.state.sessions)).toHaveLength(2),
    );

    expect(pinned._store.state.ids).toEqual(["ses_1", "ses_2"]);
    expect(sdk.client.session.get).toHaveBeenCalledTimes(2);
    expect(sdk.client.session.get).toHaveBeenCalledWith(
      { sessionID: "ses_1" },
      { throwOnError: false },
    );
    expect(queryClient.getQueryData(["session", "ses_1"])).toEqual(
      server.get("ses_1"),
    );
  });

  test("starts empty when nothing is persisted", async () => {
    await setup();

    expect(pinned._store.state.ids).toEqual([]);
    expect(pinned._store.state.sessions).toEqual({});
    expect(sdk.client.session.get).not.toHaveBeenCalled();
  });

  test("drops malformed persisted state", async () => {
    memory.set("pinned-sessions", "not json");

    await setup();

    expect(pinned._store.state.ids).toEqual([]);
    expect(memory.has("pinned-sessions")).toBe(false);
  });

  test("marks ready when storage fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = createStorage(memory);
    platform = {
      ...platform,
      storage: () => ({
        ...storage,
        getItem: () => Promise.reject(new Error("disk gone")),
      }),
    };

    await setup();

    expect(pinned._store.state.ready).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      "[pinned-sessions] failed to load persisted state",
      expect.anything(),
    );
  });

  test("pin adds a session and persists it", async () => {
    await setup();

    pinned.pin(session({ id: "ses_1" }));

    expect(pinned._store.state.ids).toEqual(["ses_1"]);
    expect(pinned._store.state.sessions.ses_1?.id).toBe("ses_1");
    await waitFor(() => expect(persisted()).toEqual({ ids: ["ses_1"] }));
    expect(queryClient.getQueryData(["session", "ses_1"])).toBeDefined();
  });

  test("pin ignores child sessions", async () => {
    await setup();

    pinned.pin(session({ id: "ses_1", parentID: "ses_0" }));

    expect(pinned._store.state.ids).toEqual([]);
    expect(pinned._store.state.sessions).toEqual({});
  });

  test("pin dedupes already-pinned sessions", async () => {
    await setup();

    pinned.pin(session({ id: "ses_1" }));
    pinned.pin(session({ id: "ses_1" }));

    expect(pinned._store.state.ids).toEqual(["ses_1"]);
  });

  test("pin toasts and refuses sessions beyond the cap", async () => {
    await setup();
    for (let i = 1; i <= MAX_PINNED_SESSIONS; i++) {
      pinned.pin(session({ id: `ses_${i}` }));
    }

    pinned.pin(session({ id: "ses_overflow" }));

    expect(pinned._store.state.ids).toHaveLength(MAX_PINNED_SESSIONS);
    expect(pinned._store.state.sessions.ses_overflow).toBeUndefined();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Pin limit reached", {
      description: `You can pin up to ${MAX_PINNED_SESSIONS} tasks. Unpin one to add another.`,
    });
  });

  test("unpin removes a session and persists", async () => {
    await setup();
    pinned.pin(session({ id: "ses_1" }));
    await waitFor(() => expect(persisted()).toEqual({ ids: ["ses_1"] }));

    pinned.unpin("ses_1");

    expect(pinned._store.state.ids).toEqual([]);
    expect(pinned._store.state.sessions.ses_1).toBeUndefined();
    await waitFor(() => expect(persisted()).toEqual({ ids: [] }));
  });

  test("unpin ignores sessions that are not pinned", async () => {
    await setup();

    pinned.unpin("ses_1");

    expect(pinned._store.state.ids).toEqual([]);
    await flush();
    expect(memory.has("pinned-sessions")).toBe(false);
  });

  test("prunes pinned sessions missing on the server during hydration", async () => {
    memory.set("pinned-sessions", JSON.stringify({ ids: ["ses_1", "ses_2"] }));
    server.set("ses_1", session({ id: "ses_1" }));

    await setup();
    await waitFor(() => expect(pinned._store.state.ids).toEqual(["ses_1"]));

    expect(pinned._store.state.sessions.ses_2).toBeUndefined();
    await waitFor(() => expect(persisted()).toEqual({ ids: ["ses_1"] }));
  });

  test("prunes pinned sessions that became child or archived during hydration", async () => {
    memory.set(
      "pinned-sessions",
      JSON.stringify({ ids: ["ses_1", "ses_2", "ses_3"] }),
    );
    server.set("ses_1", session({ id: "ses_1" }));
    server.set("ses_2", session({ id: "ses_2", parentID: "ses_0" }));
    server.set("ses_3", session({ id: "ses_3", archived: 10 }));

    await setup();
    await waitFor(() => expect(pinned._store.state.ids).toEqual(["ses_1"]));

    expect(Object.keys(pinned._store.state.sessions)).toEqual(["ses_1"]);
  });

  test("keeps pinned sessions whose fetch fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    memory.set("pinned-sessions", JSON.stringify({ ids: ["ses_1"] }));
    sdk.client.session.get.mockImplementation(() =>
      Promise.reject(new Error("offline")),
    );

    await setup();
    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        "[pinned-sessions] failed to fetch pinned session",
        expect.objectContaining({ id: "ses_1" }),
      ),
    );

    expect(pinned._store.state.ids).toEqual(["ses_1"]);
    expect(pinned._store.state.sessions).toEqual({});
  });

  test("removes a pinned session on session.deleted and persists", async () => {
    await setup();
    pinned.pin(session({ id: "ses_1" }));

    sdk.event.emit(directory, deletedEvent(session({ id: "ses_1" })));

    expect(pinned._store.state.ids).toEqual([]);
    expect(pinned._store.state.sessions.ses_1).toBeUndefined();
    await waitFor(() => expect(persisted()).toEqual({ ids: [] }));
  });

  test("updates the cached session on session.updated", async () => {
    await setup();
    pinned.pin(session({ id: "ses_1", title: "old" }));

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_1", title: "new" })),
    );

    expect(pinned._store.state.sessions.ses_1?.title).toBe("new");
    expect(pinned._store.state.ids).toEqual(["ses_1"]);
  });

  test("unpins on session.updated when the session becomes archived", async () => {
    await setup();
    pinned.pin(session({ id: "ses_1" }));

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_1", archived: 10 })),
    );

    expect(pinned._store.state.ids).toEqual([]);
    await waitFor(() => expect(persisted()).toEqual({ ids: [] }));
  });

  test("ignores events for sessions that are not pinned", async () => {
    await setup();
    pinned.pin(session({ id: "ses_1" }));

    sdk.event.emit(directory, updatedEvent(session({ id: "ses_2" })));
    sdk.event.emit(directory, deletedEvent(session({ id: "ses_2" })));

    expect(pinned._store.state.ids).toEqual(["ses_1"]);
    expect(pinned._store.state.sessions.ses_2).toBeUndefined();
  });

  test("hydrates once across later pins", async () => {
    memory.set("pinned-sessions", JSON.stringify({ ids: ["ses_1"] }));
    server.set("ses_1", session({ id: "ses_1" }));

    await setup();
    await waitFor(() =>
      expect(pinned._store.state.sessions.ses_1).toBeDefined(),
    );
    expect(sdk.client.session.get).toHaveBeenCalledTimes(1);

    pinned.pin(session({ id: "ses_2" }));

    expect(sdk.client.session.get).toHaveBeenCalledTimes(1);
    expect(pinned._store.state.ids).toEqual(["ses_1", "ses_2"]);
  });
});
