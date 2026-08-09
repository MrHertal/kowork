import { describe, expect, it } from "vitest";
import { ascending, descending, schema } from "./id";

describe("ascending", () => {
  it("generates prefixed ids", () => {
    const id = ascending("session");

    expect(id).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  });

  it("returns given ids with a matching prefix", () => {
    expect(ascending("session", "ses_abc")).toBe("ses_abc");
  });

  it("rejects given ids with the wrong prefix", () => {
    expect(() => ascending("session", "msg_abc")).toThrow(
      "ID msg_abc does not start with ses",
    );
  });

  it("generates strictly increasing ids", () => {
    const ids = Array.from({ length: 50 }, () => ascending("message"));

    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("descending", () => {
  it("generates strictly decreasing ids", () => {
    const ids = Array.from({ length: 50 }, () => descending("message"));

    expect([...ids].sort().reverse()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects given ids with the wrong prefix", () => {
    expect(() => descending("session", "msg_abc")).toThrow(
      "ID msg_abc does not start with ses",
    );
  });
});

describe("schema", () => {
  it("accepts ids with the matching prefix", () => {
    expect(schema("session").safeParse(ascending("session")).success).toBe(
      true,
    );
  });

  it("rejects ids with a different prefix", () => {
    expect(schema("message").safeParse(ascending("session")).success).toBe(
      false,
    );
  });

  it("rejects non-string values", () => {
    expect(schema("part").safeParse(42).success).toBe(false);
  });
});
