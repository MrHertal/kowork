import { EventEmitter } from "node:events";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type Mock,
} from "vitest";

class FakePort extends EventEmitter {
  posted: unknown[] = [];
  postMessage(message: unknown) {
    this.posted.push(message);
  }
}

type Listener = { stop: Mock<() => Promise<void>> };

const listen = vi.fn<(input: unknown) => Promise<Listener>>();

vi.mock("virtual:opencode-server", () => ({
  Log: { init: () => Promise.resolve() },
  Server: { listen: (input: unknown) => listen(input) },
}));

// Never restored: stop/start schedule process.exit via setImmediate.
const exit = vi
  .spyOn(process, "exit")
  .mockImplementation((() => undefined) as never);
vi.spyOn(console, "warn").mockImplementation(() => {});

const ENV_KEYS = [
  "OPENCODE_SERVER_USERNAME",
  "OPENCODE_SERVER_PASSWORD",
  "NO_PROXY",
  "no_proxy",
];

let port: FakePort;
let listener: Listener;
let savedEnv: Record<string, string | undefined>;

const importSidecar = async () => {
  vi.resetModules();
  await import("./sidecar");
};

const startCommand = {
  type: "start",
  hostname: "127.0.0.1",
  port: 4096,
  password: "pw",
};

const flushImmediate = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

beforeEach(() => {
  vi.clearAllMocks();
  listener = { stop: vi.fn<() => Promise<void>>(() => Promise.resolve()) };
  listen.mockImplementation(() => Promise.resolve(listener));
  port = new FakePort();
  Object.defineProperty(process, "parentPort", {
    value: port,
    configurable: true,
    writable: true,
  });
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  Object.defineProperty(process, "parentPort", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("sidecar", () => {
  test("throws at load when the parent port is unavailable", async () => {
    Object.defineProperty(process, "parentPort", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    vi.resetModules();
    await expect(import("./sidecar")).rejects.toThrow(
      "Sidecar parent port unavailable",
    );
  });

  test("starts listening and posts ready", async () => {
    await importSidecar();

    port.emit("message", { data: startCommand });

    await vi.waitFor(() =>
      expect(port.posted).toContainEqual({ type: "ready" }),
    );
    expect(listen).toHaveBeenCalledWith({
      port: 4096,
      hostname: "127.0.0.1",
      username: "opencode",
      password: "pw",
    });
    expect(process.env.OPENCODE_SERVER_USERNAME).toBe("opencode");
    expect(process.env.OPENCODE_SERVER_PASSWORD).toBe("pw");
  });

  test("upserts loopback hosts into the proxy bypass list", async () => {
    process.env.NO_PROXY = "example.com,localhost";
    await importSidecar();

    port.emit("message", { data: startCommand });
    await vi.waitFor(() =>
      expect(port.posted).toContainEqual({ type: "ready" }),
    );

    expect(process.env.NO_PROXY).toBe("example.com,localhost,127.0.0.1,::1");
    expect(process.env.no_proxy).toBe("127.0.0.1,localhost,::1");
  });

  test("posts an error and exits when listening fails", async () => {
    listen.mockRejectedValue(new Error("boom"));
    await importSidecar();

    port.emit("message", { data: startCommand });

    await vi.waitFor(() =>
      expect(port.posted).toContainEqual({
        type: "error",
        error: { message: "boom", stack: expect.any(String) },
      }),
    );
    await flushImmediate();
    expect(exit).toHaveBeenCalledWith(1);
  });

  test("serializes non-error failures without a stack", async () => {
    listen.mockRejectedValue("nope");
    await importSidecar();

    port.emit("message", { data: startCommand });

    await vi.waitFor(() =>
      expect(port.posted).toContainEqual({
        type: "error",
        error: { message: "nope" },
      }),
    );
    await flushImmediate();
    expect(exit).toHaveBeenCalledWith(1);
  });

  test("stops the listener, posts stopped, and exits", async () => {
    await importSidecar();
    port.emit("message", { data: startCommand });
    await vi.waitFor(() =>
      expect(port.posted).toContainEqual({ type: "ready" }),
    );

    port.emit("message", { data: { type: "stop" } });

    await vi.waitFor(() =>
      expect(port.posted).toContainEqual({ type: "stopped" }),
    );
    expect(listener.stop).toHaveBeenCalledTimes(1);
    await flushImmediate();
    expect(exit).toHaveBeenCalledWith(0);
  });

  test("stops cleanly without a listener", async () => {
    await importSidecar();

    port.emit("message", { data: { type: "stop" } });

    await vi.waitFor(() =>
      expect(port.posted).toContainEqual({ type: "stopped" }),
    );
    expect(listen).not.toHaveBeenCalled();
    expect(listener.stop).not.toHaveBeenCalled();
    await flushImmediate();
    expect(exit).toHaveBeenCalledWith(0);
  });

  test("ignores malformed commands", async () => {
    await importSidecar();

    port.emit("message", { data: "nope" });
    port.emit("message", { data: { type: "start", port: "x" } });
    port.emit("message", { data: { type: "restart" } });
    await flushImmediate();

    expect(listen).not.toHaveBeenCalled();
    expect(port.posted).toEqual([]);

    port.emit("message", { data: startCommand });
    await vi.waitFor(() =>
      expect(port.posted).toContainEqual({ type: "ready" }),
    );
    expect(listen).toHaveBeenCalledTimes(1);
  });
});
