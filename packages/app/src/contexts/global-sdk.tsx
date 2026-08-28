// @opencode-ref: opencode/packages/app/src/context/server-sdk.tsx
import { type Event, type OpencodeClient } from "@opencode-ai/sdk/v2/client";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import z from "zod";

import { m } from "@/paraglide/messages";
import { usePlatform } from "@/contexts/platform";
import { useServer } from "@/contexts/server";
import { createEmitter, type Emitter } from "@/utils/emitter";
import { createSdkForServer } from "@/utils/server";

const abortError = z.object({
  name: z.literal("AbortError"),
});

type EventMap = { [key: string]: Event };

type QueuedServerEvent = { directory: string; payload: Event };

const coalescedKey = (event: QueuedServerEvent) => {
  if (event.payload.type === "lsp.updated")
    return `lsp.updated:${event.directory}`;
  if (event.payload.type === "message.part.updated") {
    const part = event.payload.properties.part;
    return `message.part.updated:${event.directory}:${part.messageID}:${part.id}`;
  }
  return undefined;
};

export function enqueueServerEvent(
  queue: QueuedServerEvent[],
  event: QueuedServerEvent,
) {
  const key = coalescedKey(event);
  const previous = queue[queue.length - 1];
  if (key && previous && coalescedKey(previous) === key) {
    queue[queue.length - 1] = event;
    return false;
  }
  queue.push(event);
  return true;
}

export function coalesceServerEvents(events: QueuedServerEvent[]) {
  const output: QueuedServerEvent[] = [];
  events.forEach((event) => {
    if (event.payload.type !== "message.part.delta") {
      output.push(event);
      return;
    }
    const props = event.payload.properties;
    const previous = output[output.length - 1];
    if (
      !previous ||
      previous.payload.type !== "message.part.delta" ||
      previous.directory !== event.directory ||
      previous.payload.properties.messageID !== props.messageID ||
      previous.payload.properties.partID !== props.partID ||
      previous.payload.properties.field !== props.field
    ) {
      output.push({
        directory: event.directory,
        payload: { ...event.payload, properties: { ...props } },
      });
      return;
    }
    output[output.length - 1] = {
      directory: event.directory,
      payload: {
        ...event.payload,
        properties: {
          ...props,
          delta: previous.payload.properties.delta + props.delta,
        },
      },
    };
  });
  return output;
}

export function resumeStreamAfterPageShow(
  event: PageTransitionEvent,
  start: () => unknown,
) {
  if (!event.persisted) return;
  start();
}

export interface GlobalSDKContextValue {
  url: string;
  client: OpencodeClient;
  event: {
    on: Emitter<EventMap>["on"];
    listen: Emitter<EventMap>["listen"];
    start: () => Promise<void> | undefined;
  };
  createClient: (
    opts: Omit<Parameters<typeof createSdkForServer>[0], "server" | "fetch">,
  ) => OpencodeClient;
}

const GlobalSDKContext = createContext<GlobalSDKContextValue | null>(null);

interface GlobalSDKProviderProps {
  children: ReactNode;
}

