// @opencode-ref: opencode/packages/app/src/context/global-sync.tsx
import type {
  Config,
  OpencodeClient,
  Path,
  Project,
  ProviderAuthResponse,
  ProviderListResponse,
} from "@opencode-ai/sdk/v2/client";
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

import { queryOptions, skipToken, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getFilename } from "@/utils/path";
import { formatServerError, translate } from "@/utils/server-errors";
import { useGlobalSDK } from "./global-sdk";
import {
  bootstrapDirectory,
  bootstrapGlobal,
  clearProviderRev,
} from "./global-sync/bootstrap";
import {
  applyDirectoryEvent,
  applyGlobalEvent,
  cleanupDroppedSessionCaches,
} from "./global-sync/event-reducer";
import { createRefreshQueue } from "./global-sync/queue";
import {
  estimateRootSessionTotal,
  loadRootSessionsWithFallback,
} from "./global-sync/session-load";
import { trimSessions } from "./global-sync/session-trim";
import type { State } from "./global-sync/types";
import { SESSION_RECENT_LIMIT } from "./global-sync/types";

export type InitError = {
  name: string;
  data: Record<string, unknown>;
};

type GlobalStore = {
  ready: boolean;
  error?: InitError;
  path: Path;
  project: Project[];
  provider: ProviderListResponse;
  provider_auth: ProviderAuthResponse;
  config: Config;
  reload: undefined | "pending" | "complete";
};

export const loadSessionsQuery = (directory: string) =>
  queryOptions<null>({
    queryKey: [directory, "loadSessions"],
    queryFn: skipToken,
  });

const defaultGlobalState: GlobalStore = {
  ready: false,
  path: { state: "", config: "", worktree: "", directory: "", home: "" },
  project: [],
  provider: { all: [], connected: [], default: {} },
  provider_auth: {},
  config: {},
  reload: undefined,
};

const createDefaultState = (): State => ({
  status: "loading",
  agent: [],
  command: [],
  project: "",
  projectMeta: undefined,
  icon: undefined,
  provider_ready: false,
  provider: { all: [], connected: [], default: {} },
  config: {},
  path: { state: "", config: "", worktree: "", directory: "", home: "" },
  session: [],
  sessionTotal: 0,
  session_status: {},
  session_diff: {},
  todo: {},
  permission: {},
  question: {},
  mcp_ready: false,
  mcp: {},
  lsp_ready: false,
  lsp: [],
  vcs: undefined,
  limit: 5,
  message: {},
  message_loading: {},
  part: {},
});

export interface GlobalSyncContextValue {
  _globalStore: Store<GlobalStore>;
  updateGlobal: (fn: (draft: GlobalStore) => void) => void;
  _child: (directory: string) => Store<State>;
  updateChild: (directory: string, fn: (draft: State) => void) => void;
  bootstrap: () => Promise<void>;
  bootstrapInstance: (directory: string) => Promise<void>;
  updateConfig: (config: Config) => Promise<void>;
  project: {
    loadSessions: (directory: string) => Promise<void>;
  };
}

const GlobalSyncContext = createContext<GlobalSyncContextValue | null>(null);

interface GlobalSyncProviderProps {
  children: ReactNode;
}

