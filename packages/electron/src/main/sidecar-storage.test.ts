import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createSidecarStorageEnv } from "./sidecar-storage";

let root: string;
let tempPath: string;
let userDataPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kowork-sidecar-storage-"));
  tempPath = join(root, "temp");
  userDataPath = join(root, "app.kowork.desktop.dev");
  mkdirSync(tempPath, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("createSidecarStorageEnv", () => {
  test("points TMPDIR at a stable per-channel dir, not a random one", () => {
    const first = createSidecarStorageEnv(userDataPath, tempPath);
    const second = createSidecarStorageEnv(userDataPath, tempPath);

    const expected = join(tempPath, "app.kowork.desktop.dev", "sidecar");
    expect(first.TMPDIR).toBe(expected);
    expect(first.TMP).toBe(expected);
    expect(first.TEMP).toBe(expected);
    expect(second.TMPDIR).toBe(expected);
    expect(
      statSync(join(tempPath, "app.kowork.desktop.dev")).isDirectory(),
    ).toBe(true);
  });

  test.skipIf(process.platform === "win32")(
    "creates the channel temp dir readable only by the current user",
    () => {
      createSidecarStorageEnv(userDataPath, tempPath);

      const mode =
        statSync(join(tempPath, "app.kowork.desktop.dev")).mode & 0o777;
      expect(mode).toBe(0o700);
    },
  );

  test("scopes XDG dirs to the userData sidecar dir", () => {
    const env = createSidecarStorageEnv(userDataPath, tempPath);

    expect(env.XDG_CONFIG_HOME).toBe(join(userDataPath, "sidecar", "config"));
    expect(env.XDG_DATA_HOME).toBe(join(userDataPath, "sidecar", "data"));
    expect(env.XDG_CACHE_HOME).toBe(join(userDataPath, "sidecar", "cache"));
    expect(env.XDG_STATE_HOME).toBe(join(userDataPath, "sidecar", "state"));
  });

  test("falls back to a unique dir when the stable path is taken by a file", () => {
    writeFileSync(join(tempPath, "app.kowork.desktop.dev"), "squat");

    const env = createSidecarStorageEnv(userDataPath, tempPath);

    expect(basename(env.TMPDIR)).toBe("sidecar");
    expect(basename(dirname(env.TMPDIR))).toMatch(
      /^app\.kowork\.desktop\.dev-.{6}$/,
    );
    expect(env.TMPDIR).not.toBe(
      join(tempPath, "app.kowork.desktop.dev", "sidecar"),
    );
  });
});
