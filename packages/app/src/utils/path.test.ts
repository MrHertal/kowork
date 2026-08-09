import { describe, expect, it } from "vitest";
import {
  abbreviateHomePath,
  absolutizePath,
  getDirectory,
  getFileExtension,
  getFilename,
  getFilenameTruncated,
  relativizePath,
  truncateMiddle,
} from "./path";

describe("getFilename", () => {
  it("returns the last segment of posix and windows paths", () => {
    expect(getFilename("src/app.ts")).toBe("app.ts");
    expect(getFilename("C:\\Users\\foo\\bar.txt")).toBe("bar.txt");
  });

  it("trims trailing separators", () => {
    expect(getFilename("src/utils/")).toBe("utils");
    expect(getFilename("C:\\Users\\foo\\")).toBe("foo");
  });

  it("returns empty for missing paths", () => {
    expect(getFilename(undefined)).toBe("");
    expect(getFilename("")).toBe("");
  });
});

describe("getDirectory", () => {
  it("returns the parent path with a trailing slash", () => {
    expect(getDirectory("src/app.ts")).toBe("src/");
    expect(getDirectory("C:\\Users\\foo\\bar.txt")).toBe("C:/Users/foo/");
  });

  it("trims trailing separators before resolving the parent", () => {
    expect(getDirectory("src/utils/")).toBe("src/");
  });

  it("returns empty for missing paths", () => {
    expect(getDirectory(undefined)).toBe("");
  });
});

describe("getFileExtension", () => {
  it("returns the extension after the last dot", () => {
    expect(getFileExtension("app.ts")).toBe("ts");
    expect(getFileExtension("archive.tar.gz")).toBe("gz");
  });

  it("returns empty for missing paths", () => {
    expect(getFileExtension(undefined)).toBe("");
  });
});

describe("getFilenameTruncated", () => {
  it("keeps short filenames intact", () => {
    expect(getFilenameTruncated("app.ts")).toBe("app.ts");
  });

  it("preserves the extension when truncating", () => {
    expect(getFilenameTruncated("a-very-long-filename-indeed.ts", 20)).toBe(
      "a-very-long-file….ts",
    );
  });

  it("truncates extensionless filenames with an ellipsis", () => {
    expect(getFilenameTruncated("a-very-long-filename-indeed", 20)).toBe(
      "a-very-long-filenam…",
    );
  });

  it("falls back to a hard cut when the extension does not fit", () => {
    expect(getFilenameTruncated("file.verylongextension", 10)).toBe(
      "file.very…",
    );
  });
});

describe("relativizePath", () => {
  it("strips the directory prefix from child paths", () => {
    expect(relativizePath("/repo/src/app.ts", "/repo")).toBe("/src/app.ts");
    expect(relativizePath("C:\\repo\\src\\app.ts", "C:\\repo")).toBe(
      "\\src\\app.ts",
    );
  });

  it("returns the path unchanged outside the directory", () => {
    expect(relativizePath("/other/app.ts", "/repo")).toBe("/other/app.ts");
  });

  it("returns empty when path equals the directory", () => {
    expect(relativizePath("/repo", "/repo")).toBe("");
  });

  it("ignores root and missing directories", () => {
    expect(relativizePath("/repo/src", "/")).toBe("/repo/src");
    expect(relativizePath("/repo/src", "\\")).toBe("/repo/src");
    expect(relativizePath("/repo/src", undefined)).toBe("/repo/src");
    expect(relativizePath("", "/repo")).toBe("");
  });
});

describe("abbreviateHomePath", () => {
  it("replaces the home directory with a tilde", () => {
    expect(abbreviateHomePath("/home/user/repo", "/home/user")).toBe("~/repo");
    expect(abbreviateHomePath("/home/user", "/home/user")).toBe("~");
  });

  it("leaves paths outside home unchanged", () => {
    expect(abbreviateHomePath("/var/log", "/home/user")).toBe("/var/log");
    expect(abbreviateHomePath("/home/userx/repo", "/home/user")).toBe(
      "/home/userx/repo",
    );
  });

  it("matches windows home paths case-insensitively", () => {
    expect(abbreviateHomePath("C:\\Users\\Foo\\repo", "c:\\Users\\foo")).toBe(
      "~/repo",
    );
  });

  it("tolerates trailing separators on the home path", () => {
    expect(abbreviateHomePath("/home/user/repo", "/home/user/")).toBe("~/repo");
  });
});

describe("absolutizePath", () => {
  it("passes absolute paths through normalized", () => {
    expect(absolutizePath("/x/y", "/repo")).toBe("/x/y");
    expect(absolutizePath("C:\\x\\y", "/repo")).toBe("C:/x/y");
  });

  it("joins relative paths onto the directory", () => {
    expect(absolutizePath("src/app.ts", "/repo")).toBe("/repo/src/app.ts");
    expect(absolutizePath("src\\app.ts", "C:\\repo")).toBe(
      "C:/repo/src/app.ts",
    );
  });

  it("returns the path when either side is empty", () => {
    expect(absolutizePath("", "/repo")).toBe("");
    expect(absolutizePath("src/app.ts", "")).toBe("src/app.ts");
  });
});

describe("truncateMiddle", () => {
  it("keeps short text intact", () => {
    expect(truncateMiddle("short", 20)).toBe("short");
  });

  it("truncates long text around a middle ellipsis", () => {
    expect(truncateMiddle("abcdefghijklmnopqrst", 10)).toBe("abcde…qrst");
  });
});
