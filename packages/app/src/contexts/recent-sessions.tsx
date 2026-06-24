import type { Session } from "@opencode-ai/sdk/v2/client";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Store, useStore } from "@tanstack/react-store";
import { produce } from "immer";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { HttpError, retry } from "@/utils/retry";
import { formatServerError, translate } from "@/utils/server-errors";

import { useGlobalSDK } from "./global-sdk";
import {
  compareSessionRecent,
  sessionUpdatedAt,
} from "./global-sync/session-trim";

const PAGE_SIZE = 25;
const EVENT_BUFFER_MAX = 100;

export interface RecentSessionsState {
  sessions: Session[];
  cursor: number | null;
  loading: boolean;
}

const createDefaultState = (): RecentSessionsState => ({
  sessions: [],
  cursor: null,
  loading: false,
});

function warmSessionQuery(queryClient: QueryClient, session: Session) {
  queryClient.setQueryData(["session", session.id], session);
}

function parseCursor(headers: Headers): number | null {
  const raw = headers.get("x-next-cursor");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function insertSorted(sessions: Session[], session: Session) {
  const index = sessions.findIndex((s) => compareSessionRecent(session, s) < 0);
  if (index === -1) sessions.push(session);
  else sessions.splice(index, 0, session);
}

function upsertWithinWindow(draft: RecentSessionsState, info: Session) {
  const existing = draft.sessions.findIndex((s) => s.id === info.id);
  if (existing !== -1) {
    const current = draft.sessions[existing]!;
    if (sessionUpdatedAt(info) < sessionUpdatedAt(current)) return;
    draft.sessions.splice(existing, 1);
    insertSorted(draft.sessions, info);
    return;
  }
  if (draft.cursor != null) {
    const oldest = draft.sessions[draft.sessions.length - 1];
    if (oldest && sessionUpdatedAt(info) < sessionUpdatedAt(oldest)) return;
  }
  insertSorted(draft.sessions, info);
}

export interface RecentSessionsContextValue {
  _store: Store<RecentSessionsState>;
  loadMore(): Promise<void>;
  retry(): Promise<void>;
}

const RecentSessionsContext = createContext<RecentSessionsContextValue | null>(
  null,
);

interface RecentSessionsProviderProps {
  children: ReactNode;
}

export function RecentSessionsProvider({
  children,
}: RecentSessionsProviderProps) {
  const globalSDK = useGlobalSDK();
  const queryClient = useQueryClient();

  const [stores] = useState(() => ({
    state: new Store<RecentSessionsState>(createDefaultState()),
  }));

  const booted = useRef(false);
  const mounted = useRef(true);
  const pending = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);
  const eventBuffer = useRef<Array<{ type: string; properties?: unknown }>>([]);

  const setLoading = useCallback(
    (value: boolean) => {
      stores.state.setState((prev) => {
        if (prev.loading === value) return prev;
        return produce(prev, (d) => {
          d.loading = value;
        });
      });
    },
    [stores],
  );

  const fetchPage = useCallback(
    (cursor: number | null): Promise<void> =>
      retry(async () => {
        const result = await globalSDK.client.experimental.session.list(
          {
            roots: true,
            limit: PAGE_SIZE,
            ...(cursor != null ? { cursor } : {}),
          },
          { throwOnError: false },
        );

        if (!mounted.current) return;

        if (!result.response.ok) {
          throw new HttpError(
            result.response.status,
            result.response.statusText,
            `Session list failed (${result.response.status} ${result.response.statusText})`,
          );
        }

        const page = (result.data ?? []).filter(
          (s) => !!s?.id && !s.time?.archived,
        );
        for (const session of page) warmSessionQuery(queryClient, session);
        const nextCursor = parseCursor(result.response.headers);

        stores.state.setState((prev) =>
          produce(prev, (d) => {
            if (cursor == null) {
              d.sessions = page.slice().sort(compareSessionRecent);
            } else {
              const seen = new Set(d.sessions.map((s) => s.id));
              for (const session of page) {
                if (seen.has(session.id)) continue;
                insertSorted(d.sessions, session);
              }
            }
            d.cursor = nextCursor;
          }),
        );
      }),
    [globalSDK, stores, queryClient],
  );

  const withLoading = useCallback(
    async (run: () => Promise<void>): Promise<void> => {
      pending.current++;
      if (pending.current === 1) setLoading(true);
      try {
        await run();
      } finally {
        pending.current--;
        if (pending.current === 0 && mounted.current) setLoading(false);
      }
    },
    [setLoading],
  );

  const boot = useCallback((): Promise<void> => {
    if (booted.current) return Promise.resolve();
    if (inflight.current) return inflight.current;
    const promise = withLoading(async () => {
      try {
        await fetchPage(null);
        booted.current = true;
        if (eventBuffer.current.length > 0) {
          const events = eventBuffer.current;
          eventBuffer.current = [];
          for (const event of events) {
            applyEvent({
              event,
              setState: (fn) =>
                stores.state.setState((prev) => produce(prev, fn)),
              queryClient,
            });
          }
        }
      } catch (error) {
        if (!mounted.current) return;
        console.error("[recent-sessions] failed to load sessions", { error });
        toast.error(translate("toast.session.listAllFailed.title"), {
          description: formatServerError(error, translate),
        });
      }
    });
    inflight.current = promise;
    void promise.finally(() => {
      if (inflight.current === promise) inflight.current = null;
    });
    return promise;
  }, [fetchPage, stores, queryClient, withLoading]);

  const loadMore = useCallback(
    (): Promise<void> =>
      withLoading(async () => {
        while (inflight.current) {
          await inflight.current;
        }
        if (!mounted.current) return;
        const cursor = stores.state.state.cursor;
        if (cursor == null) return;
        const promise = fetchPage(cursor).catch((error) => {
          if (!mounted.current) return;
          console.error("[recent-sessions] failed to load sessions", {
            error,
          });
          toast.error(translate("toast.session.listAllFailed.title"), {
            description: formatServerError(error, translate),
          });
        });
        inflight.current = promise;
        try {
          await promise;
        } finally {
          if (inflight.current === promise) inflight.current = null;
        }
      }),
    [fetchPage, stores, withLoading],
  );

  useEffect(() => {
    mounted.current = true;
    void boot();
    return () => {
      mounted.current = false;
    };
  }, [boot]);

  useEffect(() => {
    const unsub = globalSDK.event.listen((e) => {
      if (e.name === "global") return;
      if (!booted.current) {
        if (eventBuffer.current.length >= EVENT_BUFFER_MAX) {
          eventBuffer.current.shift();
        }
        eventBuffer.current.push(e.details);
        return;
      }
      applyEvent({
        event: e.details,
        setState: (fn) => stores.state.setState((prev) => produce(prev, fn)),
        queryClient,
      });
    });
    return unsub;
  }, [globalSDK.event, stores, queryClient]);

  const ctxValue = useMemo<RecentSessionsContextValue>(
    () => ({
      _store: stores.state,
      loadMore,
      retry: boot,
    }),
    [stores, loadMore, boot],
  );

  return (
    <RecentSessionsContext.Provider value={ctxValue}>
      {children}
    </RecentSessionsContext.Provider>
  );
}

