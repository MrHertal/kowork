import { describe, expect, it } from "vitest";
import { getToolInfo } from "./tool-info";

describe("getToolInfo", () => {
  it("describes read calls with the file name", () => {
    expect(getToolInfo("read", { filePath: "/repo/src/app.ts" })).toEqual({
      icon: "glasses",
      title: "Read",
      subtitle: "app.ts",
    });
  });

  it("describes list calls with the full path", () => {
    expect(getToolInfo("list", { path: "/repo/src" })).toEqual({
      icon: "list",
      title: "List files",
      subtitle: "/repo/src",
    });
  });

  it("describes glob and grep calls with the pattern", () => {
    expect(getToolInfo("glob", { pattern: "**/*.ts" })).toEqual({
      icon: "search",
      title: "Find",
      subtitle: "**/*.ts",
    });
    expect(getToolInfo("grep", { pattern: "createEmitter" })).toEqual({
      icon: "search",
      title: "Search text",
      subtitle: "createEmitter",
    });
  });

  it("describes webfetch calls with the url", () => {
    expect(getToolInfo("webfetch", { url: "https://example.com" })).toEqual({
      icon: "globe",
      title: "Read web page",
      subtitle: "https://example.com",
    });
  });

  it("describes bash calls with the description", () => {
    expect(getToolInfo("bash", { description: "Run tests" })).toEqual({
      icon: "terminal",
      title: "Command",
      subtitle: "Run tests",
    });
  });

  it("describes edit and write calls with the file name", () => {
    expect(getToolInfo("edit", { filePath: "C:\\repo\\src\\app.ts" })).toEqual({
      icon: "code",
      title: "Edit",
      subtitle: "app.ts",
    });
    expect(getToolInfo("write", { filePath: "/repo/src/app.ts" })).toEqual({
      icon: "code",
      title: "Write",
      subtitle: "app.ts",
    });
  });

  it("describes patch calls with the file count", () => {
    expect(getToolInfo("apply_patch", { files: ["a.ts"] })).toEqual({
      icon: "code",
      title: "Update",
      subtitle: "1 file",
    });
    expect(getToolInfo("apply_patch", { files: ["a.ts", "b.ts"] })).toEqual({
      icon: "code",
      title: "Update",
      subtitle: "2 files",
    });
  });

  it("omits the patch subtitle without a file list", () => {
    expect(getToolInfo("apply_patch", {})).toEqual({
      icon: "code",
      title: "Update",
      subtitle: undefined,
    });
    expect(getToolInfo("apply_patch", { files: "a.ts" })).toEqual({
      icon: "code",
      title: "Update",
      subtitle: undefined,
    });
  });

  it("describes todo and question calls without subtitles", () => {
    expect(getToolInfo("todowrite")).toEqual({
      icon: "checklist",
      title: "To-dos",
    });
    expect(getToolInfo("question")).toEqual({
      icon: "message-circle",
      title: "Questions",
    });
  });

  it("describes skill calls with the skill name when present", () => {
    expect(getToolInfo("skill", { name: "review" })).toEqual({
      icon: "brain",
      title: "review",
    });
    expect(getToolInfo("skill", {})).toEqual({
      icon: "brain",
      title: "Skill",
    });
  });

  it("describes task calls with the capitalized subagent type", () => {
    expect(
      getToolInfo("task", { subagent_type: "explore", description: "find" }),
    ).toEqual({
      icon: "task",
      title: "Subtask: Explore",
      subtitle: "find",
    });
  });

  it("falls back to a generic task title without a subagent type", () => {
    expect(getToolInfo("task", { subagent_type: "" })).toEqual({
      icon: "task",
      title: "Subtask",
      subtitle: undefined,
    });
    expect(getToolInfo("task", { subagent_type: 42 })).toEqual({
      icon: "task",
      title: "Subtask",
      subtitle: undefined,
    });
  });

  it("falls back to the tool name for unknown tools", () => {
    expect(getToolInfo("mcp_connector_search")).toEqual({
      icon: "wrench",
      title: "mcp_connector_search",
    });
  });

  it("omits subtitles for empty or non-string input values", () => {
    expect(getToolInfo("read", { filePath: "" }).subtitle).toBeUndefined();
    expect(getToolInfo("bash", { description: 12 }).subtitle).toBeUndefined();
  });

  it("defaults to an empty input object", () => {
    expect(getToolInfo("read")).toEqual({
      icon: "glasses",
      title: "Read",
      subtitle: undefined,
    });
  });
});
