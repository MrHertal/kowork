import { describe, expect, it } from "vitest";

import type { RuntimePack } from "./runtime-pack";
import { createRuntimeSidecarEnv } from "./runtime-env";

const runtime: RuntimePack = {
  dir: "/runtime",
  pythonExe: "/runtime/python/bin/python3",
  binDir: "/runtime/bin",
  nodeModules: "/runtime/node_modules",
};

describe("createRuntimeSidecarEnv", () => {
  it("adds the runtime launchers without mutating the source environment", () => {
    const source = { PATH: "/usr/bin", DEBUG: "1" };
    const result = createRuntimeSidecarEnv({
      env: source,
      runtime,
      electronExecutable: "/electron",
      platform: "darwin",
    });

    expect(result).toMatchObject({
      PATH: "/runtime/bin:/usr/bin",
      KOWORK_ELECTRON_BIN: "/electron",
    });
    expect(result.DEBUG).toBeUndefined();
    expect(source).toEqual({ PATH: "/usr/bin", DEBUG: "1" });
  });

  it("uses Windows path casing and delimiter", () => {
    const result = createRuntimeSidecarEnv({
      env: { Path: "C:\\Windows" },
      runtime,
      electronExecutable: "C:\\Electron\\electron.exe",
      platform: "win32",
    });

    expect(result.Path).toBe("/runtime/bin;C:\\Windows");
    expect(result.PATH).toBeUndefined();
  });

  it("removes Linux preload variables even when no runtime is available", () => {
    const result = createRuntimeSidecarEnv({
      env: { PATH: "/usr/bin", DEBUG: "1", LD_PRELOAD: "/foreign.so" },
      runtime: null,
      electronExecutable: "/electron",
      platform: "linux",
    });

    expect(result).toEqual({ PATH: "/usr/bin" });
  });
});
