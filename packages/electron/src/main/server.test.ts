import { EventEmitter } from "node:events";
import { delimiter } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { RuntimePack } from "./runtime-pack";
import {
  checkHealth,
  getDefaultServerUrl,
  getWslConfig,
  preferAppEnv,
  setDefaultServerUrl,
  setWslConfig,
  spawnLocalServer,
} from "./server";

type ForkOptions = {
  cwd: string;
  env: Record<string, string>;
  serviceName: string;
  stdio: string;
};

const doubles = vi.hoisted(() => {
  const appHandlers = new Map<string, (...args: unknown[]) => void>();
  const stores = new Map<string, Map<string, unknown>>();
  return {
    appHandlers,
    stores,
    app: {
      isPackaged: false,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        appHandlers.set(event, handler);
      }),
      off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (appHandlers.get(event) === handler) appHandlers.delete(event);
      }),
    },
    fork: vi.fn<
      (path: string, args: string[], options: ForkOptions) => FakeChild
    >(),
    resolveRuntimePack: vi.fn<() => RuntimePack | null>(() => null),
    getUserShell: vi.fn<() => string>(() => "/bin/zsh"),
    loadShellEnv: vi.fn<(shell: string) => Record<string, string>>(() => ({})),
    createSidecarStorageEnv: vi.fn(() => ({
      XDG_CONFIG_HOME: "/store/config",
      XDG_DATA_HOME: "/store/data",
      XDG_CACHE_HOME: "/store/cache",
      XDG_STATE_HOME: "/store/state",
      TMPDIR: "/store/tmp",
      TMP: "/store/tmp",
      TEMP: "/store/tmp",
    })),
  };
});

vi.mock("electron", () => ({
  app: doubles.app,
  utilityProcess: { fork: doubles.fork },
}));

vi.mock("./constants", () => ({
  SETTINGS_STORE: "kowork.settings",
  DEFAULT_SERVER_URL_KEY: "defaultServerUrl",
  WSL_ENABLED_KEY: "wslEnabled",
  UPDATER_ENABLED: false,
}));

vi.mock("./store", () => ({
  getStore: (name: string = "kowork.settings") => {
    let store = doubles.stores.get(name);
    if (!store) {
      store = new Map();
      doubles.stores.set(name, store);
    }
    return {
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => {
        store.set(key, value);
      },
      delete: (key: string) => {
        store.delete(key);
      },
    };
  },
}));

vi.mock("./runtime", () => ({
  resolveRuntimePack: doubles.resolveRuntimePack,
}));

vi.mock("./shell-env", () => ({
  getUserShell: doubles.getUserShell,
  loadShellEnv: doubles.loadShellEnv,
}));

vi.mock("./sidecar-storage", () => ({
  createSidecarStorageEnv: doubles.createSidecarStorageEnv,
}));

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  postMessage = vi.fn<(message: unknown) => void>();
  kill = vi.fn<() => void>();
}

const pack: RuntimePack = {
  dir: "/pack",
  pythonExe: "/pack/python/bin/python3",
  pythonBinDir: "/pack/python/bin",
  binDir: "/pack/bin",
  nodeModules: "/pack/node_modules",
};

const fetchMock = vi.fn<(input: URL, init: RequestInit) => Promise<Response>>();

let child: FakeChild;

