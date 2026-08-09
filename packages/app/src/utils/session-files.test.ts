import type {
  AssistantMessage,
  Message,
  Part,
  SnapshotFileDiff,
  ToolPart,
  UserMessage,
} from "@opencode-ai/sdk/v2/client";
import { describe, expect, it } from "vitest";
import { projectSessionFiles } from "./session-files";

const directory = "/repo";

const userMessage = (input: {
  id: string;
  created?: number;
  summary?: SnapshotFileDiff[];
}): UserMessage => ({
  id: input.id,
  sessionID: "session",
  role: "user",
  time: { created: input.created ?? 1 },
  agent: "agent",
  model: { providerID: "provider", modelID: "model" },
  summary: input.summary ? { diffs: input.summary } : undefined,
});

const assistantMessage = (input: {
  id: string;
  parentID: string;
  created?: number;
  completed?: number;
}): AssistantMessage => ({
  id: input.id,
  sessionID: "session",
  role: "assistant",
  time: { created: input.created ?? 1, completed: input.completed },
  parentID: input.parentID,
  modelID: "model",
  providerID: "provider",
  mode: "default",
  agent: "agent",
  path: { cwd: directory, root: directory },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
});

const toolPart = (input: {
  id: string;
  messageID: string;
  tool: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  end?: number;
}): ToolPart => ({
  id: input.id,
  sessionID: "session",
  messageID: input.messageID,
  type: "tool",
  callID: input.id,
  tool: input.tool,
  state: {
    status: "completed",
    input: input.input ?? {},
    output: "",
    title: "",
    metadata: input.metadata ?? {},
    time: { start: 0, end: input.end ?? 10 },
  },
});

const runningToolPart = (input: {
  id: string;
  messageID: string;
  tool: string;
  input?: Record<string, unknown>;
}): ToolPart => ({
  id: input.id,
  sessionID: "session",
  messageID: input.messageID,
  type: "tool",
  callID: input.id,
  tool: input.tool,
  state: {
    status: "running",
    input: input.input ?? {},
    time: { start: 0 },
  },
});

const patchPart = (input: {
  id: string;
  messageID: string;
  files: string[];
}): Part => ({
  id: input.id,
  sessionID: "session",
  messageID: input.messageID,
  type: "patch",
  hash: input.id,
  files: input.files,
});

const diff = (
  file: string | undefined,
  status?: SnapshotFileDiff["status"],
): SnapshotFileDiff => ({
  file,
  status,
  additions: 0,
  deletions: 0,
});

const project = (input: {
  messages: Message[];
  parts: Part[];
  revert?: Parameters<typeof projectSessionFiles>[0]["revert"];
  active?: boolean;
  dir?: string;
}) =>
  projectSessionFiles({
    messages: input.messages,
    parts: input.parts,
    directory: input.dir ?? directory,
    revert: input.revert,
    active: input.active,
  });

