import { describe, expect, it } from "vitest";

import { webSearchBackendLabel } from "./websearch-tool";

describe("webSearchBackendLabel", () => {
  it("returns the brand name for known backends", () => {
    expect(webSearchBackendLabel("exa")).toBe("Exa");
    expect(webSearchBackendLabel("parallel")).toBe("Parallel");
  });

  it("returns undefined for unknown or missing backends", () => {
    expect(webSearchBackendLabel("brave")).toBeUndefined();
    expect(webSearchBackendLabel(undefined)).toBeUndefined();
    expect(webSearchBackendLabel(42)).toBeUndefined();
  });
});
