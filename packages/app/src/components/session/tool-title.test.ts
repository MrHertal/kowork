import { describe, expect, it } from "vitest";
import { getToolTitle } from "./tool-title";

describe("getToolTitle", () => {
  it("returns localized titles for known tools", () => {
    const titles: Record<string, string> = {
      read: "Read",
      list: "List files",
      glob: "Find",
      grep: "Search text",
      webfetch: "Read web page",
      bash: "Command",
      edit: "Edit",
      write: "Write",
      apply_patch: "Update",
      todowrite: "To-dos",
      question: "Questions",
      skill: "Skill",
      task: "Subtask",
    };

    for (const [tool, title] of Object.entries(titles)) {
      expect(getToolTitle(tool)).toBe(title);
    }
  });

  it("falls back to the raw tool name for unknown tools", () => {
    expect(getToolTitle("mcp_connector_search")).toBe("mcp_connector_search");
  });
});
