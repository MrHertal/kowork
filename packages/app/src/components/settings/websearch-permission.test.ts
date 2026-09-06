import { describe, expect, it } from "vitest";

import { webSearchEnabled, webSearchPermission } from "./websearch-permission";

describe("webSearchEnabled", () => {
  it("is enabled when there is no permission config", () => {
    expect(webSearchEnabled(undefined)).toBe(true);
    expect(webSearchEnabled({})).toBe(true);
  });

  it("is enabled for a bare global action", () => {
    expect(webSearchEnabled("allow")).toBe(true);
    expect(webSearchEnabled("deny")).toBe(true);
  });

  it("is disabled only by an explicit websearch deny", () => {
    expect(webSearchEnabled({ websearch: "deny" })).toBe(false);
    expect(webSearchEnabled({ websearch: "allow" })).toBe(true);
    expect(webSearchEnabled({ websearch: "ask" })).toBe(true);
    expect(webSearchEnabled({ edit: "deny" })).toBe(true);
  });
});

describe("webSearchPermission", () => {
  it("maps the toggle to a permission action", () => {
    expect(webSearchPermission(true)).toEqual({ websearch: "allow" });
    expect(webSearchPermission(false)).toEqual({ websearch: "deny" });
  });
});
