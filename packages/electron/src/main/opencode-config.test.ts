import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  ensureSkillDenied,
  ensureSkillsPath,
  readConfig,
  registerBuiltinSkillsPath,
} from "./opencode-config";

let userData: string;

vi.mock("electron", () => ({
  app: { getPath: () => userData },
}));

const configFile = () =>
  join(userData, "sidecar", "config", "opencode", "opencode.jsonc");

const readRaw = () => readFileSync(configFile(), "utf8");

const writeRaw = (value: string) => {
  mkdirSync(dirname(configFile()), { recursive: true });
  writeFileSync(configFile(), value);
};

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), "kowork-config-"));
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe("opencode-config", () => {
  test("patching a missing file creates it with the value", async () => {
    await ensureSkillsPath("/skills/demo");

    expect(await readConfig()).toEqual({ skills: { paths: ["/skills/demo"] } });
  });

  test("patching preserves JSONC comments", async () => {
    writeRaw(`{
  // keep me
  "permission": "ask"
}
`);

    await ensureSkillDenied("demo");

    expect(readRaw()).toContain("// keep me");
    expect(await readConfig()).toEqual({
      permission: { "*": "ask", skill: { demo: "deny" } },
    });
  });

  describe("ensureSkillDenied", () => {
    test("writes a skill-scoped deny into an empty config", async () => {
      await ensureSkillDenied("demo");

      expect(await readConfig()).toEqual({
        permission: { skill: { demo: "deny" } },
      });
    });

    test("does nothing when permissions are globally denied", async () => {
      writeRaw(`{ "permission": "deny" }\n`);

      await ensureSkillDenied("demo");

      expect(readRaw()).toBe(`{ "permission": "deny" }\n`);
    });

    test("does nothing when the skill is already denied last", async () => {
      writeRaw(`{ "permission": { "skill": { "demo": "deny" } } }\n`);

      await ensureSkillDenied("demo");

      expect(readRaw()).toBe(
        `{ "permission": { "skill": { "demo": "deny" } } }\n`,
      );
    });

    test("expands a skill action into a per-skill deny", async () => {
      writeRaw(`{ "permission": { "skill": "allow" } }\n`);

      await ensureSkillDenied("demo");

      expect(await readConfig()).toEqual({
        permission: { skill: { "*": "allow", demo: "deny" } },
      });
    });

    test("keeps sibling permission rules when adding the skill key", async () => {
      writeRaw(`{ "permission": { "edit": "ask" } }\n`);

      await ensureSkillDenied("demo");

      expect(await readConfig()).toEqual({
        permission: { edit: "ask", skill: { demo: "deny" } },
      });
    });

    test("moves an existing entry last so the deny wins", async () => {
      writeRaw(
        `{ "permission": { "skill": { "demo": "allow", "other": "ask" } } }\n`,
      );

      await ensureSkillDenied("demo");

      const next = (await readConfig()) as {
        permission: { skill: Record<string, string> };
      };
      expect(next.permission.skill).toEqual({ other: "ask", demo: "deny" });
      expect(Object.keys(next.permission.skill)).toEqual(["other", "demo"]);
    });

    test("rejects an invalid permission value", async () => {
      writeRaw(`{ "permission": 42 }\n`);

      await expect(ensureSkillDenied("demo")).rejects.toThrow(
        "invalid permission configuration",
      );
    });

    test("rejects an invalid skill permission value", async () => {
      writeRaw(`{ "permission": { "skill": 42 } }\n`);

      await expect(ensureSkillDenied("demo")).rejects.toThrow(
        "invalid skill permission configuration",
      );
    });
  });

  describe("ensureSkillsPath", () => {
    test("appends to existing paths", async () => {
      writeRaw(`{ "skills": { "paths": ["/skills/a"] } }\n`);

      await ensureSkillsPath("/skills/b");

      expect(await readConfig()).toEqual({
        skills: { paths: ["/skills/a", "/skills/b"] },
      });
    });

    test("does nothing when the path is already registered", async () => {
      writeRaw(`{ "skills": { "paths": ["/skills/a"] } }\n`);

      await ensureSkillsPath("/skills/a");

      expect(readRaw()).toBe(`{ "skills": { "paths": ["/skills/a"] } }\n`);
    });

    test("drops non-string entries", async () => {
      writeRaw(`{ "skills": { "paths": ["/skills/a", 1] } }\n`);

      await ensureSkillsPath("/skills/b");

      expect(await readConfig()).toEqual({
        skills: { paths: ["/skills/a", "/skills/b"] },
      });
    });
  });

  describe("registerBuiltinSkillsPath", () => {
    test("adds the builtin path when missing", async () => {
      await registerBuiltinSkillsPath("/app/resources/skills-builtin");

      expect(await readConfig()).toEqual({
        skills: { paths: ["/app/resources/skills-builtin"] },
      });
    });

    test("replaces a stale path with the same basename", async () => {
      writeRaw(
        `{ "skills": { "paths": ["/old/app/skills-builtin", "/user/custom"] } }\n`,
      );

      await registerBuiltinSkillsPath("/new/app/skills-builtin");

      expect(await readConfig()).toEqual({
        skills: { paths: ["/user/custom", "/new/app/skills-builtin"] },
      });
    });

    test("does nothing when the current path is registered and no stale path remains", async () => {
      writeRaw(
        `{ "skills": { "paths": ["/user/custom", "/app/skills-builtin"] } }\n`,
      );

      await registerBuiltinSkillsPath("/app/skills-builtin");

      expect(readRaw()).toBe(
        `{ "skills": { "paths": ["/user/custom", "/app/skills-builtin"] } }\n`,
      );
    });
  });
});
