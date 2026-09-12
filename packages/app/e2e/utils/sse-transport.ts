// @opencode-ref: opencode/packages/app/e2e/utils/sse-transport.ts
import type { Page } from "@playwright/test";

export type SseConnection = {
  id: number;
  openedAt: number;
  endedAt?: number;
};

export type SseTransport<T> = {
  waitForConnection: (options?: {
    after?: number;
    timeout?: number;
  }) => Promise<SseConnection>;
  send: (payload: T) => Promise<void>;
  close: () => Promise<void>;
  disconnect: () => Promise<void>;
};

type BrowserCommand<T> =
  | { type: "connections" }
  | { type: "send"; payload: T }
  | { type: "end"; mode: "close" | "disconnect" };

type BrowserTransport = Window & {
  __koworkSseTransport?: {
    command: (command: BrowserCommand<unknown>) => unknown;
  };
};

export async function installSseTransport<T>(
  page: Page,
  server: string,
): Promise<SseTransport<T>> {
  const origin = new URL(server).origin;

  await page.addInitScript((targetOrigin) => {
    type Connection = SseConnection & {
      controller: ReadableStreamDefaultController<Uint8Array>;
    };

    const originalFetch = window.fetch.bind(window);
    const connections: Connection[] = [];
    const encoder = new TextEncoder();
    let nextConnectionID = 0;

    const current = () =>
      connections.findLast((connection) => connection.endedAt === undefined);
    const frame = (payload: unknown) =>
      `data: ${JSON.stringify(payload)}\n\n`;
    const records = () =>
      connections.map(({ controller: _controller, ...connection }) =>
        structuredClone(connection),
      );

    const end = (mode: "close" | "disconnect") => {
      const connection = current();
      if (!connection) throw new Error("SSE transport has no active connection");
      connection.endedAt = performance.now();
      if (mode === "close") {
        connection.controller.close();
        return;
      }
      connection.controller.error(
        new DOMException("SSE connection disconnected", "NetworkError"),
      );
    };

    const command = (input: BrowserCommand<unknown>) => {
      if (input.type === "connections") return records();
      if (input.type === "end") return end(input.mode);

      const connection = current();
      if (!connection) throw new Error("SSE transport has no active connection");
      connection.controller.enqueue(encoder.encode(frame(input.payload)));
    };

    (window as BrowserTransport).__koworkSseTransport = { command };
    const testFetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.origin !== targetOrigin || url.pathname !== "/global/event") {
        return originalFetch(request);
      }

      const record = {
        id: ++nextConnectionID,
        openedAt: performance.now(),
      } as Connection;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          record.controller = controller;
          connections.push(record);
          controller.enqueue(
            encoder.encode(
              frame({
                payload: {
                  id: `evt_mock_connected_${record.id}`,
                  type: "server.connected",
                  properties: {},
                },
              }),
            ),
          );
          request.signal.addEventListener(
            "abort",
            () => {
              if (record.endedAt !== undefined) return;
              record.endedAt = performance.now();
              controller.error(
                request.signal.reason ??
                  new DOMException("The operation was aborted", "AbortError"),
              );
            },
            { once: true },
          );
        },
        cancel() {
          if (record.endedAt !== undefined) return;
          record.endedAt = performance.now();
        },
      });

      return Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: {
            "cache-control": "no-cache",
            "content-type": "text/event-stream",
          },
        }),
      );
    };

    Object.defineProperty(window, "fetch", {
      configurable: true,
      writable: true,
      value: testFetch,
    });
  }, origin);

  const command = <Result>(input: BrowserCommand<T>) =>
    page.evaluate((browserCommand) => {
      const transport = (window as BrowserTransport).__koworkSseTransport;
      if (!transport) {
        throw new Error("SSE transport was not installed before page load");
      }
      return transport.command(browserCommand as BrowserCommand<unknown>);
    }, input) as Promise<Result>;

  return {
    async waitForConnection(options = {}) {
      const connection = await page.waitForFunction(
        (after) => {
          const transport = (window as BrowserTransport).__koworkSseTransport;
          const records = transport?.command({
            type: "connections",
          }) as SseConnection[] | undefined;
          return records?.findLast(
            (item) => item.id > after && item.endedAt === undefined,
          );
        },
        options.after ?? 0,
        { timeout: options.timeout },
      );

      try {
        const result = await connection.jsonValue();
        if (!result) {
          throw new Error("SSE connection disappeared while waiting");
        }
        return result;
      } finally {
        await connection.dispose();
      }
    },
    send(payload) {
      return command({ type: "send", payload });
    },
    close() {
      return command({ type: "end", mode: "close" });
    },
    disconnect() {
      return command({ type: "end", mode: "disconnect" });
    },
  };
}
