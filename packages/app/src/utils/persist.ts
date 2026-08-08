import type { AsyncStorage, Platform } from "@/contexts/platform";

export type PersistTarget = {
  storage?: string;
  key: string;
  legacy?: string[];
  migrate?: (value: unknown) => unknown;
};

const NAMESPACE = "kowork";
const GLOBAL_STORAGE = `${NAMESPACE}.global.dat`;

function checksum(content: string): string | undefined {
  if (!content) return undefined;
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function workspaceStorage(dir: string): string {
  const head = (dir.slice(0, 12) || "workspace").replace(
    /[^a-zA-Z0-9._-]/g,
    "-",
  );
  const sum = checksum(dir) ?? "0";
  return `${NAMESPACE}.workspace.${head}.${sum}.dat`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function merge(defaults: unknown, value: unknown): unknown {
  if (value === undefined) return defaults;
  if (value === null) return value;

  if (Array.isArray(defaults)) {
    if (Array.isArray(value)) return value;
    return defaults;
  }

  if (isRecord(defaults)) {
    if (!isRecord(value)) return defaults;
    const result: Record<string, unknown> = { ...defaults };
    for (const key of Object.keys(value)) {
      if (key in defaults) {
        result[key] = merge(defaults[key], value[key]);
      } else {
        result[key] = value[key];
      }
    }
    return result;
  }

  return value;
}

function parse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function normalize(
  defaults: unknown,
  raw: string,
  migrate?: (value: unknown) => unknown,
): string | undefined {
  const parsed = parse(raw);
  if (parsed === undefined) return undefined;
  const migrated = migrate ? migrate(parsed) : parsed;
  const merged = merge(defaults, migrated);
  return JSON.stringify(merged);
}

export const Persist = {
  global(key: string, legacy?: string[]): PersistTarget {
    return { storage: GLOBAL_STORAGE, key, legacy };
  },
  workspace(dir: string, key: string, legacy?: string[]): PersistTarget {
    return {
      storage: workspaceStorage(dir),
      key: `workspace:${key}`,
      legacy,
    };
  },
  session(
    dir: string,
    session: string,
    key: string,
    legacy?: string[],
  ): PersistTarget {
    return {
      storage: workspaceStorage(dir),
      key: `session:${session}:${key}`,
      legacy,
    };
  },
  scoped(
    dir: string,
    session: string | undefined,
    key: string,
    legacy?: string[],
  ): PersistTarget {
    if (session) return Persist.session(dir, session, key, legacy);
    return Persist.workspace(dir, key, legacy);
  },
};

export async function loadPersisted<T>(
  storage: AsyncStorage,
  target: PersistTarget,
  defaultValue: T,
): Promise<T> {
  const raw = await storage.getItem(target.key);
  if (raw !== null) {
    const normalized = normalize(defaultValue, raw, target.migrate);
    if (normalized === undefined) {
      await storage.removeItem(target.key);
    } else {
      if (raw !== normalized) await storage.setItem(target.key, normalized);
      return JSON.parse(normalized) as T;
    }
  }

  if (target.legacy) {
    for (const legacyKey of target.legacy) {
      const legacyRaw = await storage.getItem(legacyKey);
      if (legacyRaw === null) continue;

      const normalized = normalize(defaultValue, legacyRaw, target.migrate);
      if (normalized === undefined) {
        await storage.removeItem(legacyKey);
        continue;
      }
      await storage.setItem(target.key, normalized);
      await storage.removeItem(legacyKey);
      return JSON.parse(normalized) as T;
    }
  }

  return defaultValue;
}

export async function savePersisted(
  storage: AsyncStorage,
  target: PersistTarget,
  value: unknown,
): Promise<void> {
  await storage.setItem(target.key, JSON.stringify(value));
}

export function resolveStorage(
  platform: Platform,
  target: PersistTarget,
): AsyncStorage {
  if (platform.storage) return platform.storage(target.storage);
  if (!target.storage) return localStorageAsync();
  return localStorageWithPrefix(target.storage);
}

function localStorageAsync(): AsyncStorage {
  return {
    getItem: (key) => Promise.resolve(localStorage.getItem(key)),
    setItem: (key, value) => {
      localStorage.setItem(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
      return Promise.resolve();
    },
    clear: () => {
      localStorage.clear();
      return Promise.resolve();
    },
    key: (index) => Promise.resolve(localStorage.key(index) ?? undefined),
    getLength: () => Promise.resolve(localStorage.length),
  };
}

function localStorageWithPrefix(prefix: string): AsyncStorage {
  const base = `${prefix}:`;
  return {
    getItem: (key) => Promise.resolve(localStorage.getItem(base + key)),
    setItem: (key, value) => {
      localStorage.setItem(base + key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      localStorage.removeItem(base + key);
      return Promise.resolve();
    },
    clear: () => {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(base)) toRemove.push(k);
      }
      for (const k of toRemove) localStorage.removeItem(k);
      return Promise.resolve();
    },
    key: (index) => {
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(base)) {
          if (count === index) return Promise.resolve(k.slice(base.length));
          count++;
        }
      }
      return Promise.resolve(undefined);
    },
    getLength: () => {
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(base)) count++;
      }
      return Promise.resolve(count);
    },
  };
}
