import { describe, expect, it } from "vitest";

import { humanize, mcpServerTitle, parseMcpToolName } from "./mcp-tool";

describe("parseMcpToolName", () => {
  it("splits server and tool on the matching prefix", () => {
    expect(parseMcpToolName("linear_get_issue", ["linear"])).toEqual({
      server: "linear",
      tool: "get_issue",
    });
  });

  it("prefers the longest server name when names share prefixes", () => {
    expect(
      parseMcpToolName("my_server_get_issue", ["my", "my_server"]),
    ).toEqual({ server: "my_server", tool: "get_issue" });
  });

  it("returns undefined when no server matches", () => {
    expect(parseMcpToolName("linear_get_issue", ["notion"])).toBeUndefined();
  });
});

describe("humanize", () => {
  it("turns snake_case into a capitalized phrase", () => {
    expect(humanize("get_issue")).toBe("Get issue");
  });

  it("splits camelCase words", () => {
    expect(humanize("getIssue")).toBe("Get issue");
  });
});

describe("mcpServerTitle", () => {
  it("returns the brand name for popular connectors", () => {
    expect(mcpServerTitle("linear")).toBe("Linear");
  });

  it("humanizes custom connector names", () => {
    expect(mcpServerTitle("my_custom_server")).toBe("My custom server");
  });
});
