// @opencode-ref: opencode/packages/app/src/context/server.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePlatform } from "./platform";
import { useCheckServerHealth } from "@/utils/server-health";
import {
  Persist,
  loadPersisted,
  resolveStorage,
  savePersisted,
} from "@/utils/persist";

const HEALTH_POLL_INTERVAL_MS = 10_000;
const PERSIST_TARGET = Persist.global("server", ["server.v3"]);

type StoredProject = { worktree: string; expanded: boolean };
type StoredServer = string | ServerConnection.HttpBase | ServerConnection.Http;

export function normalizeServerUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return;
  const withProtocol = /^https?:\/\//.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export function serverName(
  conn?: ServerConnection.Any,
  ignoreDisplayName = false,
) {
  if (!conn) return "";
  if (conn.displayName && !ignoreDisplayName) return conn.displayName;
  return conn.http.url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function isLocalHost(url: string) {
  const host = url.replace(/^https?:\/\//, "").split(":")[0];
  if (host === "localhost" || host === "127.0.0.1") return "local";
}

export function projectsKey(key: ServerConnection.Key) {
  if (!key) return "";
  if (key === "sidecar") return "local";
  if (isLocalHost(key)) return "local";
  return key;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ServerConnection {
  type Base = { displayName?: string };

  export type Key = string & { readonly _brand: "Key" };

  export const Key = { make: (v: string) => v as Key };

  export type HttpBase = {
    url: string;
    username?: string;
    password?: string;
  };

  export type Http = {
    type: "http";
    http: HttpBase;
  } & Base;

  export type Sidecar = {
    type: "sidecar";
    http: HttpBase;
  } & (
    | { variant: "base" }
    | {
        variant: "wsl";
        distro: string;
      }
  ) &
    Base;

  // Remote server desktop can SSH into
  export type Ssh = {
    type: "ssh";
    host: string;
    // SSH client exposes an HTTP server for the app to use as a proxy
    http: HttpBase;
  } & Base;

  export type Any =
    | Http
    // All these are desktop-only
    | (Sidecar | Ssh);

  export const key = (conn: Any): Key => {
    switch (conn.type) {
      case "http":
        return Key.make(conn.http.url);
      case "sidecar": {
        if (conn.variant === "wsl") return Key.make(`wsl:${conn.distro}`);
        return Key.make("sidecar");
      }
      case "ssh":
        return Key.make(`ssh:${conn.host}`);
    }
  };
}

type PersistedState = {
  list: StoredServer[];
  projects: Record<string, StoredProject[]>;
  lastProject: Record<string, string>;
};

const createDefaultPersisted = (): PersistedState => ({
  list: [],
  projects: {},
  lastProject: {},
});

type ServerState = PersistedState & {
  active: ServerConnection.Key;
  healthy: boolean | undefined;
};

type ServerAction =
  | { type: "LOAD_PERSISTED"; payload: Partial<PersistedState> }
  | { type: "SET_ACTIVE"; payload: ServerConnection.Key }
  | { type: "SET_HEALTHY"; payload: boolean | undefined }
  | {
      type: "ADD_SERVER";
      payload: { conn: ServerConnection.Http; url: string };
    }
  | {
      type: "REMOVE_SERVER";
      payload: {
        key: ServerConnection.Key;
        defaultServer: ServerConnection.Key;
      };
    }
  | { type: "PROJECT_OPEN"; payload: { origin: string; directory: string } }
  | { type: "PROJECT_CLOSE"; payload: { origin: string; directory: string } }
  | { type: "PROJECT_EXPAND"; payload: { origin: string; directory: string } }
  | { type: "PROJECT_COLLAPSE"; payload: { origin: string; directory: string } }
  | {
      type: "PROJECT_MOVE";
      payload: { origin: string; directory: string; toIndex: number };
    }
  | { type: "PROJECT_TOUCH"; payload: { origin: string; directory: string } };

function url(x: StoredServer): string {
  return typeof x === "string" ? x : "type" in x ? x.http.url : x.url;
}

function serverReducer(state: ServerState, action: ServerAction): ServerState {
  switch (action.type) {
    case "LOAD_PERSISTED":
      return {
        ...state,
        list: action.payload.list ?? state.list,
        projects: action.payload.projects ?? state.projects,
        lastProject: action.payload.lastProject ?? state.lastProject,
      };

    case "SET_ACTIVE":
      if (state.active === action.payload) return state;
      return { ...state, active: action.payload };

    case "SET_HEALTHY":
      return { ...state, healthy: action.payload };

    case "ADD_SERVER": {
      const { conn, url: url_ } = action.payload;
      const existing = state.list.findIndex((x) => url(x) === url_);
      const list =
        existing !== -1
          ? state.list.map((x, i) => (i === existing ? conn : x))
          : [...state.list, conn];
      return { ...state, list, active: ServerConnection.key(conn) };
    }

    case "REMOVE_SERVER": {
      const { key, defaultServer } = action.payload;
      const list = state.list.filter((x) => url(x) !== key);
      const active =
        state.active === key
          ? list[0]
            ? ServerConnection.Key.make(url(list[0]))
            : defaultServer
          : state.active;
      return { ...state, list, active };
    }

    case "PROJECT_OPEN": {
      const { origin, directory } = action.payload;
      const current = state.projects[origin] ?? [];
      if (current.find((x) => x.worktree === directory)) return state;
      return {
        ...state,
        projects: {
          ...state.projects,
          [origin]: [{ worktree: directory, expanded: true }, ...current],
        },
      };
    }

    case "PROJECT_CLOSE": {
      const { origin, directory } = action.payload;
      const current = state.projects[origin] ?? [];
      return {
        ...state,
        projects: {
          ...state.projects,
          [origin]: current.filter((x) => x.worktree !== directory),
        },
      };
    }

    case "PROJECT_EXPAND": {
      const { origin, directory } = action.payload;
      const current = state.projects[origin] ?? [];
      const index = current.findIndex((x) => x.worktree === directory);
      if (index === -1) return state;
      return {
        ...state,
        projects: {
          ...state.projects,
          [origin]: current.map((x, i) =>
            i === index ? { ...x, expanded: true } : x,
          ),
        },
      };
    }

    case "PROJECT_COLLAPSE": {
      const { origin, directory } = action.payload;
      const current = state.projects[origin] ?? [];
      const index = current.findIndex((x) => x.worktree === directory);
      if (index === -1) return state;
      return {
        ...state,
        projects: {
          ...state.projects,
          [origin]: current.map((x, i) =>
            i === index ? { ...x, expanded: false } : x,
          ),
        },
      };
    }

    case "PROJECT_MOVE": {
      const { origin, directory, toIndex } = action.payload;
      const current = state.projects[origin] ?? [];
      const fromIndex = current.findIndex((x) => x.worktree === directory);
      if (fromIndex === -1 || fromIndex === toIndex) return state;
      const result = [...current];
      result.splice(toIndex, 0, ...result.splice(fromIndex, 1));
      return {
        ...state,
        projects: { ...state.projects, [origin]: result },
      };
    }

    case "PROJECT_TOUCH": {
      const { origin, directory } = action.payload;
      return {
        ...state,
        lastProject: { ...state.lastProject, [origin]: directory },
      };
    }
  }
}

export type ServerContextValue = {
  ready: boolean;
  healthy: boolean | undefined;
  isLocal: boolean;
  key: ServerConnection.Key;
  name: string;
  list: ServerConnection.Any[];
  current: ServerConnection.Any | undefined;
  setActive: (key: ServerConnection.Key) => void;
  add: (input: ServerConnection.Http) => ServerConnection.Http | undefined;
  remove: (key: ServerConnection.Key) => void;
  projects: {
    list: StoredProject[];
    open: (directory: string) => void;
    close: (directory: string) => void;
    expand: (directory: string) => void;
    collapse: (directory: string) => void;
    move: (directory: string, toIndex: number) => void;
    last: () => string | undefined;
    touch: (directory: string) => void;
  };
};

const ServerContext = createContext<ServerContextValue | null>(null);

interface ServerProviderProps {
  defaultServer: ServerConnection.Key;
  disableHealthCheck?: boolean;
  servers?: ServerConnection.Any[];
  children: ReactNode;
}

export function ServerProvider({
  defaultServer,
  disableHealthCheck,
  servers: injectedServers,
  children,
}: ServerProviderProps) {
  const platform = usePlatform();
  const checkServerHealth = useCheckServerHealth();
  const checkServerHealthRef = useRef(checkServerHealth);
  useEffect(() => {
    checkServerHealthRef.current = checkServerHealth;
  });

  const [state, dispatch] = useReducer(serverReducer, {
    ...createDefaultPersisted(),
    active: defaultServer,
    healthy: undefined,
  });

  const [ready, setReady] = useState(false);
  const dirty = useRef(false);
  const lastHealthyUrlRef = useRef<string | undefined>(undefined);
  const [storage] = useState(() => resolveStorage(platform, PERSIST_TARGET));

  useEffect(() => {
    let cancelled = false;
    void loadPersisted(storage, PERSIST_TARGET, createDefaultPersisted())
      .then((value) => {
        if (cancelled) return;
        if (!dirty.current) {
          dispatch({ type: "LOAD_PERSISTED", payload: value });
        }
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[server] failed to load persisted state", { error });
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  useEffect(() => {
    if (!ready) return;
    if (!dirty.current) return;
    dirty.current = false;
    void savePersisted(storage, PERSIST_TARGET, {
      list: state.list,
      projects: state.projects,
      lastProject: state.lastProject,
    });
  }, [ready, state.list, state.projects, state.lastProject, storage]);

  const allServers = useMemo((): ServerConnection.Any[] => {
    const servers: (ServerConnection.Any | ServerConnection.HttpBase)[] = [
      ...(injectedServers ?? []),
      ...state.list.map((value) =>
        typeof value === "string"
          ? { type: "http" as const, http: { url: value } }
          : value,
      ),
    ];

    const deduped = new Map(
      servers.map((value) => {
        const conn: ServerConnection.Any =
          "type" in value ? value : { type: "http", http: value };
        return [ServerConnection.key(conn), conn] as const;
      }),
    );

    return [...deduped.values()];
  }, [injectedServers, state.list]);

  const current = useMemo(
    () =>
      allServers.find((s) => ServerConnection.key(s) === state.active) ??
      allServers[0],
    [allServers, state.active],
  );

  const isLocal = useMemo(() => {
    if (!current) return false;
    return (
      (current.type === "sidecar" && current.variant === "base") ||
      (current.type === "http" && !!isLocalHost(current.http.url))
    );
  }, [current]);

  const origin = useMemo(() => projectsKey(state.active), [state.active]);
  const projectsList = useMemo(
    () => state.projects[origin] ?? [],
    [state.projects, origin],
  );

  useEffect(() => {
    if (!current || !ready) return;
    if (disableHealthCheck) {
      dispatch({ type: "SET_HEALTHY", payload: true });
      return;
    }

    const url = current?.http.url;
    if (lastHealthyUrlRef.current !== url) {
      lastHealthyUrlRef.current = url;
      dispatch({ type: "SET_HEALTHY", payload: undefined });
    }

    let alive = true;
    let busy = false;

    const run = () => {
      if (busy) return;
      busy = true;
      void checkServerHealthRef
        .current(current.http)
        .then((result) => {
          if (!alive) return;
          dispatch({ type: "SET_HEALTHY", payload: result.healthy });
        })
        .finally(() => {
          busy = false;
        });
    };

    run();
    const interval = setInterval(run, HEALTH_POLL_INTERVAL_MS);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [current, ready, disableHealthCheck]);

  const setActive = useCallback((input: ServerConnection.Key) => {
    dispatch({ type: "SET_ACTIVE", payload: input });
  }, []);

  const add = useCallback((input: ServerConnection.Http) => {
    const url_ = normalizeServerUrl(input.http.url);
    if (!url_) return;
    const conn = { ...input, http: { ...input.http, url: url_ } };
    dirty.current = true;
    dispatch({ type: "ADD_SERVER", payload: { conn, url: url_ } });
    return conn;
  }, []);

  const remove = useCallback(
    (key: ServerConnection.Key) => {
      dirty.current = true;
      dispatch({ type: "REMOVE_SERVER", payload: { key, defaultServer } });
    },
    [defaultServer],
  );

  const projects = useMemo(
    () => ({
      list: projectsList,
      open: (directory: string) => {
        if (!origin) return;
        dirty.current = true;
        dispatch({ type: "PROJECT_OPEN", payload: { origin, directory } });
      },
      close: (directory: string) => {
        if (!origin) return;
        dirty.current = true;
        dispatch({ type: "PROJECT_CLOSE", payload: { origin, directory } });
      },
      expand: (directory: string) => {
        if (!origin) return;
        dirty.current = true;
        dispatch({ type: "PROJECT_EXPAND", payload: { origin, directory } });
      },
      collapse: (directory: string) => {
        if (!origin) return;
        dirty.current = true;
        dispatch({
          type: "PROJECT_COLLAPSE",
          payload: { origin, directory },
        });
      },
      move: (directory: string, toIndex: number) => {
        if (!origin) return;
        dirty.current = true;
        dispatch({
          type: "PROJECT_MOVE",
          payload: { origin, directory, toIndex },
        });
      },
      last: () => {
        if (!origin) return;
        return state.lastProject[origin];
      },
      touch: (directory: string) => {
        if (!origin) return;
        dirty.current = true;
        dispatch({ type: "PROJECT_TOUCH", payload: { origin, directory } });
      },
    }),
    [projectsList, origin, state.lastProject],
  );

  const ctxValue = useMemo<ServerContextValue>(
    () => ({
      ready,
      healthy: state.healthy,
      isLocal,
      key: state.active,
      name: serverName(current),
      list: allServers,
      current,
      setActive,
      add,
      remove,
      projects,
    }),
    [
      ready,
      state.healthy,
      state.active,
      isLocal,
      current,
      allServers,
      setActive,
      add,
      remove,
      projects,
    ],
  );

  if (!ready || !state.active) return null;

  return (
    <ServerContext.Provider value={ctxValue}>{children}</ServerContext.Provider>
  );
}

export function useServer(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error("useServer must be used within a ServerProvider");
  return ctx;
}