beforeEach(() => {
  vi.clearAllMocks();
  doubles.appHandlers.clear();
  doubles.stores.clear();
  doubles.resolveRuntimePack.mockImplementation(() => null);
  doubles.getUserShell.mockImplementation(() => "/bin/zsh");
  doubles.loadShellEnv.mockImplementation(() => ({}));
  doubles.createSidecarStorageEnv.mockImplementation(() => ({
    XDG_CONFIG_HOME: "/store/config",
    XDG_DATA_HOME: "/store/data",
    XDG_CACHE_HOME: "/store/cache",
    XDG_STATE_HOME: "/store/state",
    TMPDIR: "/store/tmp",
    TMP: "/store/tmp",
    TEMP: "/store/tmp",
  }));
  child = new FakeChild();
  doubles.fork.mockImplementation(() => child);
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(null, { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const spawnOptions = () => ({
  userDataPath: "/user-data",
  tempPath: "/tmp",
  onStdout: vi.fn<(message: string) => void>(),
  onStderr: vi.fn<(message: string) => void>(),
  onExit: vi.fn<(code: number) => void>(),
});

async function spawnReady(options = spawnOptions()) {
  const promise = spawnLocalServer("127.0.0.1", 4096, "pw", options);
  child.emit("message", { type: "ready" });
  const spawned = await promise;
  return { ...spawned, options };
}

describe("spawnLocalServer", () => {
  test("forks the sidecar with an isolated environment and starts it", async () => {
    vi.stubEnv("OPENCODE_CONFIG", "/isolated/config");
    vi.stubEnv("DEBUG", "1");

    const spawned = spawnLocalServer("127.0.0.1", 4096, "pw", spawnOptions());
    child.emit("message", { type: "ready" });
    await spawned;

    expect(doubles.fork).toHaveBeenCalledTimes(1);
    const [entry, args, opts] = doubles.fork.mock.calls[0]!;
    expect(entry).toMatch(/sidecar\.js$/);
    expect(args).toEqual([]);
    expect(opts.serviceName).toBe("kowork server");
    expect(opts.stdio).toBe("pipe");
    expect(opts.env.OPENCODE_CONFIG).toBeUndefined();
    expect(opts.env.DEBUG).toBeUndefined();
    expect(opts.env.XDG_CONFIG_HOME).toBe("/store/config");
    expect(opts.env.TMPDIR).toBe("/store/tmp");

    expect(child.postMessage).toHaveBeenCalledWith({
      type: "start",
      hostname: "127.0.0.1",
      port: 4096,
      password: "pw",
    });
  });

  test("strips inherited toolchain variables when a runtime pack is present", async () => {
    doubles.resolveRuntimePack.mockImplementation(() => pack);
    vi.stubEnv("PATH", "/usr/bin");
    vi.stubEnv("PYTHONPATH", "/foreign");
    vi.stubEnv("VIRTUAL_ENV", "/venv");
    vi.stubEnv("NODE_PATH", undefined);

    const spawned = spawnLocalServer("127.0.0.1", 4096, "pw", spawnOptions());
    child.emit("message", { type: "ready" });
    await spawned;

    const [, , opts] = doubles.fork.mock.calls[0]!;
    expect(opts.env.KOWORK_PYTHON).toBe("/pack/python/bin/python3");
    expect(opts.env.KOWORK_ELECTRON_BIN).toBe(process.execPath);
    expect(opts.env.PYTHONNOUSERSITE).toBe("1");
    expect(opts.env.PYTHONDONTWRITEBYTECODE).toBe("1");
    expect(opts.env.PYTHONPATH).toBeUndefined();
    expect(opts.env.VIRTUAL_ENV).toBeUndefined();
    expect(opts.env.PATH).toBe(
      ["/pack/bin", "/pack/python/bin", "/usr/bin"].join(delimiter),
    );
    expect(opts.env.NODE_PATH).toBe("/pack/node_modules");
  });

  test("prepends to a differently-cased PATH key without adding a new one", async () => {
    doubles.resolveRuntimePack.mockImplementation(() => pack);
    vi.stubEnv("PATH", undefined);
    vi.stubEnv("Path", "/odd");

    const spawned = spawnLocalServer("127.0.0.1", 4096, "pw", spawnOptions());
    child.emit("message", { type: "ready" });
    await spawned;

    const [, , opts] = doubles.fork.mock.calls[0]!;
    expect(opts.env.Path).toBe(
      ["/pack/bin", "/pack/python/bin", "/odd"].join(delimiter),
    );
    expect(opts.env.PATH).toBeUndefined();
  });

  test("forwards stdout and stderr output", async () => {
    const options = spawnOptions();
    const spawned = spawnLocalServer("127.0.0.1", 4096, "pw", options);
    child.emit("message", { type: "ready" });
    const { health } = await spawned;

    child.stdout.emit("data", Buffer.from("listening\n"));
    child.stderr.emit("data", Buffer.from("warn\n"));
    child.emit("error", new Error("spawn blew up"));

    expect(options.onStdout).toHaveBeenCalledWith("listening");
    expect(options.onStderr).toHaveBeenCalledWith("warn");
    expect(options.onStderr).toHaveBeenCalledWith(
      "utility process error: spawn blew up",
    );

    await health.wait;
  });

  test("reports a utility-process-gone for the sidecar only", async () => {
    const options = spawnOptions();
    const spawned = spawnLocalServer("127.0.0.1", 4096, "pw", options);
    child.emit("message", { type: "ready" });
    const { health } = await spawned;

    const gone = doubles.appHandlers.get("child-process-gone");
    expect(gone).toBeDefined();
    gone?.(
      {},
      { type: "Utility", name: "other", reason: "crash", exitCode: 1 },
    );
    expect(options.onStderr).not.toHaveBeenCalled();

    gone?.(
      {},
      { type: "Utility", name: "kowork server", reason: "crash", exitCode: 1 },
    );
    expect(options.onStderr).toHaveBeenCalledWith(
      "utility process gone reason=crash exitCode=1",
    );

    await health.wait;
  });

  test("rejects when the sidecar posts an error and kills it", async () => {
    const promise = spawnLocalServer("127.0.0.1", 4096, "pw", spawnOptions());
    const assertion = expect(promise).rejects.toThrow("listen failed");

    child.emit("message", {
      type: "error",
      error: { message: "listen failed" },
    });

    await assertion;
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  test("rejects when the sidecar exits before ready without killing it", async () => {
    const options = spawnOptions();
    const promise = spawnLocalServer("127.0.0.1", 4096, "pw", options);
    const assertion = expect(promise).rejects.toThrow(
      "Sidecar exited before ready with code 1",
    );

    child.emit("exit", 1);

    await assertion;
    expect(child.kill).not.toHaveBeenCalled();
    expect(options.onExit).toHaveBeenCalledWith(1);
  });

  test("rejects when the sidecar stalls and kills it", async () => {
    vi.useFakeTimers();
    try {
      const promise = spawnLocalServer("127.0.0.1", 4096, "pw", spawnOptions());
      const assertion = expect(promise).rejects.toThrow(
        /Sidecar did not become ready within 60000ms/,
      );

      await vi.advanceTimersByTimeAsync(60_000);

      await assertion;
      expect(child.kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("health.wait resolves once the sidecar is healthy", async () => {
    const { health } = await spawnReady();

    await health.wait;

    const [input, init] = fetchMock.mock.calls[0]!;
    expect(input.toString()).toBe("http://127.0.0.1:4096/global/health");
    expect((init.headers as Headers).get("authorization")).toBe(
      `Basic ${Buffer.from("opencode:pw").toString("base64")}`,
    );
  });

  test("health.wait rejects when the sidecar exits before becoming healthy", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(null, { status: 500 })),
    );
    const { health } = await spawnReady();

    const assertion = expect(health.wait).rejects.toThrow(
      "Sidecar exited before health check passed with code 1",
    );
    child.emit("exit", 1);

    await assertion;
  });

  test("stop posts the stop command and resolves on exit", async () => {
    const { listener, health, options } = await spawnReady();
    await health.wait;

    const stopped = listener.stop();
    expect(child.postMessage).toHaveBeenCalledWith({ type: "stop" });
    child.emit("exit", 0);

    await stopped;
    expect(options.onExit).toHaveBeenCalledWith(0);
  });

  test("stop is idempotent", async () => {
    const { listener, health } = await spawnReady();
    await health.wait;

    const first = listener.stop();
    const second = listener.stop();
    child.emit("exit", 0);

    await Promise.all([first, second]);
    expect(
      child.postMessage.mock.calls.filter(
        ([message]) => (message as { type: string }).type === "stop",
      ),
    ).toHaveLength(1);
  });

  test("stop resolves immediately when the child already exited", async () => {
    const { listener, health } = await spawnReady();
    await health.wait;
    child.emit("exit", 0);
    child.postMessage.mockClear();

    await listener.stop();

    expect(child.postMessage).not.toHaveBeenCalled();
  });

  test("stop kills the sidecar when it does not exit in time", async () => {
    vi.useFakeTimers();
    try {
      const promise = spawnLocalServer("127.0.0.1", 4096, "pw", spawnOptions());
      child.emit("message", { type: "ready" });
      const { listener } = await promise;

      const stopped = listener.stop();
      await vi.advanceTimersByTimeAsync(6_000);

      await stopped;
      expect(child.kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("checkHealth", () => {
  test("returns true for an ok response", async () => {
    await expect(checkHealth("http://127.0.0.1:4096", "pw")).resolves.toBe(
      true,
    );
  });

  test("returns false for a non-ok response", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(null, { status: 500 })),
    );

    await expect(checkHealth("http://127.0.0.1:4096")).resolves.toBe(false);
  });

  test("returns false when the request fails", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("down")));

    await expect(checkHealth("http://127.0.0.1:4096")).resolves.toBe(false);
  });

  test("returns false for an invalid base url", async () => {
    await expect(checkHealth("not a url")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("omits the authorization header without a password", async () => {
    await checkHealth("http://127.0.0.1:4096");

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init.headers as Headers).get("authorization")).toBeNull();
  });
});

describe("server settings", () => {
  test("round-trips the default server url", () => {
    expect(getDefaultServerUrl()).toBeNull();

    setDefaultServerUrl("http://localhost:4096");
    expect(getDefaultServerUrl()).toBe("http://localhost:4096");

    setDefaultServerUrl(null);
    expect(getDefaultServerUrl()).toBeNull();
  });

  test("rejects a non-string default server url", () => {
    doubles.stores.get("kowork.settings")?.set("defaultServerUrl", 42);
    expect(getDefaultServerUrl()).toBeNull();
  });

  test("defaults wsl to disabled and round-trips the config", () => {
    expect(getWslConfig()).toEqual({ enabled: false });

    setWslConfig({ enabled: true });
    expect(getWslConfig()).toEqual({ enabled: true });
  });
});

describe("preferAppEnv", () => {
  const KEYS = [
    "OPENCODE_EXPERIMENTAL_ICON_DISCOVERY",
    "OPENCODE_DISABLE_EXTERNAL_SKILLS",
    "OPENCODE_DISABLE_PROJECT_CONFIG",
    "OPENCODE_CLIENT",
    "CUSTOM",
  ];
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test("merges the shell environment and desktop markers", () => {
    doubles.loadShellEnv.mockImplementation(() => ({ CUSTOM: "from-shell" }));

    preferAppEnv();

    expect(doubles.loadShellEnv).toHaveBeenCalledWith("/bin/zsh");
    expect(process.env.CUSTOM).toBe("from-shell");
    expect(process.env.OPENCODE_CLIENT).toBe("desktop");
    expect(process.env.OPENCODE_DISABLE_EXTERNAL_SKILLS).toBe("true");
    expect(process.env.OPENCODE_DISABLE_PROJECT_CONFIG).toBe("true");
    expect(process.env.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY).toBe("true");
  });
});
