import { beforeEach, describe, expect, test, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  created: [] as unknown[],
}));

vi.mock("electron-store", () => ({
  default: class {
    constructor(options: unknown) {
      doubles.created.push(options);
    }
  },
}));

vi.mock("electron", () => ({
  app: { isPackaged: false },
}));

import { getStore } from "./store";

beforeEach(() => {
  doubles.created.length = 0;
});

describe("getStore", () => {
  test("creates the settings store with flat keys and no file extension", () => {
    getStore();

    expect(doubles.created).toEqual([
      {
        name: "kowork.settings",
        fileExtension: "",
        accessPropertiesByDotNotation: false,
      },
    ]);
  });

  test("caches stores by name", () => {
    const first = getStore("cache-check");
    const second = getStore("cache-check");

    expect(second).toBe(first);
    expect(doubles.created).toHaveLength(1);
  });

  test("creates separate stores for separate names", () => {
    const a = getStore("cache-a");
    const b = getStore("cache-b");

    expect(a).not.toBe(b);
    expect(doubles.created).toHaveLength(2);
  });
});
