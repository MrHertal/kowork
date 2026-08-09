// @vitest-environment jsdom
import type {
  Event,
  OpencodeClient,
  PermissionRequest,
  Session,
} from "@opencode-ai/sdk/v2/client";
import { Store } from "@tanstack/react-store";
import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  PlatformProvider,
  type AsyncStorage,
  type Platform,
} from "@/contexts/platform";
import type { NotificationSettings, SoundSettings } from "@/contexts/settings";
import { m } from "@/paraglide/messages";
import { base64Encode } from "@/utils/encode";
import { createEmitter } from "@/utils/emitter";
import { playSoundById } from "@/utils/sound";
import type { State } from "./global-sync/types";
import {
  NotificationProvider,
  useNotification,
  type Notification,
  type NotificationContextValue,
} from "./notification";
import type { PermissionContextValue } from "./permission";

const directory = "/tmp/project";

const session = (input: { id: string; parentID?: string; title?: string }) =>
  ({
    id: input.id,
    parentID: input.parentID,
    title: input.title ?? input.id,
    time: { created: 1, updated: 1 },
  }) as Session;

const permissionRequest = (id: string, sessionID: string) =>
  ({
    id,
    sessionID,
    permission: "bash",
    patterns: ["*"],
    metadata: {},
    always: [],
  }) as PermissionRequest;

const idleEvent = (sessionID: string): Event => ({
  id: `evt_idle_${sessionID}`,
  type: "session.idle",
  properties: { sessionID },
});

const errorEvent = (sessionID: string): Event => ({
  id: `evt_error_${sessionID}`,
  type: "session.error",
  properties: {
    sessionID,
    error: { name: "UnknownError", data: { message: "boom" } },
  },
});

const askedEvent = (request: PermissionRequest): Event => ({
  id: `evt_${request.id}`,
  type: "permission.asked",
  properties: request,
});

const turnComplete = (input: {
  session: string;
  time?: number;
  viewed?: boolean;
}): Notification => ({
  type: "turn-complete",
  directory,
  session: input.session,
  time: input.time ?? Date.now(),
  viewed: input.viewed ?? false,
});

type EventMap = { [key: string]: Event };

const child = new Store<Pick<State, "session">>({ session: [] });

const sync = {
  _child: () => child,
};

type SessionGetInput = Parameters<OpencodeClient["session"]["get"]>[0];

const sdk = {
  client: {
    session: {
      get: vi.fn<(input: SessionGetInput) => Promise<{ data?: Session }>>(() =>
        Promise.resolve({ data: undefined }),
      ),
    },
  },
  event: createEmitter<EventMap>(),
};

const permission = {
  autoResponds: vi.fn<PermissionContextValue["autoResponds"]>(() => false),
};

const settings: {
  notifications: NotificationSettings;
  sounds: SoundSettings;
} = {
  notifications: { agent: true, permissions: true, errors: true },
  sounds: {
    agentEnabled: true,
    agent: "staplebops-01",
    permissionsEnabled: true,
    permissions: "staplebops-02",
    errorsEnabled: true,
    errors: "nope-03",
  },
};

vi.mock("@/contexts/global-sdk", () => ({
  useGlobalSDK: () => sdk,
}));

vi.mock("@/contexts/global-sync", () => ({
  useGlobalSync: () => sync,
}));

vi.mock("@/contexts/permission", () => ({
  usePermission: () => permission,
}));

vi.mock("@/contexts/settings", () => ({
  useSettings: () => settings,
}));

