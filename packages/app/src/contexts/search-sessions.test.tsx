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
  matchesQuery,
  SearchSessionsProvider,
  useSearchSessions,
  type SearchSessionsContextValue,
} from "./search-sessions";

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

const result = (sessions: Session[]): ListResult => ({
  data: sessions,
  response: new Response(null, { status: 200 }),
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
  list().mockImplementation(() => Promise.resolve(result([])));
});

let search: SearchSessionsContextValue;

function Capture() {
  const ctx = useSearchSessions();
  useEffect(() => {
    search = ctx;
  });
  return null;
}

function renderProvider() {
  render(
    <QueryClientProvider client={queryClient}>
      <SearchSessionsProvider>
        <Capture />
      </SearchSessionsProvider>
    </QueryClientProvider>,
  );
}

const ids = () => search._store.state.results.map((s) => s.id);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("matchesQuery", () => {
  test("matches case-insensitively", () => {
    expect(matchesQuery("Alpha Task", "alpha")).toBe(true);
    expect(matchesQuery("alpha task", "PHA")).toBe(true);
  });

  test("rejects missing titles and non-matches", () => {
    expect(matchesQuery(undefined, "alpha")).toBe(false);
    expect(matchesQuery("", "alpha")).toBe(false);
    expect(matchesQuery("beta", "alpha")).toBe(false);
  });
});

