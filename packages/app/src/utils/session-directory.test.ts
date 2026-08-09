import { describe, expect, it } from "vitest";
import {
  getSessionDirectoryMode,
  SESSION_DIRECTORY_MODE_METADATA_KEY,
} from "./session-directory";

describe("getSessionDirectoryMode", () => {
  it("returns the mode stored in session metadata", () => {
    expect(
      getSessionDirectoryMode({
        directory: "/other",
        metadata: { [SESSION_DIRECTORY_MODE_METADATA_KEY]: "default" },
      }),
    ).toBe("default");
    expect(
      getSessionDirectoryMode({
        directory: "/repo",
        metadata: { [SESSION_DIRECTORY_MODE_METADATA_KEY]: "attached" },
      }),
    ).toBe("attached");
  });

  it("prefers metadata over the directory comparison", () => {
    expect(
      getSessionDirectoryMode(
        {
          directory: "/repo",
          metadata: { [SESSION_DIRECTORY_MODE_METADATA_KEY]: "attached" },
        },
        "/repo",
      ),
    ).toBe("attached");
  });

  it("falls back to comparing against the default directory", () => {
    expect(getSessionDirectoryMode({ directory: "/repo" }, "/repo")).toBe(
      "default",
    );
    expect(getSessionDirectoryMode({ directory: "/other" }, "/repo")).toBe(
      "attached",
    );
  });

  it("ignores unrecognized metadata values", () => {
    expect(
      getSessionDirectoryMode(
        {
          directory: "/repo",
          metadata: { [SESSION_DIRECTORY_MODE_METADATA_KEY]: "bogus" },
        },
        "/repo",
      ),
    ).toBe("default");
  });

  it("treats sessions as attached without a default directory", () => {
    expect(getSessionDirectoryMode({ directory: "/repo" })).toBe("attached");
  });

  it("tolerates missing metadata", () => {
    expect(
      getSessionDirectoryMode({ directory: "/other", metadata: {} }, "/repo"),
    ).toBe("attached");
  });
});
