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

import { createEmitter } from "@/utils/emitter";
import {
  RecentSessionsProvider,
  useRecentSessions,
  type RecentSessionsContextValue,
} from "./recent-sessions";

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

const createdEvent = (info: Session): Event => ({
  id: `evt_created_${info.id}`,
  type: "session.created",
  properties: { sessionID: info.id, info },
});

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

const idleEvent = (sessionID: string): Event => ({
  id: `evt_idle_${sessionID}`,
  type: "session.idle",
  properties: { sessionID },
});

type EventMap = { [key: string]: Event };

type ListInput = Parameters<
  OpencodeClient["experimental"]["session"]["list"]
>[0];
type ListResult = { data?: Session[]; response: Response };

const page = (sessions: Session[], nextCursor?: number): ListResult => ({
  data: sessions,
  response: new Response(null, {
    status: 200,
    headers:
      nextCursor === undefined ? {} : { "x-next-cursor": String(nextCursor) },
  }),
});

const failure = (status: number, statusText: string): ListResult => ({
  data: undefined,
  response: new Response(null, { status, statusText }),
});

const sdk = {
  client: {
    experimental: {
      session: {
        list: vi.fn<
          (
            input?: ListInput,
            options?: { signal?: AbortSignal },
          ) => Promise<ListResult>
        >(),
      },
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

let queryClient: QueryClient;

const list = () => sdk.client.experimental.session.list;

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  sdk.event = createEmitter<EventMap>();
  queryClient = new QueryClient();
  list().mockImplementation(() => Promise.resolve(page([])));
});

let recent: RecentSessionsContextValue;

function Capture() {
  const ctx = useRecentSessions();
  useEffect(() => {
    recent = ctx;
  });
  return null;
}

function renderProvider() {
  render(
    <QueryClientProvider client={queryClient}>
      <RecentSessionsProvider>
        <Capture />
      </RecentSessionsProvider>
    </QueryClientProvider>,
  );
}

async function setup() {
  renderProvider();
  await waitFor(() => expect(list()).toHaveBeenCalled());
  await waitFor(() => expect(recent._store.state.loading).toBe(false));
}

const ids = () => recent._store.state.sessions.map((s) => s.id);

describe("RecentSessionsProvider", () => {
  test("loads the first page sorted by recency and warms the session cache", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        page([
          session({ id: "ses_3", updated: 100 }),
          session({ id: "ses_2", updated: 200 }),
          session({ id: "ses_1", updated: 200 }),
        ]),
      ),
    );

    await setup();

    expect(ids()).toEqual(["ses_1", "ses_2", "ses_3"]);
    expect(recent._store.state.cursor).toBeNull();
    expect(list()).toHaveBeenCalledWith(
      { roots: true, limit: 25 },
      { throwOnError: false },
    );
    expect(queryClient.getQueryData(["session", "ses_1"])).toBeDefined();
  });

  test("filters archived and id-less sessions from the page", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        page([
          session({ id: "ses_1", updated: 100 }),
          session({ id: "ses_2", updated: 200, archived: 10 }),
          session({ id: "", updated: 300 }),
        ]),
      ),
    );

    await setup();

    expect(ids()).toEqual(["ses_1"]);
  });

  test("reads the next cursor from response headers", async () => {
    list().mockImplementation(() =>
      Promise.resolve(page([session({ id: "ses_1" })], 42)),
    );

    await setup();

    expect(recent._store.state.cursor).toBe(42);
  });

  test("ignores an unparsable cursor header", async () => {
    list().mockImplementation(() =>
      Promise.resolve({
        data: [session({ id: "ses_1" })],
        response: new Response(null, {
          status: 200,
          headers: { "x-next-cursor": "abc" },
        }),
      }),
    );

    await setup();

    expect(recent._store.state.cursor).toBeNull();
  });

  test("loadMore fetches the next page and merges sorted without duplicates", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        page(
          [
            session({ id: "ses_1", updated: 300 }),
            session({ id: "ses_2", updated: 200 }),
          ],
          2,
        ),
      ),
    );
    await setup();

    list().mockImplementation(() =>
      Promise.resolve(
        page([
          session({ id: "ses_2", updated: 200 }),
          session({ id: "ses_3", updated: 100 }),
        ]),
      ),
    );
    await recent.loadMore();

    expect(ids()).toEqual(["ses_1", "ses_2", "ses_3"]);
    expect(list()).toHaveBeenLastCalledWith(
      { roots: true, limit: 25, cursor: 2 },
      { throwOnError: false },
    );
    expect(recent._store.state.cursor).toBeNull();
  });

  test("loadMore is a no-op once the cursor is exhausted", async () => {
    await setup();
    list().mockClear();

    await recent.loadMore();

    expect(list()).not.toHaveBeenCalled();
  });

  test("toasts when the first page fails and retry recovers", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    list().mockImplementation(() =>
      Promise.resolve(failure(400, "Bad Request")),
    );
    renderProvider();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to load tasks", {
        description: "Session list failed (400 Bad Request)",
      }),
    );

    expect(recent._store.state.sessions).toEqual([]);
    expect(recent._store.state.loading).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[recent-sessions] failed to load sessions",
      expect.anything(),
    );

    list().mockImplementation(() =>
      Promise.resolve(page([session({ id: "ses_1", updated: 100 })])),
    );
    await recent.retry();

    expect(ids()).toEqual(["ses_1"]);
  });

  test("buffers events until the first page loads", async () => {
    let resolveList: (value: ListResult) => void = () => undefined;
    list().mockImplementation(
      () =>
        new Promise<ListResult>((resolve) => {
          resolveList = resolve;
        }),
    );
    renderProvider();

    sdk.event.emit(
      directory,
      createdEvent(session({ id: "ses_9", updated: 999 })),
    );
    resolveList(page([session({ id: "ses_1", updated: 100 })]));

    await waitFor(() => expect(ids()).toEqual(["ses_9", "ses_1"]));
    expect(queryClient.getQueryData(["session", "ses_9"])).toBeDefined();
  });

  test("applies session.updated events after boot", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        page([
          session({ id: "ses_1", title: "one", updated: 100 }),
          session({ id: "ses_2", updated: 200 }),
        ]),
      ),
    );
    await setup();
    expect(ids()).toEqual(["ses_2", "ses_1"]);

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_1", title: "bumped", updated: 300 })),
    );
    expect(ids()).toEqual(["ses_1", "ses_2"]);
    expect(recent._store.state.sessions[0]?.title).toBe("bumped");

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_1", title: "stale", updated: 50 })),
    );
    expect(ids()).toEqual(["ses_1", "ses_2"]);
    expect(recent._store.state.sessions[0]?.title).toBe("bumped");
  });

  test("drops out-of-window updates once paged", async () => {
    list().mockImplementation(() =>
      Promise.resolve(page([session({ id: "ses_1", updated: 100 })], 2)),
    );
    await setup();

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_2", updated: 50 })),
    );
    expect(ids()).toEqual(["ses_1"]);

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_3", updated: 150 })),
    );
    expect(ids()).toEqual(["ses_3", "ses_1"]);
  });

  test("removes archived and deleted sessions", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        page([
          session({ id: "ses_1", updated: 100 }),
          session({ id: "ses_2", updated: 200 }),
        ]),
      ),
    );
    await setup();

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_1", updated: 300, archived: 10 })),
    );
    expect(ids()).toEqual(["ses_2"]);

    sdk.event.emit(directory, deletedEvent(session({ id: "ses_2" })));
    expect(ids()).toEqual([]);
  });

  test("removes the cached query on session.deleted", async () => {
    list().mockImplementation(() =>
      Promise.resolve(page([session({ id: "ses_1", updated: 100 })])),
    );
    await setup();
    const child = session({ id: "ses_9", parentID: "ses_1" });
    queryClient.setQueryData(["session", child.id], child);

    sdk.event.emit(directory, deletedEvent(child));
    expect(queryClient.getQueryData(["session", "ses_9"])).toBeUndefined();
    expect(ids()).toEqual(["ses_1"]);

    sdk.event.emit(directory, deletedEvent(session({ id: "ses_1" })));
    expect(queryClient.getQueryData(["session", "ses_1"])).toBeUndefined();
    expect(ids()).toEqual([]);
  });

  test("ignores child sessions on session.created", async () => {
    await setup();

    sdk.event.emit(
      directory,
      createdEvent(session({ id: "ses_9", parentID: "ses_1", updated: 999 })),
    );

    expect(ids()).toEqual([]);
    expect(queryClient.getQueryData(["session", "ses_9"])).toBeUndefined();
  });

  test("ignores global events and events without info", async () => {
    list().mockImplementation(() =>
      Promise.resolve(page([session({ id: "ses_1", updated: 100 })])),
    );
    await setup();

    sdk.event.emit(
      "global",
      updatedEvent(session({ id: "ses_9", updated: 999 })),
    );
    sdk.event.emit(directory, idleEvent("ses_1"));

    expect(ids()).toEqual(["ses_1"]);
  });

  test("loadMore waits for an in-flight boot", async () => {
    let resolveFirst: (value: ListResult) => void = () => undefined;
    list()
      .mockImplementationOnce(
        () =>
          new Promise<ListResult>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementation(() => Promise.resolve(page([])));
    renderProvider();

    const more = recent.loadMore();
    resolveFirst(page([session({ id: "ses_1", updated: 100 })], 5));
    await more;
    await waitFor(() => expect(recent._store.state.loading).toBe(false));

    expect(list()).toHaveBeenCalledTimes(2);
    expect(list()).toHaveBeenLastCalledWith(
      { roots: true, limit: 25, cursor: 5 },
      { throwOnError: false },
    );
    expect(ids()).toEqual(["ses_1"]);
  });
});
