// @opencode-ref: opencode/packages/app/src/utils/persist.test.ts
import { beforeEach, describe, expect, test } from "vitest";
import type { AsyncStorage } from "@/contexts/platform";
import { loadPersisted, Persist, savePersisted } from "./persist";

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
let storage: AsyncStorage;

beforeEach(() => {
  memory = new Map();
  storage = createStorage(memory);
});

describe("Persist targets", () => {
  test("global targets use the shared storage file", () => {
    const target = Persist.global("settings");

    expect(target.storage).toBe("kowork.global.dat");
    expect(target.key).toBe("settings");
  });

  test("workspace targets prefix the key", () => {
    const target = Persist.workspace("/repo", "vcs");

    expect(target.key).toBe("workspace:vcs");
  });

  test("session targets include the session in the key", () => {
    const target = Persist.session("/repo", "ses_1", "layout");

    expect(target.key).toBe("session:ses_1:layout");
    expect(target.storage).toBe(Persist.workspace("/repo", "vcs").storage);
  });

  test("scoped targets fall back to workspace without a session", () => {
    expect(Persist.scoped("/repo", "ses_1", "layout").key).toBe(
      "session:ses_1:layout",
    );
    expect(Persist.scoped("/repo", undefined, "layout").key).toBe(
      "workspace:layout",
    );
  });
});

describe("workspace storage name", () => {
  test("sanitizes Windows filename characters", () => {
    const result = Persist.workspace("C:\\Users\\foo", "vcs").storage;

    expect(result?.startsWith("kowork.workspace.")).toBe(true);
    expect(result?.endsWith(".dat")).toBe(true);
    expect(/[:\\/]/.test(result ?? "")).toBe(false);
  });

  test("distinguishes directories with a checksum", () => {
    const a = Persist.workspace("/repos/a", "vcs").storage;
    const b = Persist.workspace("/repos/b", "vcs").storage;

    expect(a).not.toBe(b);
  });
});

describe("loadPersisted", () => {
  test("returns defaults when nothing is stored", async () => {
    const result = await loadPersisted(storage, Persist.global("k"), {
      value: 1,
    });

    expect(result).toEqual({ value: 1 });
    expect(memory.size).toBe(0);
  });

  test("merges stored values over defaults and rewrites normalized", async () => {
    memory.set("k", '{"value":2}');

    const result = await loadPersisted(storage, Persist.global("k"), {
      value: 1,
      extra: "x",
    });

    expect(result).toEqual({ value: 2, extra: "x" });
    expect(memory.get("k")).toBe('{"value":2,"extra":"x"}');
  });

  test("keeps stored values whose type differs from the defaults", async () => {
    memory.set("k", '{"value":"nope"}');

    const result = await loadPersisted(storage, Persist.global("k"), {
      value: 1,
    });

    expect(result).toEqual({ value: "nope" });
  });

  test("removes malformed JSON payloads and returns defaults", async () => {
    memory.set("k", '{"value":"\\x"}');

    const result = await loadPersisted(storage, Persist.global("k"), {
      value: 1,
    });

    expect(result).toEqual({ value: 1 });
    expect(memory.has("k")).toBe(false);
  });

  test("migrates legacy keys into the target key", async () => {
    memory.set("legacy.workspace", '{"value":2}');
    const target = Persist.workspace("/repo", "demo", ["legacy.workspace"]);

    const result = await loadPersisted(storage, target, { value: 1 });

    expect(result).toEqual({ value: 2 });
    expect(memory.get(target.key)).toBe('{"value":2}');
    expect(memory.has("legacy.workspace")).toBe(false);
  });

  test("removes malformed legacy payloads and continues", async () => {
    memory.set("legacy.bad", "not json");
    memory.set("legacy.good", '{"value":3}');
    const target = Persist.global("k", ["legacy.bad", "legacy.good"]);

    const result = await loadPersisted(storage, target, { value: 1 });

    expect(result).toEqual({ value: 3 });
    expect(memory.has("legacy.bad")).toBe(false);
    expect(memory.has("legacy.good")).toBe(false);
    expect(memory.get("k")).toBe('{"value":3}');
  });

  test("applies the migrate function to stored values", async () => {
    memory.set("k", '{"value":2}');
    const target = {
      ...Persist.global("k"),
      migrate: (value: unknown) =>
        typeof value === "object" && value !== null
          ? { ...(value as Record<string, unknown>), upgraded: true }
          : value,
    };

    const result = await loadPersisted(storage, target, {
      value: 1,
      upgraded: false,
    });

    expect(result).toEqual({ value: 2, upgraded: true });
  });
});

describe("savePersisted", () => {
  test("writes JSON to the target key", async () => {
    await savePersisted(storage, Persist.global("k"), { value: 2 });

    expect(memory.get("k")).toBe('{"value":2}');
  });
});
