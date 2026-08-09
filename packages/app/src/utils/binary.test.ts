import { describe, expect, it } from "vitest";
import { Binary } from "./binary";

const byId = (item: { id: string }) => item.id;

describe("Binary.search", () => {
  it("finds an existing item and its index", () => {
    const array = [{ id: "a" }, { id: "c" }, { id: "e" }];

    expect(Binary.search(array, "c", byId)).toEqual({ found: true, index: 1 });
    expect(Binary.search(array, "a", byId)).toEqual({ found: true, index: 0 });
    expect(Binary.search(array, "e", byId)).toEqual({ found: true, index: 2 });
  });

  it("reports the insertion point for missing items", () => {
    const array = [{ id: "a" }, { id: "c" }, { id: "e" }];

    expect(Binary.search(array, "b", byId)).toEqual({
      found: false,
      index: 1,
    });
    expect(Binary.search(array, "z", byId)).toEqual({
      found: false,
      index: 3,
    });
    expect(Binary.search(array, "0", byId)).toEqual({
      found: false,
      index: 0,
    });
  });

  it("handles empty arrays", () => {
    expect(Binary.search([], "a", byId)).toEqual({ found: false, index: 0 });
  });
});

describe("Binary.insert", () => {
  it("inserts in sorted order", () => {
    const array: Array<{ id: string }> = [];

    Binary.insert(array, { id: "c" }, byId);
    Binary.insert(array, { id: "a" }, byId);
    Binary.insert(array, { id: "e" }, byId);
    Binary.insert(array, { id: "b" }, byId);

    expect(array.map(byId)).toEqual(["a", "b", "c", "e"]);
  });

  it("inserts duplicates before existing equal ids", () => {
    const existing = { id: "b", tag: 1 };
    const incoming = { id: "b", tag: 2 };
    const array = [{ id: "a" }, existing, { id: "c" }];

    Binary.insert(array, incoming, byId);

    expect(array).toEqual([{ id: "a" }, incoming, existing, { id: "c" }]);
  });

  it("keeps search working after inserts", () => {
    const array: Array<{ id: string }> = [];
    for (const id of ["m", "a", "z", "f"]) Binary.insert(array, { id }, byId);

    expect(Binary.search(array, "f", byId)).toEqual({ found: true, index: 1 });
    expect(Binary.search(array, "z", byId)).toEqual({ found: true, index: 3 });
    expect(Binary.search(array, "q", byId)).toEqual({
      found: false,
      index: 3,
    });
  });
});
