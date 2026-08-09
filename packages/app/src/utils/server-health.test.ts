// @opencode-ref: opencode/packages/app/src/utils/server-health.test.ts
import { describe, expect, test } from "vitest";
import type { ServerConnection } from "@/contexts/server";
import { checkServerHealth } from "./server-health";

const server: ServerConnection.HttpBase = {
  url: "http://localhost:4096",
};

function abortFromInput(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.signal) return init.signal;
  if (input instanceof Request) return input.signal;
  return undefined;
}

describe("checkServerHealth", () => {
  test("returns healthy response with version", async () => {
    const fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ healthy: true, version: "1.2.3" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const result = await checkServerHealth(server, fetch);

    expect(result).toEqual({ healthy: true, version: "1.2.3" });
  });

  test("returns unhealthy when request fails", async () => {
    const fetch = () => Promise.reject(new Error("network"));

    const result = await checkServerHealth(server, fetch);

    expect(result).toEqual({ healthy: false });
  });

  test("uses timeout fallback when AbortSignal.timeout is unavailable", async () => {
    const timeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      value: undefined,
    });

    let aborted = false;
    const fetch = (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = abortFromInput(input, init);
        signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });

    const result = await checkServerHealth(server, fetch, {
      timeoutMs: 10,
    }).finally(() => {
      if (timeout) Object.defineProperty(AbortSignal, "timeout", timeout);
      if (!timeout) Reflect.deleteProperty(AbortSignal, "timeout");
    });

    expect(aborted).toBe(true);
    expect(result).toEqual({ healthy: false });
  });

  test("uses provided abort signal", async () => {
    let signal: AbortSignal | undefined;
    const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      signal = abortFromInput(input, init);
      return Promise.resolve(
        new Response(JSON.stringify({ healthy: true, version: "1.2.3" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    };

    const abort = new AbortController();
    await checkServerHealth(server, fetch, {
      signal: abort.signal,
    });

    // The SDK passes the signal through a Request, so the fetch observes a
    // dependent signal rather than the identical object.
    abort.abort();
    expect(signal?.aborted).toBe(true);
  });

  test("retries transient failures and eventually succeeds", async () => {
    let count = 0;
    const fetch = () => {
      count += 1;
      if (count < 3) return Promise.reject(new TypeError("network"));
      return Promise.resolve(
        new Response(JSON.stringify({ healthy: true, version: "1.2.3" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    };

    const result = await checkServerHealth(server, fetch, {
      retryCount: 2,
      retryDelayMs: 1,
    });

    expect(count).toBe(3);
    expect(result).toEqual({ healthy: true, version: "1.2.3" });
  });

  test("returns unhealthy when retries are exhausted", async () => {
    let count = 0;
    const fetch = () => {
      count += 1;
      return Promise.reject(new TypeError("network"));
    };

    const result = await checkServerHealth(server, fetch, {
      retryCount: 2,
      retryDelayMs: 1,
    });

    expect(count).toBe(3);
    expect(result).toEqual({ healthy: false });
  });
});