describe("SearchSessionsProvider", () => {
  test("searches after a debounce and caches sorted matches", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        result([
          session({ id: "ses_1", title: "alpha one", updated: 100 }),
          session({ id: "ses_2", title: "alpha two", updated: 200 }),
          session({
            id: "ses_3",
            title: "alpha archived",
            updated: 300,
            archived: 5,
          }),
        ]),
      ),
    );
    renderProvider();
    expect(list()).not.toHaveBeenCalled();

    search.setQuery("alpha");
    expect(search._store.state.loading).toBe(true);

    await waitFor(() => expect(ids()).toEqual(["ses_2", "ses_1"]));
    expect(list()).toHaveBeenCalledTimes(1);
    expect(list()).toHaveBeenCalledWith(
      { roots: true, search: "alpha", limit: 100 },
      expect.objectContaining({ throwOnError: false }),
    );
    expect(search._store.state.loading).toBe(false);
    expect(queryClient.getQueryData(["session", "ses_1"])).toBeDefined();
  });

  test("debounces rapid query changes into one search", async () => {
    renderProvider();

    search.setQuery("a");
    search.setQuery("al");
    search.setQuery("alpha");

    await waitFor(() => expect(list()).toHaveBeenCalledTimes(1));
    expect(list()).toHaveBeenCalledWith(
      expect.objectContaining({ search: "alpha" }),
      expect.anything(),
    );
  });

  test("ignores whitespace-only query changes", async () => {
    renderProvider();

    search.setQuery("alpha");
    await waitFor(() => expect(list()).toHaveBeenCalledTimes(1));

    search.setQuery("alpha  ");
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(list()).toHaveBeenCalledTimes(1);
  });

  test("clears results when the query is emptied", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        result([session({ id: "ses_1", title: "alpha one", updated: 100 })]),
      ),
    );
    renderProvider();
    search.setQuery("alpha");
    await waitFor(() => expect(ids()).toEqual(["ses_1"]));

    search.setQuery("");

    expect(ids()).toEqual([]);
    expect(search._store.state.loading).toBe(false);
    expect(list()).toHaveBeenCalledTimes(1);
  });

  test("aborts an in-flight search when the query changes", async () => {
    let firstSignal: AbortSignal | undefined;
    let resolveSecond: (value: ListResult) => void = () => undefined;
    let calls = 0;
    list().mockImplementation((input, options) => {
      calls++;
      if (calls === 1) {
        firstSignal = options?.signal;
        return new Promise<ListResult>(() => {});
      }
      return new Promise<ListResult>((resolve) => {
        resolveSecond = resolve;
      });
    });
    renderProvider();

    search.setQuery("alpha");
    await waitFor(() => expect(list()).toHaveBeenCalledTimes(1));

    search.setQuery("beta");
    await waitFor(() => expect(list()).toHaveBeenCalledTimes(2));

    expect(firstSignal?.aborted).toBe(true);

    resolveSecond(result([session({ id: "ses_2", title: "beta" })]));
    await waitFor(() => expect(ids()).toEqual(["ses_2"]));
    expect(search._store.state.loading).toBe(false);
  });

  test("discards stale responses from superseded searches", async () => {
    const deferreds = new Map<string, (value: ListResult) => void>();
    list().mockImplementation(
      (input) =>
        new Promise<ListResult>((resolve) => {
          deferreds.set(String(input?.search ?? ""), resolve);
        }),
    );
    renderProvider();

    search.setQuery("alpha");
    await waitFor(() => expect(deferreds.has("alpha")).toBe(true));
    search.setQuery("beta");
    await waitFor(() => expect(deferreds.has("beta")).toBe(true));

    deferreds.get("alpha")!(result([session({ id: "ses_1", title: "alpha" })]));
    await flush();
    expect(ids()).toEqual([]);

    deferreds.get("beta")!(result([session({ id: "ses_2", title: "beta" })]));
    await waitFor(() => expect(ids()).toEqual(["ses_2"]));
    expect(search._store.state.loading).toBe(false);
  });

  test("toasts on search failure and keeps prior results", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    list().mockImplementation((input) =>
      input?.search === "beta"
        ? Promise.resolve({
            data: undefined,
            response: new Response(null, {
              status: 400,
              statusText: "Bad Request",
            }),
          })
        : Promise.resolve(
            result([session({ id: "ses_1", title: "alpha one" })]),
          ),
    );
    renderProvider();
    search.setQuery("alpha");
    await waitFor(() => expect(ids()).toEqual(["ses_1"]));

    search.setQuery("beta");
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to load tasks", {
        description: "Session search failed (400 Bad Request)",
      }),
    );

    expect(ids()).toEqual(["ses_1"]);
    expect(search._store.state.loading).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[search-sessions] failed to search sessions",
      expect.anything(),
    );
  });

  test("updates matching results on session.updated and drops non-matches", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        result([session({ id: "ses_1", title: "alpha one", updated: 100 })]),
      ),
    );
    renderProvider();
    search.setQuery("alpha");
    await waitFor(() => expect(ids()).toEqual(["ses_1"]));

    sdk.event.emit(
      directory,
      updatedEvent(
        session({ id: "ses_1", title: "alpha renamed", updated: 200 }),
      ),
    );
    expect(search._store.state.results[0]?.title).toBe("alpha renamed");
    expect(queryClient.getQueryData(["session", "ses_1"])).toMatchObject({
      title: "alpha renamed",
    });

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_1", title: "stale alpha", updated: 50 })),
    );
    expect(search._store.state.results[0]?.title).toBe("alpha renamed");

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_1", title: "beta", updated: 300 })),
    );
    expect(ids()).toEqual([]);
  });

  test("does not add matching sessions that are not already in the results", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        result([session({ id: "ses_1", title: "alpha one", updated: 100 })]),
      ),
    );
    renderProvider();
    search.setQuery("alpha");
    await waitFor(() => expect(ids()).toEqual(["ses_1"]));

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_9", title: "alpha nine", updated: 999 })),
    );

    expect(ids()).toEqual(["ses_1"]);
  });

  test("removes deleted and archived sessions from results", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        result([
          session({ id: "ses_1", title: "alpha one", updated: 100 }),
          session({ id: "ses_2", title: "alpha two", updated: 200 }),
        ]),
      ),
    );
    renderProvider();
    search.setQuery("alpha");
    await waitFor(() => expect(ids()).toEqual(["ses_2", "ses_1"]));

    sdk.event.emit(directory, deletedEvent(session({ id: "ses_1" })));
    expect(ids()).toEqual(["ses_2"]);
    expect(queryClient.getQueryData(["session", "ses_1"])).toBeUndefined();

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_2", archived: 5 })),
    );
    expect(ids()).toEqual([]);
  });

  test("ignores child sessions and events without info", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        result([session({ id: "ses_1", title: "alpha one", updated: 100 })]),
      ),
    );
    renderProvider();
    search.setQuery("alpha");
    await waitFor(() => expect(ids()).toEqual(["ses_1"]));

    sdk.event.emit(
      directory,
      updatedEvent(
        session({ id: "ses_9", parentID: "ses_1", title: "alpha child" }),
      ),
    );
    sdk.event.emit(directory, idleEvent("ses_1"));

    expect(ids()).toEqual(["ses_1"]);
  });

  test("ignores events while the query is empty", () => {
    renderProvider();

    sdk.event.emit(
      directory,
      updatedEvent(session({ id: "ses_1", title: "alpha one" })),
    );

    expect(ids()).toEqual([]);
    expect(list()).not.toHaveBeenCalled();
  });

  test("ignores global-named events", async () => {
    list().mockImplementation(() =>
      Promise.resolve(
        result([session({ id: "ses_1", title: "alpha one", updated: 100 })]),
      ),
    );
    renderProvider();
    search.setQuery("alpha");
    await waitFor(() => expect(ids()).toEqual(["ses_1"]));

    sdk.event.emit(
      "global",
      updatedEvent(session({ id: "ses_1", title: "beta", updated: 300 })),
    );

    expect(search._store.state.results[0]?.title).toBe("alpha one");
  });
});