export function GlobalSDKProvider({ children }: GlobalSDKProviderProps) {
  const server = useServer();
  const platform = usePlatform();

  const [stable] = useState<{
    value: GlobalSDKContextValue;
    stop: () => void;
    abort: AbortController;
    flush: () => void;
    onPageHide: () => void;
    onPageShow: (event: PageTransitionEvent) => void;
  }>(() => {
    const abort = new AbortController();

    // Platform fetch bypasses mixed-content for plain HTTP to remote hosts
    const eventFetch = (() => {
      if (!platform.fetch || !server.current) return;
      try {
        const url = new URL(server.current.http.url);
        const loopback =
          url.hostname === "localhost" ||
          url.hostname === "127.0.0.1" ||
          url.hostname === "::1";
        if (url.protocol === "http:" && !loopback) return platform.fetch;
      } catch {
        return;
      }
    })();

    const currentServer = server.current;
    if (!currentServer) throw new Error(m.error_globalSDK_noServerAvailable());

    const eventSdk = createSdkForServer({
      signal: abort.signal,
      fetch: eventFetch,
      server: currentServer.http,
    });

    const emitter = createEmitter<EventMap>();

    const FLUSH_FRAME_MS = 16;
    const STREAM_YIELD_MS = 8;
    const RECONNECT_DELAY_MS = 250;

    let queue: QueuedServerEvent[] = [];
    let buffer: QueuedServerEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;

    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;

      if (queue.length === 0) return;

      const events = queue;
      queue = buffer;
      buffer = events;
      queue.length = 0;

      last = Date.now();
      for (const event of coalesceServerEvents(events)) {
        emitter.emit(event.directory, event.payload);
      }

      buffer.length = 0;
    };

    const schedule = () => {
      if (timer) return;
      const elapsed = Date.now() - last;
      timer = setTimeout(flush, Math.max(0, FLUSH_FRAME_MS - elapsed));
    };

    let streamErrorLogged = false;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    const aborted = (error: unknown) => abortError.safeParse(error).success;
    const closed = (error: unknown, signal?: AbortSignal) =>
      aborted(error) || signal?.aborted === true;

    let attempt: AbortController | undefined;
    let run: Promise<void> | undefined;
    let started = false;
    let generation = 0;

    const start = () => {
      if (started) return run;
      started = true;
      const active = ++generation;
      const previous = run;
      const current = (async () => {
        if (previous) await previous;
        while (!abort.signal.aborted && started && generation === active) {
          attempt = new AbortController();
          const onAbort = () => {
            attempt?.abort();
          };
          abort.signal.addEventListener("abort", onAbort);
          try {
            const events = await eventSdk.global.event({
              signal: attempt.signal,
            });
            let yielded = Date.now();
            for await (const event of events.stream) {
              streamErrorLogged = false;
              const directory = event.directory ?? "global";

              if (event.payload.type === "sync") {
                continue;
              }

              const payload = event.payload;

              if (enqueueServerEvent(queue, { directory, payload })) {
                schedule();
              }

              if (Date.now() - yielded < STREAM_YIELD_MS) continue;
              yielded = Date.now();
              await wait(0);
            }
          } catch (error) {
            if (!closed(error, attempt?.signal) && !streamErrorLogged) {
              streamErrorLogged = true;
              console.error("[global-sdk] event stream failed", {
                url: currentServer.http.url,
                fetch: eventFetch ? "platform" : "webview",
                error,
              });
            }
          } finally {
            abort.signal.removeEventListener("abort", onAbort);
            attempt = undefined;
          }

          if (abort.signal.aborted || !started || generation !== active) return;
          await wait(RECONNECT_DELAY_MS);
        }
      })()
        .catch((error) => {
          if (!aborted(error)) console.error("[global-sdk] run failed", error);
        })
        .finally(() => {
          if (run !== current) return;
          run = undefined;
          flush();
        });
      run = current;
      return run;
    };

    const stop = () => {
      started = false;
      generation++;
      attempt?.abort();
    };

    const onPageHide = () => stop();
    const onPageShow = (event: PageTransitionEvent) =>
      resumeStreamAfterPageShow(event, start);

    const sdk = createSdkForServer({
      server: currentServer.http,
      fetch: platform.fetch,
      throwOnError: true,
    });

    return {
      value: {
        url: currentServer.http.url,
        client: sdk,
        event: {
          on: emitter.on,
          listen: emitter.listen,
          start,
        },
        createClient(opts) {
          const s = server.current;
          if (!s) throw new Error(m.error_globalSDK_serverNotAvailable());
          return createSdkForServer({
            server: s.http,
            fetch: platform.fetch,
            ...opts,
          });
        },
      },
      stop,
      abort,
      flush,
      onPageHide,
      onPageShow,
    };
  });

  useEffect(() => {
    window.addEventListener("pagehide", stable.onPageHide);
    window.addEventListener("pageshow", stable.onPageShow);
    return () => {
      stable.stop();
      stable.abort.abort();
      stable.flush();
      window.removeEventListener("pagehide", stable.onPageHide);
      window.removeEventListener("pageshow", stable.onPageShow);
    };
  }, [stable]);

  return (
    <GlobalSDKContext.Provider value={stable.value}>
      {children}
    </GlobalSDKContext.Provider>
  );
}

export function useGlobalSDK(): GlobalSDKContextValue {
  const value = useContext(GlobalSDKContext);
  if (!value) {
    throw new Error("useGlobalSDK must be used within a <GlobalSDKProvider>");
  }
  return value;
}