function applyEvent(input: {
  event: { type: string; properties?: unknown };
  setState: (fn: (draft: RecentSessionsState) => void) => void;
  queryClient: QueryClient;
}) {
  const info = (input.event.properties as { info?: Session })?.info;
  if (!info) return;

  switch (input.event.type) {
    case "session.created":
    case "session.updated": {
      if (info.parentID) return;
      if (info.time?.archived) {
        input.setState((draft) => {
          const existing = draft.sessions.findIndex((s) => s.id === info.id);
          if (existing !== -1) draft.sessions.splice(existing, 1);
        });
        return;
      }
      warmSessionQuery(input.queryClient, info);
      input.setState((draft) => upsertWithinWindow(draft, info));
      break;
    }
    case "session.deleted": {
      input.queryClient.removeQueries({ queryKey: ["session", info.id] });
      if (info.parentID) return;
      input.setState((draft) => {
        const existing = draft.sessions.findIndex((s) => s.id === info.id);
        if (existing !== -1) draft.sessions.splice(existing, 1);
      });
      break;
    }
  }
}

export function useRecentSessions(): RecentSessionsContextValue {
  const ctx = useContext(RecentSessionsContext);
  if (!ctx)
    throw new Error(
      "useRecentSessions must be used within RecentSessionsProvider",
    );
  return ctx;
}

export function useRecentSessionsData<T>(
  selector: (state: RecentSessionsState) => T,
  compare?: (a: T, b: T) => boolean,
): T {
  const store = useRecentSessions()._store;
  return useStore(store, selector, compare);
}
