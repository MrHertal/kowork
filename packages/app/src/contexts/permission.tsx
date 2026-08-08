// @opencode-ref: opencode/packages/app/src/context/permission.tsx
import type { PermissionRequest } from "@opencode-ai/sdk/v2/client";
import { Store } from "@tanstack/react-store";
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

import { useGlobalSDK } from "./global-sdk";
import {
  loadPersisted,
  Persist,
  resolveStorage,
  savePersisted,
} from "@/utils/persist";
import { usePlatform } from "./platform";
import { useGlobalSync } from "./global-sync";
import {
  acceptKey,
  autoRespondsPermission,
  directoryAcceptKey,
  isDirectoryAutoAccepting,
} from "./permission/auto-respond";

type PermissionRespondFn = (input: {
  sessionID: string;
  permissionID: string;
  response: "once" | "always" | "reject";
  directory?: string;
}) => void;

interface PermissionStore {
  autoAccept: Record<string, boolean>;
}

const MAX_RESPONDED = 1000;
const RESPONDED_TTL_MS = 60 * 60 * 1000;

const createDefaultStore = (): PermissionStore => ({ autoAccept: {} });

function migrate(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const data = value as Record<string, unknown>;
  if (data.autoAccept) return value;
  return {
    ...data,
    autoAccept:
      typeof data.autoAcceptEdits === "object" &&
      data.autoAcceptEdits &&
      !Array.isArray(data.autoAcceptEdits)
        ? data.autoAcceptEdits
        : {},
  };
}

const PERSIST_TARGET = Persist.global("permission", ["permission.v3"]);
PERSIST_TARGET.migrate = migrate;

function isNonAllowRule(rule: unknown) {
  if (!rule) return false;
  if (typeof rule === "string") return rule !== "allow";
  if (typeof rule !== "object") return false;
  if (Array.isArray(rule)) return false;
  for (const action of Object.values(rule)) {
    if (action !== "allow") return true;
  }
  return false;
}

function hasPermissionPromptRules(permission: unknown) {
  if (!permission) return false;
  if (typeof permission === "string") return permission !== "allow";
  if (typeof permission !== "object") return false;
  if (Array.isArray(permission)) return false;
  const config = permission as Record<string, unknown>;
  return Object.values(config).some(isNonAllowRule);
}

