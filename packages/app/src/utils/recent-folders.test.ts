import { describe, expect, it } from "vitest";
import { getRecentFolders } from "./recent-folders";

const project = (worktree: string) => ({ worktree });

const session = (input: {
  directory: string;
  created: number;
  updated?: number;
  archived?: number;
}) => ({
  directory: input.directory,
  time: {
    created: input.created,
    updated: input.updated,
    archived: input.archived,
  },
});

describe("getRecentFolders", () => {
  it("orders projects by most recent session activity", () => {
    const folders = getRecentFolders(
      [project("/a"), project("/b"), project("/c")],
      [
        session({ directory: "/a", created: 10 }),
        session({ directory: "/c", created: 30 }),
        session({ directory: "/b", created: 20 }),
      ],
    );

    expect(folders).toEqual(["/c", "/b", "/a"]);
  });

  it("prefers the updated timestamp over created", () => {
    const folders = getRecentFolders(
      [project("/a"), project("/b")],
      [
        session({ directory: "/a", created: 100 }),
        session({ directory: "/b", created: 1, updated: 200 }),
      ],
    );

    expect(folders).toEqual(["/b", "/a"]);
  });

  it("uses the latest session when a project has several", () => {
    const folders = getRecentFolders(
      [project("/a"), project("/b")],
      [
        session({ directory: "/a", created: 5 }),
        session({ directory: "/a", created: 50 }),
        session({ directory: "/b", created: 20 }),
      ],
    );

    expect(folders).toEqual(["/a", "/b"]);
  });

  it("ignores archived sessions", () => {
    const folders = getRecentFolders(
      [project("/a"), project("/b")],
      [
        session({ directory: "/a", created: 100, archived: 1 }),
        session({ directory: "/b", created: 1 }),
      ],
    );

    expect(folders).toEqual(["/b", "/a"]);
  });

  it("keeps the original project order when neither has activity", () => {
    const folders = getRecentFolders(
      [project("/a"), project("/b"), project("/c")],
      [],
    );

    expect(folders).toEqual(["/a", "/b", "/c"]);
  });

  it("ranks projects with activity above projects without", () => {
    const folders = getRecentFolders(
      [project("/a"), project("/b")],
      [session({ directory: "/b", created: 1 })],
    );

    expect(folders).toEqual(["/b", "/a"]);
  });

  it("ignores sessions in directories that are not projects", () => {
    const folders = getRecentFolders(
      [project("/a")],
      [session({ directory: "/elsewhere", created: 100 })],
    );

    expect(folders).toEqual(["/a"]);
  });

  it("limits the result to five folders by default", () => {
    const folders = getRecentFolders(
      [1, 2, 3, 4, 5, 6, 7].map((n) => project(`/p${n}`)),
      [session({ directory: "/p7", created: 1 })],
    );

    expect(folders).toEqual(["/p7", "/p1", "/p2", "/p3", "/p4"]);
  });

  it("respects a custom limit", () => {
    const folders = getRecentFolders(
      [project("/a"), project("/b"), project("/c")],
      [
        session({ directory: "/a", created: 1 }),
        session({ directory: "/b", created: 2 }),
      ],
      1,
    );

    expect(folders).toEqual(["/b"]);
  });
});
