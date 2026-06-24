import type { Session } from "@opencode-ai/sdk/v2/client";
import { useQueryClient } from "@tanstack/react-query";
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

import { m } from "@/paraglide/messages";
import {
  Persist,
  loadPersisted,
  resolveStorage,
  savePersisted,
} from "@/utils/persist";
import { HttpError, retry } from "@/utils/retry";

import { useGlobalSDK } from "./global-sdk";
import { usePlatform } from "./platform";

export const MAX_PINNED_SESSIONS = 20;

const PERSIST_TARGET = Persist.global("pinned-sessions");

export interface PinnedSessionsState {
  ready: boolean;
  ids: string[];
  sessions: Record<string, Session>;
}

interface PersistedShape {
  ids: string[];
}

const createDefaultState = (): PinnedSessionsState => ({
  ready: false,
  ids: [],
  sessions: {},
});

export interface PinnedSessionsContextValue {
  _store: Store<PinnedSessionsState>;
  pin(session: Session): void;
  unpin(sessionID: string): void;
}

const PinnedSessionsContext = createContext<PinnedSessionsContextValue | null>(
  null,
);

interface PinnedSessionsProviderProps {
  children: ReactNode;
}

export function PinnedSessionsProvider({
  children,
}: PinnedSessionsProviderProps) {
  const platform = usePlatform();
  const globalSDK = useGlobalSDK();
  const queryClient = useQueryClient();

  const [stores] = useState(() => ({
    state: new Store<PinnedSessionsState>(createDefaultState()),
  }));
  const dirty = useRef(false);
  const hydrated = useRef(false);

  const [storage] = useState(() => resolveStorage(platform, PERSIST_TARGET));

  useEffect(() => {
    let cancelled = false;
    void loadPersisted<PersistedShape>(storage, PERSIST_TARGET, { ids: [] })
      .then((persisted) => {
        if (cancelled) return;
        const ids = Array.isArray(persisted.ids) ? persisted.ids : [];
        stores.state.setState((prev) =>
          produce(prev, (d) => {
            d.ready = true;
            d.ids = ids;
          }),
        );
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[pinned-sessions] failed to load persisted state", {
          error,
        });
        stores.state.setState((prev) =>
          produce(prev, (d) => {
            d.ready = true;
          }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [storage, stores]);

  useEffect(() => {
    const sub = stores.state.subscribe(() => {
      if (!stores.state.state.ready) return;
      if (!dirty.current) return;
      dirty.current = false;
      savePersisted(storage, PERSIST_TARGET, {
        ids: stores.state.state.ids,
      } satisfies PersistedShape);
    });
    return () => sub.unsubscribe();
  }, [storage, stores]);

  useEffect(() => {
    let cancelled = false;
    const run = (snapshot: PinnedSessionsState) => {
      if (hydrated.current) return;
      if (!snapshot.ready) return;
      hydrated.current = true;

      if (snapshot.ids.length === 0) return;

      void Promise.allSettled(
        snapshot.ids.map((id) =>
          retry(async () => {
            const r = await globalSDK.client.session.get(
              { sessionID: id },
              { throwOnError: false },
            );
            if (r.response.ok) return r;
            if (r.response.status === 404) return r;
            throw new HttpError(r.response.status, r.response.statusText);
          }),
        ),
      ).then((results) => {
        if (cancelled) return;
        const fetched: Record<string, Session> = {};
        const orphans: string[] = [];
        for (let i = 0; i < results.length; i++) {
          const id = snapshot.ids[i]!;
          const result = results[i]!;
          if (result.status === "rejected") {
            console.error("[pinned-sessions] failed to fetch pinned session", {
              id,
              error: result.reason,
            });
            continue;
          }
          const { data, response } = result.value;
          if (response.status === 404) {
            orphans.push(id);
            continue;
          }
          if (!data) {
            console.error("[pinned-sessions] failed to fetch pinned session", {
              id,
              status: response.status,
            });
            continue;
          }
          if (data.parentID || data.time?.archived) {
            orphans.push(id);
            continue;
          }
          fetched[id] = data;
        }

        if (Object.keys(fetched).length === 0 && orphans.length === 0) return;

        for (const id of Object.keys(fetched)) {
          queryClient.setQueryData(["session", id], fetched[id]!);
        }
        if (orphans.length > 0) dirty.current = true;
        stores.state.setState((prev) =>
          produce(prev, (d) => {
            for (const id of Object.keys(fetched)) {
              d.sessions[id] = fetched[id]!;
            }
            if (orphans.length > 0) {
              const orphanSet = new Set(orphans);
              d.ids = d.ids.filter((id) => !orphanSet.has(id));
              for (const id of orphans) delete d.sessions[id];
            }
          }),
        );
      });
    };

    run(stores.state.state);
    if (hydrated.current) return;
    const sub = stores.state.subscribe(() => {
      if (cancelled) return;
      run(stores.state.state);
      if (hydrated.current) sub.unsubscribe();
    });
    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, [stores, globalSDK, queryClient]);

  useEffect(() => {
    const unsub = globalSDK.event.listen((e) => {
      const ev = e.details;
      if (ev.type !== "session.updated" && ev.type !== "session.deleted")
        return;
      const info = (ev.properties as { info?: Session }).info;
      if (!info) return;
      if (!stores.state.state.ids.includes(info.id)) return;

      if (
        ev.type === "session.deleted" ||
        info.parentID ||
        info.time?.archived
      ) {
        dirty.current = true;
        stores.state.setState((prev) =>
          produce(prev, (d) => {
            d.ids = d.ids.filter((id) => id !== info.id);
            delete d.sessions[info.id];
          }),
        );
        return;
      }

      stores.state.setState((prev) =>
        produce(prev, (d) => {
          d.sessions[info.id] = info;
        }),
      );
    });
    return unsub;
  }, [stores, globalSDK]);

  const pin = useCallback(
    (session: Session) => {
      if (session.parentID) return;
      const state = stores.state.state;
      if (state.ids.includes(session.id)) return;
      if (state.ids.length >= MAX_PINNED_SESSIONS) {
        toast.error(m.toast_pinnedSessions_capReached_title(), {
          description: m.toast_pinnedSessions_capReached_description({
            max: MAX_PINNED_SESSIONS,
          }),
        });
        return;
      }
      queryClient.setQueryData(["session", session.id], session);
      dirty.current = true;
      stores.state.setState((prev) =>
        produce(prev, (d) => {
          d.ids.push(session.id);
          d.sessions[session.id] = session;
        }),
      );
    },
    [stores, queryClient],
  );

  const unpin = useCallback(
    (sessionID: string) => {
      const state = stores.state.state;
      if (!state.ids.includes(sessionID)) return;
      dirty.current = true;
      stores.state.setState((prev) =>
        produce(prev, (d) => {
          d.ids = d.ids.filter((id) => id !== sessionID);
          delete d.sessions[sessionID];
        }),
      );
    },
    [stores],
  );

  const ctxValue = useMemo<PinnedSessionsContextValue>(
    () => ({
      _store: stores.state,
      pin,
      unpin,
    }),
    [stores, pin, unpin],
  );

  return (
    <PinnedSessionsContext.Provider value={ctxValue}>
      {children}
    </PinnedSessionsContext.Provider>
  );
}

export function usePinnedSessions(): PinnedSessionsContextValue {
  const ctx = useContext(PinnedSessionsContext);
  if (!ctx)
    throw new Error(
      "usePinnedSessions must be used within PinnedSessionsProvider",
    );
  return ctx;
}

export function usePinnedSessionsData<T>(
  selector: (state: PinnedSessionsState) => T,
  compare?: (a: T, b: T) => boolean,
): T {
  const store = usePinnedSessions()._store;
  return useStore(store, selector, compare);
}