export interface PermissionContextValue {
  ready: boolean;
  respond: PermissionRespondFn;
  autoResponds: (permission: PermissionRequest, directory?: string) => boolean;
  isAutoAccepting: (sessionID: string, directory?: string) => boolean;
  isAutoAcceptingDirectory: (directory: string) => boolean;
  toggleAutoAccept: (sessionID: string, directory: string) => void;
  toggleAutoAcceptDirectory: (directory: string) => void;
  enableAutoAccept: (sessionID: string, directory: string) => void;
  disableAutoAccept: (sessionID: string, directory?: string) => void;
  permissionsEnabled: (directory: string) => boolean;
  isPermissionAllowAll: (directory: string) => boolean;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

interface PermissionProviderProps {
  children: ReactNode;
}

export function PermissionProvider({ children }: PermissionProviderProps) {
  const globalSDK = useGlobalSDK();
  const globalSync = useGlobalSync();

  const platform = usePlatform();
  const [store] = useState(
    () => new Store<PermissionStore>(createDefaultStore()),
  );
  const [ready, setReady] = useState(false);
  const dirty = useRef(false);
  const [storage] = useState(() => resolveStorage(platform, PERSIST_TARGET));

  useEffect(() => {
    let cancelled = false;
    void loadPersisted<PermissionStore>(
      storage,
      PERSIST_TARGET,
      createDefaultStore(),
    )
      .then((persisted) => {
        if (cancelled) return;
        store.setState(() => persisted);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[permission] failed to load persisted state", {
          error,
        });
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storage, store]);

  useEffect(() => {
    const sub = store.subscribe(() => {
      if (!ready) return;
      if (!dirty.current) return;
      dirty.current = false;
      void savePersisted(storage, PERSIST_TARGET, store.state);
    });
    return () => sub.unsubscribe();
  }, [storage, store, ready]);

  const disposed = useRef(false);

  const updateAutoAccept = useCallback(
    (update: (current: Record<string, boolean>) => Record<string, boolean>) => {
      dirty.current = true;
      store.setState((prev) => ({
        ...prev,
        autoAccept: update(prev.autoAccept),
      }));
    },
    [store],
  );

  const [maps] = useState(() => ({
    responded: new Map<string, number>(),
    enableVersion: new Map<string, number>(),
  }));

  const pruneResponded = useCallback(
    (now: number) => {
      for (const [id, ts] of maps.responded) {
        if (now - ts < RESPONDED_TTL_MS) break;
        maps.responded.delete(id);
      }
      for (const id of maps.responded.keys()) {
        if (maps.responded.size <= MAX_RESPONDED) break;
        maps.responded.delete(id);
      }
    },
    [maps],
  );

  const respond: PermissionRespondFn = useCallback(
    (input) => {
      globalSDK.client.permission.respond(input).catch(() => {
        maps.responded.delete(input.permissionID);
      });
    },
    [globalSDK, maps],
  );

  const respondOnce = useCallback(
    (permission: PermissionRequest, directory?: string) => {
      const now = Date.now();
      const hit = maps.responded.has(permission.id);
      maps.responded.delete(permission.id);
      maps.responded.set(permission.id, now);
      pruneResponded(now);
      if (hit) return;
      respond({
        sessionID: permission.sessionID,
        permissionID: permission.id,
        response: "once",
        directory,
      });
    },
    [maps, pruneResponded, respond],
  );

  const isAutoAccepting = useCallback(
    (sessionID: string, directory?: string) => {
      const sessions = directory
        ? globalSync._child(directory).state.session
        : [];
      return autoRespondsPermission(
        store.state.autoAccept,
        sessions,
        { sessionID },
        directory,
      );
    },
    [globalSync, store.state.autoAccept],
  );

  const isAutoAcceptingDir = useCallback(
    (directory: string) => {
      return isDirectoryAutoAccepting(store.state.autoAccept, directory);
    },
    [store.state.autoAccept],
  );

  const shouldAutoRespond = useCallback(
    (permission: PermissionRequest, directory?: string) => {
      const sessions = directory
        ? globalSync._child(directory).state.session
        : [];
      return autoRespondsPermission(
        store.state.autoAccept,
        sessions,
        permission,
        directory,
      );
    },
    [globalSync, store.state.autoAccept],
  );

  const bumpEnableVersion = useCallback(
    (sessionID: string, directory?: string) => {
      const key = acceptKey(sessionID, directory);
      const next = (maps.enableVersion.get(key) ?? 0) + 1;
      maps.enableVersion.set(key, next);
      return next;
    },
    [maps],
  );

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = globalSDK.event.listen((e) => {
      const event = e.details;
      if (event?.type !== "permission.asked") return;
      const perm = event.properties;
      if (!shouldAutoRespond(perm, e.name)) return;
      respondOnce(perm, e.name);
    });
    return unsubscribe;
  }, [globalSDK, shouldAutoRespond, respondOnce]);

  const enableDirectory = useCallback(
    (directory: string) => {
      const key = directoryAcceptKey(directory);
      updateAutoAccept((current) => ({ ...current, [key]: true }));

      globalSDK.client.permission
        .list({ directory })
        .then((x) => {
          if (disposed.current) return;
          if (!isDirectoryAutoAccepting(store.state.autoAccept, directory))
            return;
          for (const perm of x.data ?? []) {
            if (!perm?.id) continue;
            if (!shouldAutoRespond(perm, directory)) continue;
            respondOnce(perm, directory);
          }
        })
        .catch(() => undefined);
    },
    [
      globalSDK,
      updateAutoAccept,
      shouldAutoRespond,
      respondOnce,
      store.state.autoAccept,
    ],
  );

  const disableDirectory = useCallback(
    (directory: string) => {
      const key = directoryAcceptKey(directory);
      updateAutoAccept((current) => ({ ...current, [key]: false }));
    },
    [updateAutoAccept],
  );

  const enable = useCallback(
    (sessionID: string, directory: string) => {
      const key = acceptKey(sessionID, directory);
      const version = bumpEnableVersion(sessionID, directory);
      updateAutoAccept((current) => {
        const next = { ...current, [key]: true };
        delete next[sessionID];
        return next;
      });

      globalSDK.client.permission
        .list({ directory })
        .then((x) => {
          if (disposed.current) return;
          if (maps.enableVersion.get(key) !== version) return;
          if (
            !autoRespondsPermission(
              store.state.autoAccept,
              globalSync._child(directory).state.session,
              { sessionID },
              directory,
            )
          )
            return;
          for (const perm of x.data ?? []) {
            if (!perm?.id) continue;
            if (!shouldAutoRespond(perm, directory)) continue;
            respondOnce(perm, directory);
          }
        })
        .catch(() => undefined);
    },
    [
      globalSDK,
      globalSync,
      maps,
      bumpEnableVersion,
      updateAutoAccept,
      shouldAutoRespond,
      respondOnce,
      store.state.autoAccept,
    ],
  );

  const disable = useCallback(
    (sessionID: string, directory?: string) => {
      bumpEnableVersion(sessionID, directory);
      const key = directory ? acceptKey(sessionID, directory) : sessionID;
      updateAutoAccept((current) => {
        const next = { ...current, [key]: false };
        if (directory) delete next[sessionID];
        return next;
      });
    },
    [bumpEnableVersion, updateAutoAccept],
  );

  const toggleAutoAccept = useCallback(
    (sessionID: string, directory: string) => {
      if (isAutoAccepting(sessionID, directory)) {
        disable(sessionID, directory);
        return;
      }
      enable(sessionID, directory);
    },
    [isAutoAccepting, disable, enable],
  );

  const toggleAutoAcceptDirectory = useCallback(
    (directory: string) => {
      if (isAutoAcceptingDir(directory)) {
        disableDirectory(directory);
        return;
      }
      enableDirectory(directory);
    },
    [isAutoAcceptingDir, disableDirectory, enableDirectory],
  );

  const enableAutoAccept = useCallback(
    (sessionID: string, directory: string) => {
      if (isAutoAccepting(sessionID, directory)) return;
      enable(sessionID, directory);
    },
    [isAutoAccepting, enable],
  );

  const disableAutoAccept = useCallback(
    (sessionID: string, directory?: string) => {
      disable(sessionID, directory);
    },
    [disable],
  );

  const permissionsEnabled = useCallback(
    (directory: string) => {
      if (!directory) return false;
      const childStore = globalSync._child(directory);
      return hasPermissionPromptRules(childStore.state.config.permission);
    },
    [globalSync],
  );

  const isPermissionAllowAll = useCallback(
    (directory: string) => {
      const childStore = globalSync._child(directory);
      const perm = childStore.state.config.permission;
      return typeof perm === "string" && perm === "allow";
    },
    [globalSync],
  );

  const ctxValue = useMemo<PermissionContextValue>(
    () => ({
      ready,
      respond,
      autoResponds: shouldAutoRespond,
      isAutoAccepting,
      isAutoAcceptingDirectory: isAutoAcceptingDir,
      toggleAutoAccept,
      toggleAutoAcceptDirectory,
      enableAutoAccept,
      disableAutoAccept,
      permissionsEnabled,
      isPermissionAllowAll,
    }),
    [
      ready,
      respond,
      shouldAutoRespond,
      isAutoAccepting,
      isAutoAcceptingDir,
      toggleAutoAccept,
      toggleAutoAcceptDirectory,
      enableAutoAccept,
      disableAutoAccept,
      permissionsEnabled,
      isPermissionAllowAll,
    ],
  );

  return (
    <PermissionContext.Provider value={ctxValue}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission(): PermissionContextValue {
  const ctx = useContext(PermissionContext);
  if (!ctx)
    throw new Error("usePermission must be used within PermissionProvider");
  return ctx;
}
