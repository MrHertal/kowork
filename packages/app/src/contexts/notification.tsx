// @opencode-ref: opencode/packages/app/src/context/notification.tsx
import type {
  EventSessionError,
  PermissionRequest,
} from "@opencode-ai/sdk/v2/client";
import { Store, useStore } from "@tanstack/react-store";
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

import { current, produce } from "immer";

import { m } from "@/paraglide/messages";
import { Binary } from "@/utils/binary";
import { base64Encode } from "@/utils/encode";
import { sessionTitle } from "@/utils/session-title";
import { playSoundById } from "@/utils/sound";
import { useGlobalSDK } from "./global-sdk";
import {
  Persist,
  loadPersisted,
  resolveStorage,
  savePersisted,
} from "@/utils/persist";
import { useGlobalSync } from "./global-sync";
import { usePermission } from "./permission";
import { usePlatform } from "./platform";
import { useSettings } from "./settings";

type NotificationBase = {
  directory?: string;
  session?: string;
  metadata?: unknown;
  time: number;
  viewed: boolean;
};

type TurnCompleteNotification = NotificationBase & {
  type: "turn-complete";
};

type ErrorNotification = NotificationBase & {
  type: "error";
  error: EventSessionError["properties"]["error"];
};

type NotificationIndex = {
  session: {
    all: Record<string, Notification[]>;
    unseen: Record<string, Notification[]>;
    unseenCount: Record<string, number>;
    unseenHasError: Record<string, boolean>;
  };
  project: {
    all: Record<string, Notification[]>;
    unseen: Record<string, Notification[]>;
    unseenCount: Record<string, number>;
    unseenHasError: Record<string, boolean>;
  };
};

const PERSIST_TARGET = Persist.global("notification", ["notification.v1"]);
const MAX_NOTIFICATIONS = 500;
const NOTIFICATION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function createNotificationIndex(): NotificationIndex {
  return {
    session: { all: {}, unseen: {}, unseenCount: {}, unseenHasError: {} },
    project: { all: {}, unseen: {}, unseenCount: {}, unseenHasError: {} },
  };
}

const createDefaultState = (): NotificationState => ({
  ready: false,
  list: [],
  index: createNotificationIndex(),
});

function pruneNotifications(list: Notification[]) {
  const cutoff = Date.now() - NOTIFICATION_TTL_MS;
  const pruned = list.filter((n) => n.time >= cutoff);
  if (pruned.length <= MAX_NOTIFICATIONS) return pruned;
  return pruned.slice(pruned.length - MAX_NOTIFICATIONS);
}

function buildNotificationIndex(list: Notification[]): NotificationIndex {
  const index = createNotificationIndex();

  for (const notification of list) {
    if (notification.session) {
      const all = index.session.all[notification.session] ?? [];
      index.session.all[notification.session] = [...all, notification];
      if (!notification.viewed) {
        const unseen = index.session.unseen[notification.session] ?? [];
        index.session.unseen[notification.session] = [...unseen, notification];
        index.session.unseenCount[notification.session] = unseen.length + 1;
        if (notification.type === "error")
          index.session.unseenHasError[notification.session] = true;
      }
    }

    if (notification.directory) {
      const all = index.project.all[notification.directory] ?? [];
      index.project.all[notification.directory] = [...all, notification];
      if (!notification.viewed) {
        const unseen = index.project.unseen[notification.directory] ?? [];
        index.project.unseen[notification.directory] = [
          ...unseen,
          notification,
        ];
        index.project.unseenCount[notification.directory] = unseen.length + 1;
        if (notification.type === "error")
          index.project.unseenHasError[notification.directory] = true;
      }
    }
  }

  return index;
}

export type Notification = TurnCompleteNotification | ErrorNotification;

export const EMPTY_NOTIFICATIONS: Notification[] = [];
const empty = EMPTY_NOTIFICATIONS;

export interface NotificationState {
  ready: boolean;
  list: Notification[];
  index: NotificationIndex;
}

