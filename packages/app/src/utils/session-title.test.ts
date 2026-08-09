import { describe, expect, it } from "vitest";
import { sessionTitle } from "./session-title";

describe("sessionTitle", () => {
  it("returns missing titles unchanged", () => {
    expect(sessionTitle(undefined)).toBeUndefined();
    expect(sessionTitle("")).toBe("");
  });

  it("localizes default new-session titles", () => {
    expect(sessionTitle("New session - 2026-01-02T03:04:05.006Z")).toBe(
      "New task",
    );
  });

  it("localizes default child-session titles", () => {
    expect(sessionTitle("Child session - 2026-01-02T03:04:05.006Z")).toBe(
      "Subtask",
    );
  });

  it("keeps custom titles unchanged", () => {
    expect(sessionTitle("Fix the login bug")).toBe("Fix the login bug");
  });

  it("keeps near-miss default titles unchanged", () => {
    expect(sessionTitle("New session - 2026-01-02T03:04:05Z")).toBe(
      "New session - 2026-01-02T03:04:05Z",
    );
    expect(sessionTitle("New session - 2026-01-02")).toBe(
      "New session - 2026-01-02",
    );
  });
});