export function GlobalSyncProvider({ children }: GlobalSyncProviderProps) {
  const globalSDK = useGlobalSDK();
  const queryClient = useQueryClient();

  const [stores] = useState(() => ({
    global: new Store<GlobalStore>(defaultGlobalState),
    children: new Map<string, Store<State>>(),
    sdkCache: new Map<string, OpencodeClient>(),
    sessionLoads: new Map<string, Promise<void>>(),
    sessionMeta: new Map<string, { limit: number }>(),
    booting: new Map<string, Promise<void>>(),
  }));

  const bootedAt = useRef(0);
  const bootingRoot = useRef(false);
  const bootingPromise = useRef<Promise<void> | null>(null);
  const bootstrapRef = useRef<() => Promise<void>>(null);
  const bootstrapInstanceRef =
    useRef<(directory: string) => Promise<void>>(null);

  const sdkFor = useCallback(
    (directory: string): OpencodeClient => {
      const cached = stores.sdkCache.get(directory);
      if (cached) return cached;
      const sdk = globalSDK.createClient({
        directory,
        throwOnError: true,
      });
      stores.sdkCache.set(directory, sdk);
      return sdk;
    },
    [stores, globalSDK],
  );

  const updateGlobal = useCallback(
    (fn: (draft: GlobalStore) => void) => {
      stores.global.setState((prev) => produce(prev, fn));
    },
    [stores],
  );

  const updateChild = useCallback(
    (directory: string, fn: (draft: State) => void) => {
      const store = stores.children.get(directory);
      if (!store) {
        if (import.meta.env.DEV) {
          console.warn(
            `[global-sync] updateChild dropped for missing directory "${directory}"`,
          );
        }
        return;
      }
      store.setState((prev) => produce(prev, fn));
    },
    [stores],
  );

  const child = useCallback(
    (directory: string): Store<State> => {
      const existing = stores.children.get(directory);
      if (existing) return existing;
      const store = new Store<State>(createDefaultState());
      stores.children.set(directory, store);
      return store;
    },
    [stores],
  );

  const loadSessions = useCallback(
    async (directory: string): Promise<void> => {
      const pending = stores.sessionLoads.get(directory);
      if (pending) return pending;

      const childStore = child(directory);
      const state = childStore.state;
      const meta = stores.sessionMeta.get(directory);
      if (meta && meta.limit >= state.limit) {
        const next = trimSessions(state.session, {
          limit: state.limit,
          permission: state.permission,
          protect: Object.keys(state.message),
        });
        if (next.length !== state.session.length) {
          childStore.setState((prev) =>
            produce(prev, (d) => {
              d.session = next;
              cleanupDroppedSessionCaches(d, next);
            }),
          );
        }
        return;
      }

      const limit = Math.max(
        state.limit + SESSION_RECENT_LIMIT,
        SESSION_RECENT_LIMIT,
      );

      const promise = queryClient
        .fetchQuery({
          ...loadSessionsQuery(directory),
          queryFn: () =>
            loadRootSessionsWithFallback({
              directory,
              limit,
              list: (query) =>
                globalSDK.client.session.list(query, { throwOnError: false }),
            })
              .then((x) => {
                const nonArchived = (x.data ?? [])
                  .filter((s) => !!s?.id)
                  .filter((s) => !s.time?.archived)
                  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
                childStore.setState((prev) =>
                  produce(prev, (d) => {
                    const childSessions = prev.session.filter(
                      (s) => !!s.parentID,
                    );
                    const sessions = trimSessions(
                      [...nonArchived, ...childSessions],
                      {
                        limit: prev.limit,
                        permission: prev.permission,
                        protect: Object.keys(prev.message),
                      },
                    );
                    d.session = sessions;
                    d.sessionTotal = estimateRootSessionTotal({
                      count: nonArchived.length,
                      limit: x.limit,
                      limited: x.limited,
                    });
                    cleanupDroppedSessionCaches(d, sessions);
                  }),
                );
                stores.sessionMeta.set(directory, { limit });
              })
              .catch((err) => {
                console.error("Failed to load sessions", err);
                const project = getFilename(directory);
                toast.error(
                  translate("toast.session.listFailed.title", { project }),
                  { description: formatServerError(err, translate) },
                );
              })
              .then(() => null),
        })
        .then(() => {});

      stores.sessionLoads.set(directory, promise);
      void promise.finally(() => {
        stores.sessionLoads.delete(directory);
      });
      return promise;
    },
    [stores, child, globalSDK, queryClient],
  );

  const bootstrapInstance = useCallback(
    async (directory: string): Promise<void> => {
      if (!directory) return;
      const pending = stores.booting.get(directory);
      if (pending) return pending;

      const promise = Promise.resolve().then(async () => {
        const childStore = child(directory);
        const sdk = sdkFor(directory);
        await bootstrapDirectory({
          directory,
          serverUrl: globalSDK.url,
          global: {
            config: stores.global.state.config,
            path: stores.global.state.path,
            project: stores.global.state.project,
            provider: stores.global.state.provider,
          },
          sdk,
          getState: () => childStore.state,
          setState: (fn) => childStore.setState((prev) => produce(prev, fn)),
          loadSessions,
          translate,
          queryClient,
        });
      });

      stores.booting.set(directory, promise);
      void promise.finally(() => {
        stores.booting.delete(directory);
      });
      return promise;
    },
    [stores, child, sdkFor, loadSessions, queryClient, globalSDK.url],
  );

  const bootstrap = useCallback(async () => {
    if (bootingPromise.current) return bootingPromise.current;
    bootingRoot.current = true;
    const promise = bootstrapGlobal({
      globalSDK: globalSDK.client,
      setGlobalStore: (fn) =>
        stores.global.setState((prev) => produce(prev, fn)),
    })
      .then(() => {
        bootedAt.current = Date.now();
      })
      .finally(() => {
        bootingRoot.current = false;
        bootingPromise.current = null;
      });
    bootingPromise.current = promise;
    return promise;
  }, [globalSDK, stores]);

  useEffect(() => {
    bootstrapRef.current = bootstrap;
    bootstrapInstanceRef.current = bootstrapInstance;
  });

  // The queue is created once but must invoke the latest bootstrap callbacks,
  // which carry per-mount inflight state — the ref indirection is intentional.
  // eslint-disable-next-line react-hooks/refs
  const [queue] = useState(() =>
    createRefreshQueue({
      paused: () => stores.global.state.reload !== undefined,
      bootstrap: () => bootstrapRef.current!(),
      bootstrapInstance: (directory) =>
        bootstrapInstanceRef.current!(directory),
    }),
  );

  const updateConfig = useCallback(
    async (config: Config) => {
      stores.global.setState((prev) =>
        produce(prev, (d) => {
          d.reload = "pending";
        }),
      );
      try {
        await globalSDK.client.global.config.update({ config });
        await bootstrap();
        // First refresh sets queue.root=true while paused; second one (after
        // clearing reload) actually schedules. Both are load-bearing — see
        // queue.ts paused() gate. Mirrors opencode/packages/app updateConfig.
        queue.refresh();
        stores.global.setState((prev) =>
          produce(prev, (d) => {
            d.reload = undefined;
          }),
        );
        queue.refresh();
      } catch (error) {
        stores.global.setState((prev) =>
          produce(prev, (d) => {
            d.reload = undefined;
          }),
        );
        throw error;
      }
    },
    [stores, globalSDK, bootstrap, queue],
  );

  useEffect(() => {
    let eventFrame: number | undefined;
    let eventTimer: ReturnType<typeof setTimeout> | undefined;

    if (typeof requestAnimationFrame === "function") {
      eventFrame = requestAnimationFrame(() => {
        eventFrame = undefined;
        eventTimer = setTimeout(() => {
          eventTimer = undefined;
          void globalSDK.event.start();
        }, 0);
      });
    } else {
      eventTimer = setTimeout(() => {
        eventTimer = undefined;
        void globalSDK.event.start();
      }, 0);
    }

    void bootstrap();

    return () => {
      if (eventFrame !== undefined) cancelAnimationFrame(eventFrame);
      if (eventTimer !== undefined) clearTimeout(eventTimer);
    };
  }, [bootstrap, globalSDK]);

  useEffect(() => {
    const unsub = globalSDK.event.listen((e) => {
      const directory = e.name;
      const event = e.details;
      const recent =
        bootingRoot.current || Date.now() - bootedAt.current < 1500;

      if (directory === "global") {
        applyGlobalEvent({
          event,
          project: stores.global.state.project,
          refresh: () => {
            if (recent) return;
            queue.refresh();
          },
          setGlobalProject: (next) => {
            stores.global.setState((prev) =>
              produce(prev, (d) => {
                d.project =
                  typeof next === "function"
                    ? produce(prev.project, next)
                    : next;
              }),
            );
          },
        });
        if (event.type === "server.connected" && !recent) {
          void queryClient.refetchQueries({
            queryKey: ["session-context-cost", globalSDK.url],
            type: "active",
          });
        }
        if (
          (event.type === "server.connected" ||
            event.type === "global.disposed") &&
          !recent
        ) {
          for (const directory of stores.children.keys()) {
            queue.push(directory);
          }
        }
        return;
      }

      const childStore = stores.children.get(directory);
      if (!childStore) return;

      applyDirectoryEvent({
        event,
        directory,
        getState: () => childStore.state,
        setState: (fn) => childStore.setState((prev) => produce(prev, fn)),
        push: queue.push,
        loadLsp: () => {
          void sdkFor(directory)
            .lsp.status()
            .then((x) => {
              childStore.setState((prev) =>
                produce(prev, (d) => {
                  d.lsp = x.data ?? [];
                  d.lsp_ready = true;
                }),
              );
            });
        },
      });
    });

    return () => {
      unsub();
    };
  }, [globalSDK.event, globalSDK.url, stores, queue, sdkFor, queryClient]);

  useEffect(() => {
    return () => {
      for (const directory of stores.children.keys()) {
        queue.clear(directory);
        clearProviderRev(globalSDK.url, directory);
      }
      queue.dispose();
      stores.children.clear();
      stores.sdkCache.clear();
      stores.sessionLoads.clear();
      stores.sessionMeta.clear();
      stores.booting.clear();
    };
  }, [globalSDK.url, stores, queue]);

  const ctxValue = useMemo<GlobalSyncContextValue>(
    () => ({
      _globalStore: stores.global,
      updateGlobal,
      _child: child,
      updateChild,
      bootstrap,
      bootstrapInstance,
      updateConfig,
      project: { loadSessions },
    }),
    [
      stores,
      updateGlobal,
      child,
      updateChild,
      bootstrap,
      bootstrapInstance,
      updateConfig,
      loadSessions,
    ],
  );

  return (
    <GlobalSyncContext.Provider value={ctxValue}>
      {children}
    </GlobalSyncContext.Provider>
  );
}

export function useGlobalSync(): GlobalSyncContextValue {
  const context = useContext(GlobalSyncContext);
  if (!context)
    throw new Error("useGlobalSync must be used within GlobalSyncProvider");
  return context;
}

export function useGlobalData<T>(
  selector: (state: GlobalStore) => T,
  compare?: (a: T, b: T) => boolean,
): T {
  const { _globalStore } = useGlobalSync();
  return useStore(_globalStore, selector, compare);
}

export function useChildData<T>(
  directory: string,
  selector: (state: State) => T,
  compare?: (a: T, b: T) => boolean,
): T {
  const ctx = useGlobalSync();
  const store = ctx._child(directory);
  useEffect(() => {
    void ctx.bootstrapInstance(directory);
  }, [ctx, directory]);
  return useStore(store, selector, compare);
}

export function shallowArrayEqual<T>(
  a: readonly T[],
  b: readonly T[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