describe("projectSessionFiles", () => {
  it("returns nothing for a session without messages", () => {
    expect(project({ messages: [], parts: [] })).toEqual([]);
  });

  it("marks files written for the first time as added", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/new.ts" },
          metadata: { exists: false },
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/new.ts", status: "added" }]);
  });

  it("marks writes to existing files and edits as modified", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/a.ts" },
        }),
        toolPart({
          id: "p2",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/repo/src/b.ts" },
        }),
      ],
    });

    expect(files).toEqual([
      { path: "src/a.ts", status: "modified" },
      { path: "src/b.ts", status: "modified" },
    ]);
  });

  it("ignores tool calls that have not completed", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        runningToolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/a.ts" },
        }),
      ],
    });

    expect(files).toEqual([]);
  });

  it("ignores tool calls without a file path", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({ id: "p1", messageID: "m2", tool: "write", input: {} }),
        toolPart({
          id: "p2",
          messageID: "m2",
          tool: "edit",
          input: { filePath: 42 },
        }),
        toolPart({
          id: "p3",
          messageID: "m2",
          tool: "bash",
          input: { command: "ls" },
        }),
      ],
    });

    expect(files).toEqual([]);
  });

  it("maps patch operations to file statuses", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "apply_patch",
          metadata: {
            files: [
              { type: "add", filePath: "/repo/added.ts" },
              { type: "delete", filePath: "/repo/deleted.ts" },
              { type: "update", filePath: "/repo/updated.ts" },
              { relativePath: "/repo/fallback.ts" },
            ],
          },
        }),
      ],
    });

    expect(files).toEqual([
      { path: "added.ts", status: "added" },
      { path: "deleted.ts", status: "deleted" },
      { path: "fallback.ts", status: "modified" },
      { path: "updated.ts", status: "modified" },
    ]);
  });

  it("expands patch moves into a deletion and an addition", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "apply_patch",
          metadata: {
            files: [
              { type: "move", filePath: "/repo/old.ts", movePath: "new.ts" },
            ],
          },
        }),
      ],
    });

    expect(files).toEqual([
      { path: "new.ts", status: "added" },
      { path: "old.ts", status: "deleted" },
    ]);
  });

  it("skips malformed patch entries", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "apply_patch",
          metadata: {
            files: [
              "not-an-object",
              { type: "add" },
              { type: "move", filePath: "/repo/a.ts" },
              { type: "add", filePath: "" },
            ],
          },
        }),
        toolPart({
          id: "p2",
          messageID: "m2",
          tool: "apply_patch",
          metadata: { files: "not-an-array" },
        }),
      ],
    });

    expect(files).toEqual([]);
  });

  it("drops patch files that are temporary paths", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "apply_patch",
          metadata: {
            files: [
              { type: "add", filePath: "/repo/src/real.ts" },
              { type: "add", filePath: "/repo/tmp/scratch.ts" },
            ],
            temporaryPaths: ["/repo/tmp/scratch.ts"],
          },
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/real.ts", status: "added" }]);
  });

  it("ignores temporary paths that are not a list of strings", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/a.ts" },
          metadata: { temporaryPaths: "/repo/src/a.ts" },
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/a.ts", status: "modified" }]);
  });

  it("includes presented files as modified", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "present_files",
          metadata: {
            files: [
              { path: "/repo/docs/guide.md" },
              { path: "  " },
              "not-an-object",
            ],
          },
        }),
      ],
    });

    expect(files).toEqual([{ path: "docs/guide.md", status: "modified" }]);
  });

  it("does not filter presented files against temporary paths", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "present_files",
          metadata: {
            files: [{ path: "/repo/docs/guide.md" }],
            temporaryPaths: ["/repo/docs/guide.md"],
          },
        }),
      ],
    });

    expect(files).toEqual([{ path: "docs/guide.md", status: "modified" }]);
  });

  it("does not let presentation override status evidence", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "present_files",
          metadata: { files: [{ path: "/repo/src/new.ts" }] },
        }),
        toolPart({
          id: "p2",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/new.ts" },
          metadata: { exists: false },
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/new.ts", status: "added" }]);
  });

  it("does not let snapshot patches override tool evidence", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        patchPart({ id: "p1", messageID: "m2", files: ["/repo/src/new.ts"] }),
        toolPart({
          id: "p2",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/new.ts" },
          metadata: { exists: false },
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/new.ts", status: "added" }]);
  });

  it("lists snapshot patch files as modified", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        patchPart({
          id: "p1",
          messageID: "m2",
          files: ["/repo/src/a.ts", "/repo/src/b.ts"],
        }),
      ],
    });

    expect(files).toEqual([
      { path: "src/a.ts", status: "modified" },
      { path: "src/b.ts", status: "modified" },
    ]);
  });

  it("treats the summary as authoritative for finished turns", () => {
    const files = project({
      messages: [
        userMessage({
          id: "m1",
          summary: [diff("/repo/src/b.ts", "added")],
        }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/a.ts" },
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/b.ts", status: "added" }]);
  });

  it("keeps tool evidence when a finished turn has an empty summary", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1", summary: [] }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/a.ts" },
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/a.ts", status: "modified" }]);
  });

  it("treats an empty summary as authoritative when a snapshot patch exists", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1", summary: [] }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/a.ts" },
        }),
        patchPart({ id: "p2", messageID: "m2", files: ["/repo/src/a.ts"] }),
      ],
    });

    expect(files).toEqual([]);
  });

  it("keeps presented files even when the summary replaces tool evidence", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1", summary: [diff("/repo/src/a.ts")] }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/b.ts" },
        }),
        toolPart({
          id: "p2",
          messageID: "m2",
          tool: "present_files",
          metadata: { files: [{ path: "/repo/docs/guide.md" }] },
        }),
      ],
    });

    expect(files).toEqual([
      { path: "docs/guide.md", status: "modified" },
      { path: "src/a.ts", status: "modified" },
    ]);
  });

  it("merges the summary into tool evidence while the turn is active", () => {
    const files = project({
      active: true,
      messages: [
        userMessage({
          id: "m1",
          summary: [diff("/repo/src/b.ts", "added")],
        }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/a.ts" },
        }),
      ],
    });

    expect(files).toEqual([
      { path: "src/a.ts", status: "modified" },
      { path: "src/b.ts", status: "added" },
    ]);
  });

  it("lets the summary override tool evidence on conflicts while active", () => {
    const files = project({
      active: true,
      messages: [
        userMessage({ id: "m1", summary: [diff("/repo/src/a.ts", "deleted")] }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/repo/src/a.ts" },
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/a.ts", status: "deleted" }]);
  });

  it("ignores summary entries without a file", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1", summary: [diff(undefined, "added")] }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [],
    });

    expect(files).toEqual([]);
  });

  it("lets later turns overwrite earlier turns for the same file", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1", created: 1 }),
        assistantMessage({ id: "m2", parentID: "m1", completed: 10 }),
        userMessage({ id: "m3", created: 20 }),
        assistantMessage({ id: "m4", parentID: "m3", completed: 30 }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/a.ts" },
          metadata: { exists: false },
          end: 10,
        }),
        toolPart({
          id: "p2",
          messageID: "m4",
          tool: "edit",
          input: { filePath: "/repo/src/a.ts" },
          end: 30,
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/a.ts", status: "modified" }]);
  });

  it("sorts files by change time, then by path", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/repo/src/z.ts" },
          end: 10,
        }),
        toolPart({
          id: "p2",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/repo/src/a.ts" },
          end: 10,
        }),
        toolPart({
          id: "p3",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/repo/src/m.ts" },
          end: 20,
        }),
      ],
    });

    expect(files).toEqual([
      { path: "src/m.ts", status: "modified" },
      { path: "src/a.ts", status: "modified" },
      { path: "src/z.ts", status: "modified" },
    ]);
  });

  it("preserves observation time for summary entries of tracked files", () => {
    const files = project({
      messages: [
        userMessage({
          id: "m1",
          summary: [diff("/repo/src/a.ts"), diff("/repo/src/b.ts")],
        }),
        assistantMessage({ id: "m2", parentID: "m1", completed: 30 }),
        assistantMessage({ id: "m3", parentID: "m1", completed: 99 }),
      ],
      parts: [
        patchPart({ id: "p1", messageID: "m2", files: ["/repo/src/a.ts"] }),
      ],
    });

    expect(files).toEqual([
      { path: "src/b.ts", status: "modified" },
      { path: "src/a.ts", status: "modified" },
    ]);
  });

  it("uses the assistant completion time for snapshot patches", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({
          id: "m2",
          parentID: "m1",
          created: 2,
          completed: 50,
        }),
        assistantMessage({
          id: "m3",
          parentID: "m1",
          created: 3,
          completed: 100,
        }),
      ],
      parts: [
        patchPart({ id: "p1", messageID: "m2", files: ["/repo/src/a.ts"] }),
        patchPart({ id: "p2", messageID: "m3", files: ["/repo/src/b.ts"] }),
      ],
    });

    expect(files).toEqual([
      { path: "src/b.ts", status: "modified" },
      { path: "src/a.ts", status: "modified" },
    ]);
  });

  it("drops turns at and beyond the revert boundary", () => {
    const files = project({
      revert: { messageID: "m3" },
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
        userMessage({ id: "m3" }),
        assistantMessage({ id: "m4", parentID: "m3" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "/repo/src/a.ts" },
        }),
        toolPart({
          id: "p2",
          messageID: "m4",
          tool: "write",
          input: { filePath: "/repo/src/b.ts" },
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/a.ts", status: "modified" }]);
  });

  it("applies partial reverts to parts and later assistant messages", () => {
    const files = project({
      revert: { messageID: "m2", partID: "p2" },
      messages: [
        userMessage({
          id: "m1",
          summary: [diff("/repo/src/summary.ts", "added")],
        }),
        assistantMessage({ id: "m2", parentID: "m1" }),
        assistantMessage({ id: "m3", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/repo/src/x.ts" },
        }),
        toolPart({
          id: "p2",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/repo/src/y.ts" },
        }),
        toolPart({
          id: "p3",
          messageID: "m3",
          tool: "edit",
          input: { filePath: "/repo/src/z.ts" },
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/x.ts", status: "modified" }]);
  });

  it("ignores a revert part boundary that matches no assistant message", () => {
    const files = project({
      revert: { messageID: "m9", partID: "p1" },
      messages: [
        userMessage({ id: "m1", summary: [diff("/repo/src/b.ts")] }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/repo/src/a.ts" },
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/b.ts", status: "modified" }]);
  });

  it("strips the working directory and ./ prefixes from paths", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/repo/src/a.ts" },
          end: 10,
        }),
        toolPart({
          id: "p2",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "./src/b.ts" },
          end: 20,
        }),
        toolPart({
          id: "p3",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "./" },
          end: 30,
        }),
      ],
    });

    expect(files).toEqual([
      { path: "src/b.ts", status: "modified" },
      { path: "src/a.ts", status: "modified" },
    ]);
  });

  it("keeps files outside the working directory as absolute paths", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/elsewhere/x.ts" },
        }),
      ],
    });

    expect(files).toEqual([{ path: "/elsewhere/x.ts", status: "modified" }]);
  });

  it("normalizes windows paths case-insensitively per drive letter", () => {
    const files = project({
      dir: "C:\\repo",
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "write",
          input: { filePath: "C:\\repo\\SRC\\a.ts" },
          metadata: { exists: false },
          end: 10,
        }),
        toolPart({
          id: "p2",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "c:/repo/src/a.ts" },
          end: 20,
        }),
      ],
    });

    expect(files).toEqual([{ path: "src/a.ts", status: "modified" }]);
  });

  it("treats paths as case-sensitive without a drive letter", () => {
    const files = project({
      messages: [
        userMessage({ id: "m1" }),
        assistantMessage({ id: "m2", parentID: "m1" }),
      ],
      parts: [
        toolPart({
          id: "p1",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/repo/src/A.ts" },
        }),
        toolPart({
          id: "p2",
          messageID: "m2",
          tool: "edit",
          input: { filePath: "/repo/src/a.ts" },
        }),
      ],
    });

    expect(files).toHaveLength(2);
    expect(files).toContainEqual({ path: "src/A.ts", status: "modified" });
    expect(files).toContainEqual({ path: "src/a.ts", status: "modified" });
  });
});
