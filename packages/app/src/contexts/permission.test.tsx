// @vitest-environment jsdom
import type {
  Config,
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
import { base64Encode } from "@/utils/encode";
import { createEmitter } from "@/utils/emitter";
import type { State } from "./global-sync/types";
import {
  PermissionProvider,
  usePermission,
  type PermissionContextValue,
} from "./permission";

const directory = "/tmp/project";

const session = (input: { id: string; parentID?: string }) =>
  ({
    id: input.id,
    parentID: input.parentID,
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

const askedEvent = (request: PermissionRequest): Event => ({
  id: `evt_${request.id}`,
  type: "permission.asked",
  properties: request,
});

type EventMap = { [key: string]: Event };

type ChildState = Pick<State, "session" | "config">;

const children = new Map<string, Store<ChildState>>();

const sync = {
  _child(dir: string) {
    const hit = children.get(dir);
    if (hit) return hit;
    const created = new Store<ChildState>({ session: [], config: {} });
    children.set(dir, created);
    return created;
  },
};

type RespondInput = Parameters<OpencodeClient["permission"]["respond"]>[0];
type ListInput = Parameters<OpencodeClient["permission"]["list"]>[0];

const sdk = {
  client: {
    permission: {
      respond: vi.fn<(input: RespondInput) => Promise<void>>(() =>
        Promise.resolve(),
      ),
      list: vi.fn<
        (input?: ListInput) => Promise<{ data?: PermissionRequest[] }>
      >(() => Promise.resolve({ data: [] })),
    },
  },
  event: createEmitter<EventMap>(),
};

vi.mock("@/contexts/global-sdk", () => ({
  useGlobalSDK: () => sdk,
}));

vi.mock("@/contexts/global-sync", () => ({
  useGlobalSync: () => sync,
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

beforeEach(() => {
  vi.clearAllMocks();
  sdk.client.permission.respond.mockImplementation(() => Promise.resolve());
  sdk.client.permission.list.mockImplementation(() =>
    Promise.resolve({ data: [] }),
  );
  sdk.event = createEmitter<EventMap>();
  children.clear();
  memory = new Map();
  platform = {
    platform: "web",
    openLink: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    restart: () => Promise.resolve(),
    notify: () => Promise.resolve(),
    storage: () => createStorage(memory),
  };
});

let permission: PermissionContextValue;

function Capture() {
  const ctx = usePermission();
  useEffect(() => {
    permission = ctx;
  });
  return null;
}

async function setup() {
  render(
    <PlatformProvider value={platform}>
      <PermissionProvider>
        <Capture />
      </PermissionProvider>
    </PlatformProvider>,
  );
  await waitFor(() => expect(permission.ready).toBe(true));
}

function seedChild(
  dir: string,
  input: { session?: Session[]; permissionConfig?: Config["permission"] },
) {
  children.set(
    dir,
    new Store<ChildState>({
      session: input.session ?? [],
      config: { permission: input.permissionConfig },
    }),
  );
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("PermissionProvider", () => {
  test("loads persisted auto-accept state", async () => {
    memory.set(
      "permission",
      JSON.stringify({
        autoAccept: { [`${base64Encode(directory)}/*`]: true },
      }),
    );

    await setup();

    expect(permission.isAutoAcceptingDirectory(directory)).toBe(true);
  });

  test("migrates the legacy autoAcceptEdits shape from permission.v3", async () => {
    memory.set(
      "permission.v3",
      JSON.stringify({ autoAcceptEdits: { ses_1: true } }),
    );

    await setup();

    expect(permission.isAutoAccepting("ses_1")).toBe(true);
    expect(memory.has("permission.v3")).toBe(false);
    expect(JSON.parse(memory.get("permission") ?? "{}")).toMatchObject({
      autoAccept: { ses_1: true },
    });
  });

  test("auto-responds to permission.asked once auto-accept is enabled", async () => {
    await setup();
    permission.enableAutoAccept("ses_1", directory);

    sdk.event.emit(directory, askedEvent(permissionRequest("perm_1", "ses_1")));

    expect(sdk.client.permission.respond).toHaveBeenCalledTimes(1);
    expect(sdk.client.permission.respond).toHaveBeenCalledWith({
      sessionID: "ses_1",
      permissionID: "perm_1",
      response: "once",
      directory,
    });
  });

  test("ignores permission.asked without auto-accept", async () => {
    await setup();

    sdk.event.emit(directory, askedEvent(permissionRequest("perm_1", "ses_1")));

    expect(sdk.client.permission.respond).not.toHaveBeenCalled();
  });

  test("dedupes repeated permission.asked events for the same request", async () => {
    await setup();
    permission.enableAutoAccept("ses_1", directory);

    const event = askedEvent(permissionRequest("perm_1", "ses_1"));
    sdk.event.emit(directory, event);
    sdk.event.emit(directory, event);

    expect(sdk.client.permission.respond).toHaveBeenCalledTimes(1);
  });

  test("retries auto-respond after a failed respond call", async () => {
    sdk.client.permission.respond.mockRejectedValueOnce(new Error("offline"));
    await setup();
    permission.enableAutoAccept("ses_1", directory);

    const event = askedEvent(permissionRequest("perm_1", "ses_1"));
    sdk.event.emit(directory, event);
    await flush();
    sdk.event.emit(directory, event);

    expect(sdk.client.permission.respond).toHaveBeenCalledTimes(2);
  });

  test("responds to pending permission requests when enabling auto-accept", async () => {
    sdk.client.permission.list.mockResolvedValue({
      data: [
        permissionRequest("perm_1", "ses_1"),
        permissionRequest("perm_2", "ses_1"),
      ],
    });
    await setup();

    permission.enableAutoAccept("ses_1", directory);

    await waitFor(() =>
      expect(sdk.client.permission.respond).toHaveBeenCalledTimes(2),
    );
    expect(sdk.client.permission.respond).toHaveBeenCalledWith(
      expect.objectContaining({ permissionID: "perm_2", response: "once" }),
    );
  });

  test("does not respond to pending requests when disabled before the list resolves", async () => {
    let resolveList: (value: { data: PermissionRequest[] }) => void = () =>
      undefined;
    sdk.client.permission.list.mockImplementation(
      () =>
        new Promise<{ data: PermissionRequest[] }>((resolve) => {
          resolveList = resolve;
        }),
    );
    await setup();

    permission.enableAutoAccept("ses_1", directory);
    permission.disableAutoAccept("ses_1", directory);
    resolveList({ data: [permissionRequest("perm_1", "ses_1")] });
    await flush();

    expect(sdk.client.permission.respond).not.toHaveBeenCalled();
    expect(permission.isAutoAccepting("ses_1", directory)).toBe(false);
  });

  test("auto-accepts every session when directory auto-accept is enabled", async () => {
    await setup();
    permission.toggleAutoAcceptDirectory(directory);
    expect(permission.isAutoAcceptingDirectory(directory)).toBe(true);

    sdk.event.emit(directory, askedEvent(permissionRequest("perm_1", "ses_9")));

    expect(sdk.client.permission.respond).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: "ses_9", response: "once" }),
    );
  });

  test("toggleAutoAccept disables an enabled session", async () => {
    await setup();
    permission.enableAutoAccept("ses_1", directory);
    expect(permission.isAutoAccepting("ses_1", directory)).toBe(true);

    permission.toggleAutoAccept("ses_1", directory);

    expect(permission.isAutoAccepting("ses_1", directory)).toBe(false);
    sdk.event.emit(directory, askedEvent(permissionRequest("perm_1", "ses_1")));
    expect(sdk.client.permission.respond).not.toHaveBeenCalled();
  });

  test("inherits a parent session's auto-accept through the sync store", async () => {
    seedChild(directory, {
      session: [
        session({ id: "root" }),
        session({ id: "child", parentID: "root" }),
      ],
    });
    await setup();
    permission.enableAutoAccept("root", directory);

    sdk.event.emit(directory, askedEvent(permissionRequest("perm_1", "child")));

    expect(sdk.client.permission.respond).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: "child", response: "once" }),
    );
  });

  test("reads permission prompt configuration from the directory store", async () => {
    seedChild(directory, { permissionConfig: { edit: "ask" } });
    seedChild("/allow", { permissionConfig: "allow" });
    await setup();

    expect(permission.permissionsEnabled(directory)).toBe(true);
    expect(permission.isPermissionAllowAll(directory)).toBe(false);
    expect(permission.permissionsEnabled("/allow")).toBe(false);
    expect(permission.isPermissionAllowAll("/allow")).toBe(true);
    expect(permission.permissionsEnabled("/unseeded")).toBe(false);
    expect(permission.permissionsEnabled("")).toBe(false);
  });

  test("persists auto-accept changes", async () => {
    await setup();

    permission.toggleAutoAcceptDirectory(directory);

    await waitFor(() => {
      const raw = memory.get("permission");
      expect(raw).toBeDefined();
      expect(JSON.parse(raw ?? "{}")).toEqual({
        autoAccept: { [`${base64Encode(directory)}/*`]: true },
      });
    });
  });
});
