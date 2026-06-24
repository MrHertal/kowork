// @opencode-ref: opencode/packages/app/src/context/global-sdk.tsx
import { type Event, type OpencodeClient } from "@opencode-ai/sdk/v2/client";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
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

  const stableRef = useRef<{
    value: GlobalSDKContextValue;
    stop: () => void;
    abort: AbortController;
    flush: () => void;
    onVisibilityChange: () => void;
  } | null>(null);

  if (stableRef.current == null) {
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

    type Queued = { directory: string; payload: Event };
    const FLUSH_FRAME_MS = 16;
    const STREAM_YIELD_MS = 8;
    const RECONNECT_DELAY_MS = 250;

    let queue: Queued[] = [];
    let buffer: Queued[] = [];
    const coalesced = new Map<string, number>();
    const staleDeltas = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;

    const deltaKey = (directory: string, messageID: string, partID: string) =>
      `${directory}:${messageID}:${partID}`;

    const key = (directory: string, payload: Event) => {
      if (payload.type === "session.status")
        return `session.status:${directory}:${payload.properties.sessionID}`;
      if (payload.type === "lsp.updated") return `lsp.updated:${directory}`;
      if (payload.type === "message.part.updated") {
        const part = payload.properties.part;
        return `message.part.updated:${directory}:${part.messageID}:${part.id}`;
      }
    };

    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;

      if (queue.length === 0) return;

      const events = queue;
      const skip = staleDeltas.size > 0 ? new Set(staleDeltas) : undefined;
      queue = buffer;
      buffer = events;
      queue.length = 0;
      coalesced.clear();
      staleDeltas.clear();

      last = Date.now();
      for (const event of events) {
        if (skip && event.payload.type === "message.part.delta") {
          const props = event.payload.properties;
          if (
            skip.has(deltaKey(event.directory, props.messageID, props.partID))
          )
            continue;
        }
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

    let attempt: AbortController | undefined;
    let run: Promise<void> | undefined;
    let started = false;
    const HEARTBEAT_TIMEOUT_MS = 15_000;
    let lastEventAt = Date.now();
    let heartbeat: ReturnType<typeof setTimeout> | undefined;

    const resetHeartbeat = () => {
      lastEventAt = Date.now();
      if (heartbeat) clearTimeout(heartbeat);
      heartbeat = setTimeout(() => {
        attempt?.abort();
      }, HEARTBEAT_TIMEOUT_MS);
    };

    const clearHeartbeat = () => {
      if (!heartbeat) return;
      clearTimeout(heartbeat);
      heartbeat = undefined;
    };

    const start = () => {
      if (started) return run;
      started = true;
      run = (async () => {
        while (!abort.signal.aborted && started) {
          attempt = new AbortController();
          lastEventAt = Date.now();
          const onAbort = () => {
            attempt?.abort();
          };
          abort.signal.addEventListener("abort", onAbort);
          try {
            const events = await eventSdk.global.event({
              signal: attempt.signal,
              onSseError: (error) => {
                if (aborted(error)) return;
                if (streamErrorLogged) return;
                streamErrorLogged = true;
                console.error("[global-sdk] event stream error", {
                  url: currentServer.http.url,
                  fetch: eventFetch ? "platform" : "webview",
                  error,
                });
              },
            });
            let yielded = Date.now();
            resetHeartbeat();
            for await (const event of events.stream) {
              resetHeartbeat();
              streamErrorLogged = false;
              const directory = event.directory ?? "global";

              if (event.payload.type === "sync") {
                continue;
              }

              const payload = event.payload as Event;

              const k = key(directory, payload);
              if (k) {
                const i = coalesced.get(k);
                if (i !== undefined) {
                  queue[i] = { directory, payload };
                  if (payload.type === "message.part.updated") {
                    const part = payload.properties.part;
                    staleDeltas.add(
                      deltaKey(directory, part.messageID, part.id),
                    );
                  }
                  continue;
                }
                coalesced.set(k, queue.length);
              }
              queue.push({ directory, payload });
              schedule();

              if (Date.now() - yielded < STREAM_YIELD_MS) continue;
              yielded = Date.now();
              await wait(0);
            }
          } catch (error) {
            if (!aborted(error) && !streamErrorLogged) {
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
            clearHeartbeat();
          }

          if (abort.signal.aborted || !started) return;
          await wait(RECONNECT_DELAY_MS);
        }
      })()
        .catch((error) => {
          if (!aborted(error)) console.error("[global-sdk] run failed", error);
        })
        .finally(() => {
          run = undefined;
          flush();
        });
      return run;
    };

    const stop = () => {
      started = false;
      attempt?.abort();
      clearHeartbeat();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (!started) return;
      if (Date.now() - lastEventAt < HEARTBEAT_TIMEOUT_MS) return;
      attempt?.abort();
    };

    const sdk = createSdkForServer({
      server: currentServer.http,
      fetch: platform.fetch,
      throwOnError: true,
    });

    stableRef.current = {
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
      onVisibilityChange,
    };
  }

  useEffect(() => {
    const ref = stableRef.current;
    if (!ref) return;
    document.addEventListener("visibilitychange", ref.onVisibilityChange);
    return () => {
      ref.stop();
      ref.abort.abort();
      ref.flush();
      document.removeEventListener("visibilitychange", ref.onVisibilityChange);
      stableRef.current = null;
    };
  }, []);

  return (
    <GlobalSDKContext.Provider value={stableRef.current!.value}>
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
