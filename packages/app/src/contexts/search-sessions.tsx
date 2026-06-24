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

import { formatServerError, translate } from "@/utils/server-errors";

import { useGlobalSDK } from "./global-sdk";
import {
  compareSessionRecent,
  sessionUpdatedAt,
} from "./global-sync/session-trim";

const DEBOUNCE_MS = 250;
const MAX_RESULTS = 100;

export interface SearchSessionsState {
  query: string;
  results: Session[];
  loading: boolean;
}

const createDefaultState = (): SearchSessionsState => ({
  query: "",
  results: [],
  loading: false,
});

function warmSessionQuery(queryClient: QueryClient, session: Session) {
  queryClient.setQueryData(["session", session.id], session);
}

function insertSorted(sessions: Session[], session: Session) {
  const index = sessions.findIndex((s) => compareSessionRecent(session, s) < 0);
  if (index === -1) sessions.push(session);
  else sessions.splice(index, 0, session);
}

// Must mirror the server's search predicate (SQL LIKE '%query%' on title).
export function matchesQuery(
  title: string | undefined,
  trimmedQuery: string,
): boolean {
  if (!title) return false;
  return title.toLowerCase().includes(trimmedQuery.toLowerCase());
}

function reconcileResult(
  draft: SearchSessionsState,
  info: Session,
  queryClient: QueryClient,
) {
  const trimmed = draft.query.trim();
  if (trimmed === "") return;

  const existing = draft.results.findIndex((s) => s.id === info.id);
  const stillMatches = matchesQuery(info.title, trimmed);

  if (existing !== -1 && !stillMatches) {
    draft.results.splice(existing, 1);
    return;
  }
  if (existing === -1) return;

  const current = draft.results[existing]!;
  if (sessionUpdatedAt(info) < sessionUpdatedAt(current)) return;
  draft.results.splice(existing, 1);
  insertSorted(draft.results, info);
  warmSessionQuery(queryClient, info);
}

export interface SearchSessionsContextValue {
  _store: Store<SearchSessionsState>;
  setQuery(q: string): void;
}

const SearchSessionsContext = createContext<SearchSessionsContextValue | null>(
  null,
);

interface SearchSessionsProviderProps {
  children: ReactNode;
}

export function SearchSessionsProvider({
  children,
}: SearchSessionsProviderProps) {
  const globalSDK = useGlobalSDK();
  const queryClient = useQueryClient();

  const [stores] = useState(() => ({
    state: new Store<SearchSessionsState>(createDefaultState()),
  }));

  const mounted = useRef(true);
  const token = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const runSearchRef = useRef<(trimmed: string) => Promise<void>>(null!);

  const setLoading = useCallback(
    (value: boolean) => {
      stores.state.setState((prev) => {
        if (prev.loading === value) return prev;
        return { ...prev, loading: value };
      });
    },
    [stores],
  );

  const runSearch = useCallback(
    async (trimmed: string): Promise<void> => {
      const ticket = token.current;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      try {
        const result = await globalSDK.client.experimental.session.list(
          {
            roots: true,
            search: trimmed,
            limit: MAX_RESULTS,
          },
          { throwOnError: false, signal: controller.signal },
        );

        if (!mounted.current) return;
        if (ticket !== token.current) return;

        if (!result.response.ok) {
          throw new Error(
            `Session search failed (${result.response.status} ${result.response.statusText})`,
          );
        }

        const matches = (result.data ?? []).filter(
          (s) => !!s?.id && !s.time?.archived,
        );
        for (const session of matches) warmSessionQuery(queryClient, session);

        stores.state.setState((prev) => ({
          ...prev,
          results: matches.slice().sort(compareSessionRecent),
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!mounted.current) return;
        if (ticket !== token.current) return;
        console.error("[search-sessions] failed to search sessions", {
          error,
        });
        toast.error(translate("toast.session.listAllFailed.title"), {
          description: formatServerError(error, translate),
        });
      } finally {
        if (abort.current === controller) abort.current = null;
        if (ticket === token.current && mounted.current) setLoading(false);
      }
    },
    [globalSDK, queryClient, stores, setLoading],
  );

  runSearchRef.current = runSearch;

  const setQuery = useCallback(
    (q: string) => {
      stores.state.setState((prev) => {
        if (prev.query === q) return prev;
        return { ...prev, query: q };
      });
    },
    [stores],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let lastQuery = stores.state.state.query.trim();

    const handle = (trimmed: string) => {
      if (trimmed === "") {
        token.current++;
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        abort.current?.abort();
        stores.state.setState((prev) => {
          if (prev.results.length === 0 && !prev.loading) return prev;
          return { ...prev, results: [], loading: false };
        });
        return;
      }
      token.current++;
      if (timer.current) clearTimeout(timer.current);
      setLoading(true);
      timer.current = setTimeout(() => {
        timer.current = null;
        void runSearchRef.current(trimmed);
      }, DEBOUNCE_MS);
    };

    handle(lastQuery);

    const sub = stores.state.subscribe(() => {
      const next = stores.state.state.query.trim();
      if (next === lastQuery) return;
      lastQuery = next;
      handle(next);
    });

    return () => {
      sub.unsubscribe();
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      abort.current?.abort();
    };
  }, [stores, setLoading]);

  useEffect(() => {
    const unsub = globalSDK.event.listen((e) => {
      if (e.name === "global") return;
      if (stores.state.state.query.trim() === "") return;
      applyEvent({
        event: e.details,
        setState: (fn) => stores.state.setState((prev) => produce(prev, fn)),
        queryClient,
      });
    });
    return unsub;
  }, [globalSDK.event, stores, queryClient]);

  const ctxValue = useMemo<SearchSessionsContextValue>(
    () => ({
      _store: stores.state,
      setQuery,
    }),
    [stores, setQuery],
  );

  return (
    <SearchSessionsContext.Provider value={ctxValue}>
      {children}
    </SearchSessionsContext.Provider>
  );
}

function applyEvent(input: {
  event: { type: string; properties?: unknown };
  setState: (fn: (draft: SearchSessionsState) => void) => void;
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
          const existing = draft.results.findIndex((s) => s.id === info.id);
          if (existing !== -1) draft.results.splice(existing, 1);
        });
        return;
      }
      input.setState((draft) =>
        reconcileResult(draft, info, input.queryClient),
      );
      break;
    }
    case "session.deleted": {
      input.queryClient.removeQueries({ queryKey: ["session", info.id] });
      if (info.parentID) return;
      input.setState((draft) => {
        const existing = draft.results.findIndex((s) => s.id === info.id);
        if (existing !== -1) draft.results.splice(existing, 1);
      });
      break;
    }
  }
}

export function useSearchSessions(): SearchSessionsContextValue {
  const ctx = useContext(SearchSessionsContext);
  if (!ctx)
    throw new Error(
      "useSearchSessions must be used within SearchSessionsProvider",
    );
  return ctx;
}

export function useSearchSessionsData<T>(
  selector: (state: SearchSessionsState) => T,
  compare?: (a: T, b: T) => boolean,
): T {
  const store = useSearchSessions()._store;
  return useStore(store, selector, compare);
}
