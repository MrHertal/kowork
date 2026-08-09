import { describe, expect, it } from "vitest";
import { classifyActivityPart } from "./activity-classification";

describe("classifyActivityPart", () => {
  it("classifies reasoning parts as thinking", () => {
    expect(classifyActivityPart({ type: "reasoning" })).toBe("thinking");
  });

  it("ignores non-tool parts that are not reasoning", () => {
    expect(classifyActivityPart({ type: "text" })).toBeUndefined();
    expect(classifyActivityPart({ type: "patch" })).toBeUndefined();
    expect(classifyActivityPart({ type: "step-start" })).toBeUndefined();
  });

  it("ignores interactive tool parts", () => {
    for (const tool of ["question", "task", "todowrite", "present_files"]) {
      expect(classifyActivityPart({ type: "tool", tool })).toBeUndefined();
    }
  });

  it("classifies context-gathering tools", () => {
    for (const tool of ["read", "list", "glob", "grep", "webfetch"]) {
      expect(classifyActivityPart({ type: "tool", tool })).toBe("context");
    }
  });

  it("classifies file-modifying tools", () => {
    for (const tool of ["edit", "write", "apply_patch"]) {
      expect(classifyActivityPart({ type: "tool", tool })).toBe("modification");
    }
  });

  it("classifies shell commands", () => {
    expect(classifyActivityPart({ type: "tool", tool: "bash" })).toBe(
      "command",
    );
  });

  it("classifies skill invocations", () => {
    expect(classifyActivityPart({ type: "tool", tool: "skill" })).toBe("skill");
  });

  it("classifies unknown tools as other", () => {
    expect(classifyActivityPart({ type: "tool", tool: "mcp_search" })).toBe(
      "other",
    );
  });

  it("classifies tool parts without a tool name as other", () => {
    expect(classifyActivityPart({ type: "tool" })).toBe("other");
  });
});
