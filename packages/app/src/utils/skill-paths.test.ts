import { describe, expect, it } from "vitest";
import {
  bundledSkillId,
  countSkillsInPath,
  findOwningPath,
  isSkillInPath,
} from "./skill-paths";

const skill = (location: string) => ({ location });

describe("findOwningPath", () => {
  it("returns the path entry that contains the skill", () => {
    const owner = findOwningPath(skill("/skills/alpha/SKILL.md"), [
      "/other",
      "/skills",
    ]);

    expect(owner).toBe("/skills");
  });

  it("returns the original entry rather than the normalized form", () => {
    const owner = findOwningPath(skill("c:/tools/alpha/SKILL.md"), [
      "C:\\tools",
    ]);

    expect(owner).toBe("C:\\tools");
  });

  it("ignores relative path entries", () => {
    const owner = findOwningPath(skill("/skills/alpha/SKILL.md"), [
      "skills",
      "./skills",
    ]);

    expect(owner).toBeNull();
  });

  it("returns null when no path contains the skill", () => {
    expect(
      findOwningPath(skill("/elsewhere/alpha/SKILL.md"), ["/skills"]),
    ).toBeNull();
  });

  it("does not match a sibling directory with a shared prefix", () => {
    expect(
      findOwningPath(skill("/skills-extra/alpha/SKILL.md"), ["/skills"]),
    ).toBeNull();
  });

  it("does not match a skill located exactly at the path root", () => {
    expect(findOwningPath(skill("/skills"), ["/skills"])).toBeNull();
  });

  it("prefers the first matching entry", () => {
    const owner = findOwningPath(skill("/a/b/alpha/SKILL.md"), ["/a", "/a/b"]);

    expect(owner).toBe("/a");
  });

  it("matches windows locations regardless of slash and drive casing", () => {
    const owner = findOwningPath(skill("C:\\tools\\alpha\\SKILL.md"), [
      "c:/tools",
    ]);

    expect(owner).toBe("c:/tools");
  });
});

describe("isSkillInPath", () => {
  it("matches skills below the path", () => {
    expect(isSkillInPath(skill("/skills/alpha/SKILL.md"), "/skills")).toBe(
      true,
    );
    expect(isSkillInPath(skill("/other/alpha/SKILL.md"), "/skills")).toBe(
      false,
    );
  });

  it("tolerates a trailing slash on the path", () => {
    expect(isSkillInPath(skill("/skills/alpha/SKILL.md"), "/skills/")).toBe(
      true,
    );
  });

  it("normalizes windows separators and drive casing", () => {
    expect(isSkillInPath(skill("C:\\tools\\alpha\\SKILL.md"), "c:/tools")).toBe(
      true,
    );
  });

  it("does not treat non-drive paths as case-insensitive", () => {
    expect(isSkillInPath(skill("/Skills/alpha/SKILL.md"), "/skills")).toBe(
      false,
    );
  });
});

describe("countSkillsInPath", () => {
  it("counts only skills below the path", () => {
    const count = countSkillsInPath(
      [
        skill("/skills/alpha/SKILL.md"),
        skill("/skills/beta/SKILL.md"),
        skill("/other/gamma/SKILL.md"),
      ],
      "/skills",
    );

    expect(count).toBe(2);
  });

  it("returns zero for an empty list", () => {
    expect(countSkillsInPath([], "/skills")).toBe(0);
  });
});

describe("bundledSkillId", () => {
  it("returns the first segment below the managed directory", () => {
    expect(bundledSkillId(skill("/managed/abc123/SKILL.md"), "/managed")).toBe(
      "abc123",
    );
  });

  it("returns null for skills outside the managed directory", () => {
    expect(
      bundledSkillId(skill("/user/alpha/SKILL.md"), "/managed"),
    ).toBeNull();
  });

  it("returns null when the location is the managed directory itself", () => {
    expect(bundledSkillId(skill("/managed/"), "/managed")).toBeNull();
  });

  it("normalizes windows separators and drive casing", () => {
    expect(
      bundledSkillId(skill("C:\\managed\\abc123\\SKILL.md"), "c:/managed"),
    ).toBe("abc123");
  });
});
