// @opencode-ref: opencode/packages/app/src/context/sync.tsx
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type {
  Message,
  Part,
  Project,
  Session,
} from "@opencode-ai/sdk/v2/client";
import { Binary } from "@/utils/binary";
import { retry } from "@/utils/retry";
import { diffs as list } from "@/utils/diffs";
import {
  shallowArrayEqual,
  useChildData,
  useGlobalSync,
} from "@/contexts/global-sync";
import { useSDK } from "@/contexts/sdk";
import { dropSessionCaches } from "@/contexts/global-sync/session-cache";
import type { State } from "@/contexts/global-sync/types";
import { keyFor, runInflight, sortParts } from "./sync/utils";
import {
  type OptimisticItem,
  applyOptimisticAdd,
  applyOptimisticRemove,
} from "./sync/optimistic";
import {
  type MetaState,
  initialMessagePageSize,
  historyMessagePageSize,
  loadMessages,
} from "./sync/message-load";

export type { OptimisticItem, MessagePage } from "./sync/optimistic";
export {
  mergeOptimisticPage,
  applyOptimisticAdd,
  applyOptimisticRemove,
} from "./sync/optimistic";

export interface SyncContextValue {
  readonly status: State["status"];
  readonly ready: boolean;
  readonly project: Project | undefined;
  readonly directory: string;
  absolute: (path: string) => string;
  session: {
    get: (sessionID: string) => Session | undefined;
    optimistic: {
      add: (input: {
        directory?: string;
        sessionID: string;
        message: Message;
        parts: Part[];
      }) => void;
      remove: (input: {
        directory?: string;
        sessionID: string;
        messageID: string;
      }) => void;
    };
    addOptimisticMessage: (input: {
      sessionID: string;
      messageID: string;
      parts: Part[];
      agent: string;
      model: { providerID: string; modelID: string };
      variant?: string;
    }) => void;
    rollbackOptimisticMessage: (input: {
      sessionID: string;
      messageID: string;
    }) => void;
    sync: (sessionID: string, opts?: { force?: boolean }) => Promise<void>;
    diff: (sessionID: string, opts?: { force?: boolean }) => Promise<void>;
    todo: (sessionID: string, opts?: { force?: boolean }) => Promise<void>;
    history: {
      more: (sessionID: string) => boolean;
      loading: (sessionID: string) => boolean;
      loadMore: (sessionID: string, count?: number) => Promise<void>;
    };
    evict: (sessionID: string, directory?: string) => void;
  };
}

const SyncContext = createContext<SyncContextValue | null>(null);

type Maps = {
  inflight: Map<string, Promise<void>>;
  inflightDiff: Map<string, Promise<void>>;
  inflightTodo: Map<string, Promise<void>>;
  optimistic: Map<string, Map<string, OptimisticItem>>;
};