export interface NotificationContextValue {
  _store: Store<NotificationState>;
  sessionMarkViewed: (session: string) => void;
  projectMarkViewed: (directory: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const globalSDK = useGlobalSDK();
  const globalSync = useGlobalSync();
  const permission = usePermission();
  const platform = usePlatform();
  const settings = useSettings();

  const [stores] = useState(() => ({
    state: new Store<NotificationState>(createDefaultState()),
  }));
  const dirty = useRef(false);
  const pruned = useRef(false);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const permissionRef = useRef(permission);
  permissionRef.current = permission;

  const [storage] = useState(() => resolveStorage(platform, PERSIST_TARGET));

  useEffect(() => {
    let cancelled = false;
    void loadPersisted(storage, PERSIST_TARGET, { list: [] as Notification[] })
      .then((persisted) => {
        if (cancelled) return;
        const list = Array.isArray(persisted.list) ? persisted.list : [];
        if (stores.state.state.list.length > 0) dirty.current = true;
        stores.state.setState((prev) =>
          produce(prev, (d) => {
            d.ready = true;
            const merged = pruneNotifications([...list, ...prev.list]);
            d.list = merged;
            d.index = buildNotificationIndex(merged);
          }),
        );
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[notification] failed to load persisted state", {
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
        list: stores.state.state.list,
      });
    });
    return () => sub.unsubscribe();
  }, [storage, stores]);

  useEffect(() => {
    const sub = stores.state.subscribe(() => {
      if (!stores.state.state.ready) return;
      if (pruned.current) return;
      pruned.current = true;
      sub.unsubscribe();
      const snapshot = stores.state.state;
      const list = pruneNotifications(snapshot.list);
      if (list.length !== snapshot.list.length) {
        dirty.current = true;
        stores.state.setState((prev) =>
          produce(prev, (d) => {
            d.list = list;
            d.index = buildNotificationIndex(list);
          }),
        );
      }
    });
    return () => sub.unsubscribe();
  }, [stores]);

  const append = useCallback(
    (notification: Notification) => {
      dirty.current = true;
      stores.state.setState((prev) =>
        produce(prev, (d) => {
          const list = pruneNotifications([...prev.list, notification]);
          d.list = list;
          d.index = buildNotificationIndex(list);
        }),
      );
    },
    [stores],
  );

  const lookup = useCallback(
    async (directory: string, sessionID?: string) => {
      if (!sessionID) return undefined;
      const syncStore = globalSync._child(directory);
      const match = Binary.search(
        syncStore.state.session,
        sessionID,
        (s) => s.id,
      );
      if (match.found) return syncStore.state.session[match.index];
      return globalSDK.client.session
        .get({ directory, sessionID })
        .then((x) => x.data)
        .catch(() => undefined);
    },
    [globalSync, globalSDK],
  );

  useEffect(() => {
    let disposed = false;
    const unsub = globalSDK.event.listen((e) => {
      const event = e.details;
      if (
        event.type !== "session.idle" &&
        event.type !== "session.error" &&
        event.type !== "permission.asked"
      )
        return;

      const directory = e.name;
      const time = Date.now();

      if (event.type === "permission.asked") {
        const perm = event.properties as PermissionRequest;
        if (permissionRef.current.autoResponds(perm, directory)) return;
        const sessionID = perm.sessionID;
        void lookup(directory, sessionID).then((session) => {
          if (disposed) return;
          if (session?.parentID) return;

          if (settingsRef.current.sounds.permissionsEnabled) {
            void playSoundById(settingsRef.current.sounds.permissions);
          }

          if (settingsRef.current.notifications.permissions) {
            const href = `/${base64Encode(directory)}/session/${sessionID}`;
            void platform.notify(
              m.notification_permission_title(),
              sessionTitle(session?.title) ?? sessionID,
              href,
            );
          }
        });
        return;
      }

      if (event.type === "session.idle") {
        const sessionID = event.properties.sessionID;
        void lookup(directory, sessionID).then((session) => {
          if (disposed) return;
          if (!session) return;
          if (session.parentID) return;

          if (settingsRef.current.sounds.agentEnabled) {
            void playSoundById(settingsRef.current.sounds.agent);
          }

          append({
            directory,
            time,
            viewed: false,
            type: "turn-complete",
            session: sessionID,
          });

          const href = `/${base64Encode(directory)}/session/${sessionID}`;
          if (settingsRef.current.notifications.agent) {
            void platform.notify(
              m.notification_session_responseReady_title(),
              sessionTitle(session.title) ?? sessionID,
              href,
            );
          }
        });
        return;
      }

      const sessionID = event.properties.sessionID;
      void lookup(directory, sessionID).then((session) => {
        if (disposed) return;
        if (session?.parentID) return;

        if (settingsRef.current.sounds.errorsEnabled) {
          void playSoundById(settingsRef.current.sounds.errors);
        }

        const error =
          "error" in event.properties ? event.properties.error : undefined;
        append({
          directory,
          time,
          viewed: false,
          type: "error",
          session: sessionID ?? "global",
          error,
        });

        const description =
          sessionTitle(session?.title) ??
          (typeof error === "string"
            ? error
            : m.notification_session_error_fallbackDescription());
        const href = sessionID
          ? `/${base64Encode(directory)}/session/${sessionID}`
          : `/${base64Encode(directory)}`;
        if (settingsRef.current.notifications.errors) {
          void platform.notify(
            m.notification_session_error_title(),
            description,
            href,
          );
        }
      });
    });

    return () => {
      disposed = true;
      unsub();
    };
  }, [globalSDK, lookup, append, platform]);

  const sessionMarkViewed = useCallback(
    (session: string) => {
      const unseen = stores.state.state.index.session.unseen[session] ?? empty;
      if (!unseen.length) return;

      dirty.current = true;
      stores.state.setState((prev) =>
        produce(prev, (d) => {
          for (const n of d.list) {
            if (n.session === session && !n.viewed) n.viewed = true;
          }
          d.index = buildNotificationIndex(current(d.list));
        }),
      );
    },
    [stores],
  );

  const projectMarkViewed = useCallback(
    (directory: string) => {
      const unseen =
        stores.state.state.index.project.unseen[directory] ?? empty;
      if (!unseen.length) return;

      dirty.current = true;
      stores.state.setState((prev) =>
        produce(prev, (d) => {
          for (const n of d.list) {
            if (n.directory === directory && !n.viewed) n.viewed = true;
          }
          d.index = buildNotificationIndex(current(d.list));
        }),
      );
    },
    [stores],
  );

  const ctxValue = useMemo<NotificationContextValue>(
    () => ({
      _store: stores.state,
      sessionMarkViewed,
      projectMarkViewed,
    }),
    [stores, sessionMarkViewed, projectMarkViewed],
  );

  return (
    <NotificationContext.Provider value={ctxValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error("useNotification must be used within NotificationProvider");
  return ctx;
}

export function useNotificationData<T>(
  selector: (state: NotificationState) => T,
  compare?: (a: T, b: T) => boolean,
): T {
  const store = useNotification()._store;
  return useStore(store, selector, compare);
}