vi.mock("@/utils/sound", () => ({
  playSoundById: vi.fn<(id: string | undefined) => Promise<void>>(() =>
    Promise.resolve(),
  ),
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
let platform: Platform;

const notified = () => vi.mocked(platform.notify);

beforeEach(() => {
  vi.clearAllMocks();
  sdk.client.session.get.mockImplementation(() =>
    Promise.resolve({ data: undefined }),
  );
  sdk.event = createEmitter<EventMap>();
  child.setState(() => ({ session: [] }));
  permission.autoResponds.mockImplementation(() => false);
  settings.notifications.agent = true;
  settings.notifications.permissions = true;
  settings.notifications.errors = true;
  settings.sounds.agentEnabled = true;
  settings.sounds.permissionsEnabled = true;
  settings.sounds.errorsEnabled = true;
  memory = new Map();
  platform = {
    platform: "web",
    openLink: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    restart: () => Promise.resolve(),
    notify: vi.fn(() => Promise.resolve()),
    storage: () => createStorage(memory),
  };
});

let notifications: NotificationContextValue;

function Capture() {
  const ctx = useNotification();
  useEffect(() => {
    notifications = ctx;
  });
  return null;
}

async function setup() {
  render(
    <PlatformProvider value={platform}>
      <NotificationProvider>
        <Capture />
      </NotificationProvider>
    </PlatformProvider>,
  );
  await waitFor(() => expect(notifications._store.state.ready).toBe(true));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("NotificationProvider", () => {
  test("records a turn-complete notification on session.idle", async () => {
    child.setState(() => ({
      session: [session({ id: "ses_1", title: "Quarterly report" })],
    }));
    await setup();

    sdk.event.emit(directory, idleEvent("ses_1"));

    await waitFor(() =>
      expect(notifications._store.state.list).toHaveLength(1),
    );
    const [item] = notifications._store.state.list;
    expect(item).toMatchObject({
      type: "turn-complete",
      directory,
      session: "ses_1",
      viewed: false,
    });
    const index = notifications._store.state.index;
    expect(index.session.unseenCount["ses_1"]).toBe(1);
    expect(index.project.unseenCount[directory]).toBe(1);
    expect(index.session.unseenHasError["ses_1"]).toBeUndefined();

    expect(vi.mocked(playSoundById)).toHaveBeenCalledWith("staplebops-01");
    expect(notified()).toHaveBeenCalledWith(
      m.notification_session_responseReady_title(),
      "Quarterly report",
      `/${base64Encode(directory)}/session/ses_1`,
    );
  });

  test("skips session.idle for child sessions", async () => {
    child.setState(() => ({
      session: [
        session({ id: "ses_1" }),
        session({ id: "ses_2", parentID: "ses_1" }),
      ],
    }));
    await setup();

    sdk.event.emit(directory, idleEvent("ses_2"));
    await flush();

    expect(notifications._store.state.list).toHaveLength(0);
    expect(notified()).not.toHaveBeenCalled();
    expect(vi.mocked(playSoundById)).not.toHaveBeenCalled();
  });

  test("falls back to the session API for sessions missing from the sync store", async () => {
    sdk.client.session.get.mockImplementation(() =>
      Promise.resolve({
        data: session({ id: "ses_9", title: "Fetched task" }),
      }),
    );
    await setup();

    sdk.event.emit(directory, idleEvent("ses_9"));

    await waitFor(() =>
      expect(notifications._store.state.list).toHaveLength(1),
    );
    expect(notified()).toHaveBeenCalledWith(
      m.notification_session_responseReady_title(),
      "Fetched task",
      `/${base64Encode(directory)}/session/ses_9`,
    );
  });

  test("records an error notification on session.error", async () => {
    child.setState(() => ({ session: [session({ id: "ses_1" })] }));
    await setup();

    sdk.event.emit(directory, errorEvent("ses_1"));

    await waitFor(() =>
      expect(notifications._store.state.list).toHaveLength(1),
    );
    const [item] = notifications._store.state.list;
    expect(item).toMatchObject({ type: "error", session: "ses_1" });
    const index = notifications._store.state.index;
    expect(index.session.unseenHasError["ses_1"]).toBe(true);
    expect(index.project.unseenHasError[directory]).toBe(true);
    expect(vi.mocked(playSoundById)).toHaveBeenCalledWith("nope-03");
    expect(notified()).toHaveBeenCalledWith(
      m.notification_session_error_title(),
      "ses_1",
      `/${base64Encode(directory)}/session/ses_1`,
    );
  });

  test("ignores permission requests that are auto-responded", async () => {
    permission.autoResponds.mockImplementation(() => true);
    child.setState(() => ({ session: [session({ id: "ses_1" })] }));
    await setup();

    sdk.event.emit(directory, askedEvent(permissionRequest("perm_1", "ses_1")));
    await flush();

    expect(permission.autoResponds).toHaveBeenCalledWith(
      expect.objectContaining({ id: "perm_1" }),
      directory,
    );
    expect(notifications._store.state.list).toHaveLength(0);
    expect(notified()).not.toHaveBeenCalled();
    expect(vi.mocked(playSoundById)).not.toHaveBeenCalled();
  });

  test("notifies without recording when a permission request needs approval", async () => {
    child.setState(() => ({
      session: [session({ id: "ses_1", title: "Review" })],
    }));
    await setup();

    sdk.event.emit(directory, askedEvent(permissionRequest("perm_1", "ses_1")));

    await waitFor(() => expect(notified()).toHaveBeenCalled());
    expect(notified()).toHaveBeenCalledWith(
      m.notification_permission_title(),
      "Review",
      `/${base64Encode(directory)}/session/ses_1`,
    );
    expect(vi.mocked(playSoundById)).toHaveBeenCalledWith("staplebops-02");
    expect(notifications._store.state.list).toHaveLength(0);
  });

  test("skips permission notifications for child sessions", async () => {
    child.setState(() => ({
      session: [
        session({ id: "ses_1" }),
        session({ id: "ses_2", parentID: "ses_1" }),
      ],
    }));
    await setup();

    sdk.event.emit(directory, askedEvent(permissionRequest("perm_1", "ses_2")));
    await flush();

    expect(notified()).not.toHaveBeenCalled();
    expect(vi.mocked(playSoundById)).not.toHaveBeenCalled();
  });

  test("sessionMarkViewed clears unseen state for one session", async () => {
    child.setState(() => ({
      session: [session({ id: "ses_1" }), session({ id: "ses_2" })],
    }));
    await setup();

    for (const sessionID of ["ses_1", "ses_1", "ses_2"]) {
      sdk.event.emit(directory, idleEvent(sessionID));
    }
    await waitFor(() =>
      expect(notifications._store.state.list).toHaveLength(3),
    );

    notifications.sessionMarkViewed("ses_1");

    const state = notifications._store.state;
    expect(
      state.list
        .filter((item) => item.session === "ses_1")
        .every((item) => item.viewed),
    ).toBe(true);
    expect(state.list.find((item) => item.session === "ses_2")?.viewed).toBe(
      false,
    );
    expect(state.index.session.unseenCount["ses_1"]).toBeUndefined();
    expect(state.index.session.unseenCount["ses_2"]).toBe(1);
    expect(state.index.project.unseenCount[directory]).toBe(1);
  });

  test("projectMarkViewed clears unseen state for the directory", async () => {
    child.setState(() => ({ session: [session({ id: "ses_1" })] }));
    await setup();

    sdk.event.emit(directory, idleEvent("ses_1"));
    sdk.event.emit(directory, errorEvent("ses_1"));
    await waitFor(() =>
      expect(notifications._store.state.list).toHaveLength(2),
    );

    notifications.projectMarkViewed(directory);

    const state = notifications._store.state;
    expect(state.list.every((item) => item.viewed)).toBe(true);
    expect(state.index.project.unseenCount[directory]).toBeUndefined();
    expect(state.index.session.unseenCount["ses_1"]).toBeUndefined();
    expect(state.index.project.unseenHasError[directory]).toBeUndefined();
  });

  test("merges persisted notifications on load", async () => {
    const persisted = turnComplete({
      session: "ses_old",
      time: Date.now() - 1000,
    });
    memory.set("notification", JSON.stringify({ list: [persisted] }));

    await setup();

    expect(notifications._store.state.list).toEqual([persisted]);
    expect(
      notifications._store.state.index.session.unseenCount["ses_old"],
    ).toBe(1);
  });

  test("prunes expired notifications on load", async () => {
    const expired = turnComplete({
      session: "ses_old",
      time: Date.now() - 31 * 24 * 60 * 60 * 1000,
    });
    memory.set("notification", JSON.stringify({ list: [expired] }));

    await setup();

    expect(notifications._store.state.list).toHaveLength(0);
  });

  test("caps stored notifications at the maximum", async () => {
    const persisted = Array.from({ length: 500 }, (_, i) =>
      turnComplete({ session: `ses_${i}`, time: Date.now() - i }),
    );
    memory.set("notification", JSON.stringify({ list: persisted }));
    child.setState(() => ({ session: [session({ id: "ses_new" })] }));
    await setup();
    expect(notifications._store.state.list).toHaveLength(500);

    sdk.event.emit(directory, idleEvent("ses_new"));

    await waitFor(() =>
      expect(
        notifications._store.state.list.some(
          (item) => item.session === "ses_new",
        ),
      ).toBe(true),
    );
    expect(notifications._store.state.list).toHaveLength(500);
  });

  test("persists appended notifications", async () => {
    child.setState(() => ({ session: [session({ id: "ses_1" })] }));
    await setup();

    sdk.event.emit(directory, idleEvent("ses_1"));

    await waitFor(() => {
      const raw = memory.get("notification");
      expect(raw).toBeDefined();
      expect(raw).toContain("ses_1");
    });
  });

  test("still records when sounds and system notifications are disabled", async () => {
    settings.sounds.agentEnabled = false;
    settings.notifications.agent = false;
    child.setState(() => ({ session: [session({ id: "ses_1" })] }));
    await setup();

    sdk.event.emit(directory, idleEvent("ses_1"));

    await waitFor(() =>
      expect(notifications._store.state.list).toHaveLength(1),
    );
    expect(vi.mocked(playSoundById)).not.toHaveBeenCalled();
    expect(notified()).not.toHaveBeenCalled();
  });
});