interface SyncProviderProps {
  children: ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps) {
  const globalSync = useGlobalSync();
  const sdk = useSDK();

  const store = useMemo(
    () => globalSync._child(sdk.directory),
    [globalSync, sdk.directory],
  );

  useEffect(() => {
    void globalSync.bootstrapInstance(sdk.directory);
  }, [globalSync, sdk.directory]);

  const metaRef = useRef<MetaState>({
    limit: {},
    cursor: {},
    complete: {},
  });

  const mapsRef = useRef<Maps | null>(null);
  if (mapsRef.current == null) {
    mapsRef.current = {
      inflight: new Map(),
      inflightDiff: new Map(),
      inflightTodo: new Map(),
      optimistic: new Map(),
    };
  }

  const meta = metaRef.current;
  const maps = mapsRef.current;

  const ctxValue = useMemo<SyncContextValue>(() => {
    const setOptimistic = (
      directory: string,
      sessionID: string,
      item: OptimisticItem,
    ) => {
      const key = keyFor(directory, sessionID);
      const existing = maps.optimistic.get(key);
      if (existing) {
        existing.set(item.message.id, {
          message: item.message,
          parts: sortParts(item.parts),
        });
        return;
      }
      maps.optimistic.set(
        key,
        new Map([
          [
            item.message.id,
            { message: item.message, parts: sortParts(item.parts) },
          ],
        ]),
      );
    };

    const clearOptimistic = (
      directory: string,
      sessionID: string,
      messageID?: string,
    ) => {
      const key = keyFor(directory, sessionID);
      if (!messageID) {
        maps.optimistic.delete(key);
        return;
      }
      const existing = maps.optimistic.get(key);
      if (!existing) return;
      existing.delete(messageID);
      if (existing.size === 0) maps.optimistic.delete(key);
    };

    const getOptimistic = (directory: string, sessionID: string) => [
      ...(maps.optimistic.get(keyFor(directory, sessionID))?.values() ?? []),
    ];

    return {
      get status() {
        return store.state.status;
      },
      get ready() {
        return store.state.status !== "loading";
      },
      get project() {
        const state = store.state;
        const projects = globalSync._globalStore.state.project;
        const match = Binary.search(projects, state.project, (p) => p.id);
        if (match.found) return projects[match.index];
        return undefined;
      },
      get directory() {
        return store.state.path.directory;
      },
      absolute(path: string) {
        return (store.state.path.directory + "/" + path).replace("//", "/");
      },
      session: {
        get(sessionID: string) {
          const state = store.state;
          const match = Binary.search(state.session, sessionID, (s) => s.id);
          if (match.found) return state.session[match.index];
          return undefined;
        },
        optimistic: {
          add(input: {
            directory?: string;
            sessionID: string;
            message: Message;
            parts: Part[];
          }) {
            const dir = input.directory ?? sdk.directory;
            const gs = globalSync;
            setOptimistic(dir, input.sessionID, {
              message: input.message,
              parts: input.parts,
            });
            gs.updateChild(dir, (draft) => {
              applyOptimisticAdd(draft, {
                sessionID: input.sessionID,
                message: input.message,
                parts: input.parts,
              });
            });
          },
          remove(input: {
            directory?: string;
            sessionID: string;
            messageID: string;
          }) {
            const dir = input.directory ?? sdk.directory;
            const gs = globalSync;
            clearOptimistic(dir, input.sessionID, input.messageID);
            gs.updateChild(dir, (draft) => {
              applyOptimisticRemove(draft, input);
            });
          },
        },
        addOptimisticMessage(input: {
          sessionID: string;
          messageID: string;
          parts: Part[];
          agent: string;
          model: { providerID: string; modelID: string };
          variant?: string;
        }) {
          const directory = sdk.directory;
          const gs = globalSync;
          const message: Message = {
            id: input.messageID,
            sessionID: input.sessionID,
            role: "user",
            time: { created: Date.now() },
            agent: input.agent,
            model: { ...input.model, variant: input.variant },
          };
          setOptimistic(directory, input.sessionID, {
            message,
            parts: input.parts,
          });
          gs.updateChild(directory, (draft) => {
            applyOptimisticAdd(draft, {
              sessionID: input.sessionID,
              message,
              parts: input.parts,
            });
            draft.session_status[input.sessionID] = { type: "busy" };
          });
        },
        rollbackOptimisticMessage(input: {
          sessionID: string;
          messageID: string;
        }) {
          const directory = sdk.directory;
          const gs = globalSync;
          clearOptimistic(directory, input.sessionID, input.messageID);
          gs.updateChild(directory, (draft) => {
            applyOptimisticRemove(draft, {
              sessionID: input.sessionID,
              messageID: input.messageID,
            });
            draft.session_status[input.sessionID] = { type: "idle" };
          });
        },
        async sync(sessionID: string, opts?: { force?: boolean }) {
          const directory = sdk.directory;
          const client = sdk.client;
          const gs = globalSync;
          const childStore = gs._child(directory);
          const key = keyFor(directory, sessionID);

          return runInflight(maps.inflight, key, async () => {
            const hasSession = Binary.search(
              childStore.state.session,
              sessionID,
              (s) => s.id,
            ).found;
            const cached =
              childStore.state.message[sessionID] !== undefined &&
              meta.limit[key] !== undefined;
            if (cached && hasSession && !opts?.force) return;

            const cachedCount =
              childStore.state.message[sessionID]?.length ?? 0;
            const limit = Math.max(
              meta.limit[key] ?? initialMessagePageSize,
              cachedCount,
            );

            const sessionReq =
              hasSession && !opts?.force
                ? Promise.resolve()
                : retry(() => client.session.get({ sessionID })).then(
                    (session) => {
                      const data = session.data;
                      if (!data) return;
                      gs.updateChild(directory, (draft) => {
                        const match = Binary.search(
                          draft.session,
                          sessionID,
                          (s) => s.id,
                        );
                        if (match.found) {
                          draft.session[match.index] = data;
                        } else {
                          draft.session.splice(match.index, 0, data);
                        }
                      });
                    },
                  );

            const messagesReq =
              cached && !opts?.force
                ? Promise.resolve()
                : loadMessages({
                    directory,
                    client,
                    sessionID,
                    limit,
                    meta,
                    globalSync: gs,
                    getOptimistic,
                    clearOptimistic,
                  });

            await Promise.all([sessionReq, messagesReq]);
          });
        },
        async diff(sessionID: string, opts?: { force?: boolean }) {
          const directory = sdk.directory;
          const client = sdk.client;
          const gs = globalSync;
          const childStore = gs._child(directory);
          if (
            childStore.state.session_diff[sessionID] !== undefined &&
            !opts?.force
          )
            return;

          const key = keyFor(directory, sessionID);
          return runInflight(maps.inflightDiff, key, () =>
            retry(() => client.session.diff({ sessionID })).then((diff) => {
              gs.updateChild(directory, (draft) => {
                draft.session_diff[sessionID] = list(diff.data);
              });
            }),
          );
        },
        async todo(sessionID: string, opts?: { force?: boolean }) {
          const directory = sdk.directory;
          const client = sdk.client;
          const gs = globalSync;
          const childStore = gs._child(directory);
          if (childStore.state.todo[sessionID] !== undefined && !opts?.force)
            return;

          const key = keyFor(directory, sessionID);
          return runInflight(maps.inflightTodo, key, () =>
            retry(() => client.session.todo({ sessionID })).then((todo) => {
              gs.updateChild(directory, (draft) => {
                draft.todo[sessionID] = todo.data ?? [];
              });
            }),
          );
        },
        history: {
          more(sessionID: string) {
            const state = store.state;
            const key = keyFor(sdk.directory, sessionID);
            if (state.message[sessionID] === undefined) return false;
            if (meta.limit[key] === undefined) return false;
            if (meta.complete[key]) return false;
            return !!meta.cursor[key];
          },
          loading(sessionID: string) {
            const key = keyFor(sdk.directory, sessionID);
            return store.state.message_loading[key] ?? false;
          },
          async loadMore(sessionID: string, count?: number) {
            const directory = sdk.directory;
            const client = sdk.client;
            const key = keyFor(directory, sessionID);
            const step = count ?? historyMessagePageSize;
            if (store.state.message_loading[key]) return;
            if (meta.complete[key]) return;
            const before = meta.cursor[key];
            if (!before) return;

            await loadMessages({
              directory,
              client,
              sessionID,
              limit: step,
              before,
              mode: "prepend",
              meta,
              globalSync,
              getOptimistic,
              clearOptimistic,
            });
          },
        },
        evict(sessionID: string, directory?: string) {
          const dir = directory ?? sdk.directory;
          const gs = globalSync;
          const key = keyFor(dir, sessionID);
          gs.updateChild(dir, (draft) => {
            dropSessionCaches(draft, [sessionID]);
            delete draft.message_loading[key];
          });
          clearOptimistic(dir, sessionID);
          delete meta.limit[key];
          delete meta.cursor[key];
          delete meta.complete[key];
        },
      },
    };
  }, [sdk, store, globalSync, meta, maps]);

  return (
    <SyncContext.Provider value={ctxValue}>{children}</SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) {
    throw new Error("useSync must be used within a <SyncProvider>");
  }
  return value;
}

export function useSyncData<T>(
  selector: (state: State) => T,
  compare?: (a: T, b: T) => boolean,
): T {
  const sdk = useSDK();
  return useChildData(sdk.directory, selector, compare);
}

export { shallowArrayEqual };
