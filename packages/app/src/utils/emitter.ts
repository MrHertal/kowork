type Handler<T> = (event: T) => void;

type EmitterPayload<EventMap> = {
  [K in keyof EventMap & string]: {
    readonly name: K;
    readonly details: EventMap[K];
  };
}[keyof EventMap & string];

export interface Emitter<EventMap extends Record<string, unknown>> {
  emit: <K extends keyof EventMap & string>(
    name: K,
    details: EventMap[K],
  ) => void;
  on: <K extends keyof EventMap & string>(
    name: K,
    handler: Handler<EventMap[K]>,
  ) => () => void;
  listen: (handler: (payload: EmitterPayload<EventMap>) => void) => () => void;
}

export function createEmitter<
  EventMap extends Record<string, unknown>,
>(): Emitter<EventMap> {
  // Type safety is enforced by the public Emitter<EventMap> interface.
  // Internally we erase handler types with a narrow callable alias.
  type Callback = (...args: unknown[]) => void;

  const channels = new Map<string, Set<Callback>>();
  const globals = new Set<Callback>();

  // Diverges from upstream: a throwing listener must not drop the rest of an
  // SSE frame for every other listener and directory (see global-sdk flush).
  const safe = (name: string, fn: Callback, arg: unknown) => {
    try {
      fn(arg);
    } catch (error) {
      console.error("[emitter] listener failed", { name, error });
    }
  };

  return {
    emit(name, details) {
      for (const fn of globals) safe(name, fn, { name, details });
      const set = channels.get(name);
      if (set) {
        for (const fn of set) safe(name, fn, details);
      }
    },

    on(name, handler) {
      const key = name as string;
      const cb = handler as Callback;
      let set = channels.get(key);
      if (!set) {
        set = new Set();
        channels.set(key, set);
      }
      set.add(cb);
      return () => {
        set.delete(cb);
        if (set.size === 0) channels.delete(key);
      };
    },

    listen(handler) {
      const cb = handler as Callback;
      globals.add(cb);
      return () => {
        globals.delete(cb);
      };
    },
  };
}
