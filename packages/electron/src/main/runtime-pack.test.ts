import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  assertRuntimePack,
  computeRuntimeSourceFingerprint,
  formatRuntimeValidationIssues,
  RUNTIME_SCHEMA_VERSION,
  validateRuntimePack,
  type RuntimeValidationIssueCode,
} from "./runtime-pack";

const dirs: string[] = [];

const tmpdirPath = () => {
  const dir = mkdtempSync(join(tmpdir(), "kowork-runtime-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const FINGERPRINT = `sha256:${"0".repeat(64)}`;

const manifest = (overrides: Record<string, unknown> = {}) => ({
  runtime: "office",
  schemaVersion: RUNTIME_SCHEMA_VERSION,
  platform: "darwin",
  arch: "arm64",
  sourceFingerprint: FINGERPRINT,
  paths: {
    pythonExe: "python/bin/python3",
    binDir: "bin",
    nodeModules: "node_modules",
  },
  ...overrides,
});

const writeExecutable = (file: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "#!/bin/sh\n");
  chmodSync(file, 0o755);
};

const createPack = (
  options: {
    manifest?: unknown;
    rawManifest?: string;
    executables?: boolean;
    nodeModules?: boolean;
    suffix?: string;
  } = {},
) => {
  const dir = tmpdirPath();
  if (options.rawManifest !== undefined || options.manifest !== undefined) {
    writeFileSync(
      join(dir, "MANIFEST.json"),
      options.rawManifest ?? JSON.stringify(options.manifest),
    );
  }
  const suffix = options.suffix ?? "";
  if (options.executables !== false) {
    writeExecutable(join(dir, "python", "bin", "python3"));
    writeExecutable(join(dir, "bin", `kowork-python${suffix}`));
    writeExecutable(join(dir, "bin", `kowork-node${suffix}`));
  }
  if (options.nodeModules !== false) {
    mkdirSync(join(dir, "node_modules"), { recursive: true });
  }
  return dir;
};

const issueCodes = (options: {
  dir: string;
  platform?: NodeJS.Platform;
  arch?: string;
  sourceFingerprint?: string;
}): RuntimeValidationIssueCode[] => {
  const result = validateRuntimePack({
    platform: "darwin",
    arch: "arm64",
    ...options,
  });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected validation to fail");
  return result.issues.map((issue) => issue.code);
};

describe("computeRuntimeSourceFingerprint", () => {
  const createSourceTree = () => {
    const dir = tmpdirPath();
    const files = {
      "scripts/build-runtime.ts": "build",
      "scripts/runtime/requirements.lock": "lock",
      "scripts/runtime/package.json": "{}",
      "scripts/runtime/package-lock.json": "{}",
    };
    for (const [relative, content] of Object.entries(files)) {
      const file = join(dir, relative);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    return dir;
  };

  test("returns a stable sha256 fingerprint", () => {
    const dir = createSourceTree();

    const first = computeRuntimeSourceFingerprint(dir);

    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(computeRuntimeSourceFingerprint(dir)).toBe(first);
  });

  test("changes when a source input changes", () => {
    const dir = createSourceTree();
    const before = computeRuntimeSourceFingerprint(dir);

    writeFileSync(join(dir, "scripts/runtime/requirements.lock"), "changed");

    expect(computeRuntimeSourceFingerprint(dir)).not.toBe(before);
  });
});

describe("validateRuntimePack", () => {
  test("accepts a valid pack and resolves its paths", () => {
    const dir = createPack({ manifest: manifest() });

    const result = validateRuntimePack({
      dir,
      platform: "darwin",
      arch: "arm64",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack).toEqual({
      dir,
      pythonExe: join(dir, "python", "bin", "python3"),
      binDir: join(dir, "bin"),
      nodeModules: join(dir, "node_modules"),
    });
    expect(result.manifest.runtime).toBe("office");
  });

  test("accepts a valid windows pack with .cmd launchers", () => {
    const dir = createPack({
      manifest: manifest({ platform: "win32" }),
      suffix: ".cmd",
    });

    const result = validateRuntimePack({
      dir,
      platform: "win32",
      arch: "arm64",
    });

    expect(result.ok).toBe(true);
  });

  test("rejects a missing runtime directory", () => {
    expect(issueCodes({ dir: join(tmpdirPath(), "does-not-exist") })).toEqual([
      "missing-runtime",
    ]);
  });

  test("rejects a pack without a manifest", () => {
    expect(issueCodes({ dir: createPack() })).toEqual(["missing-manifest"]);
  });

  test("rejects a manifest that is not valid JSON", () => {
    expect(issueCodes({ dir: createPack({ rawManifest: "{ nope" }) })).toEqual([
      "invalid-manifest",
    ]);
  });

  test("rejects a manifest that is not an object", () => {
    expect(issueCodes({ dir: createPack({ rawManifest: "[]" }) })).toEqual([
      "invalid-manifest",
    ]);
  });

  test("rejects an unsupported schema version", () => {
    expect(
      issueCodes({
        dir: createPack({ manifest: manifest({ schemaVersion: 1 }) }),
      }),
    ).toEqual(["unsupported-schema"]);
  });

  test("rejects a wrong runtime identity", () => {
    expect(
      issueCodes({
        dir: createPack({ manifest: manifest({ runtime: "other" }) }),
      }),
    ).toEqual(["invalid-manifest"]);
  });

  test("reports platform and architecture mismatches together", () => {
    expect(
      issueCodes({
        dir: createPack({ manifest: manifest() }),
        platform: "linux",
        arch: "x64",
      }),
    ).toEqual(["platform-mismatch", "architecture-mismatch"]);
  });

  test("rejects a malformed source fingerprint", () => {
    expect(
      issueCodes({
        dir: createPack({ manifest: manifest({ sourceFingerprint: "nope" }) }),
      }),
    ).toEqual(["invalid-manifest"]);
  });

  test("rejects a fingerprint mismatch against current sources", () => {
    expect(
      issueCodes({
        dir: createPack({ manifest: manifest() }),
        sourceFingerprint: `sha256:${"1".repeat(64)}`,
      }),
    ).toEqual(["fingerprint-mismatch"]);
  });

  test("rejects a manifest without paths, one issue per unresolved path", () => {
    expect(
      issueCodes({
        dir: createPack({ manifest: manifest({ paths: undefined }) }),
      }),
    ).toEqual([
      "invalid-manifest",
      "invalid-manifest",
      "invalid-manifest",
      "invalid-manifest",
    ]);
  });

  test("rejects paths that escape the pack", () => {
    expect(
      issueCodes({
        dir: createPack({
          manifest: manifest({
            paths: {
              pythonExe: "../outside/python3",
              binDir: "bin",
              nodeModules: "node_modules",
            },
          }),
        }),
      }),
    ).toEqual(["unsafe-path"]);
  });

  test("rejects absolute paths in the manifest", () => {
    expect(
      issueCodes({
        dir: createPack({
          manifest: manifest({
            paths: {
              pythonExe: "/usr/bin/python3",
              binDir: "bin",
              nodeModules: "node_modules",
            },
          }),
        }),
      }),
    ).toEqual(["unsafe-path"]);
  });

  test("rejects a pack whose python executable is missing", () => {
    const dir = createPack({ manifest: manifest(), executables: false });
    writeExecutable(join(dir, "bin", "kowork-python"));
    writeExecutable(join(dir, "bin", "kowork-node"));

    expect(issueCodes({ dir })).toEqual(["missing-python"]);
  });

  test("rejects a pack whose launcher directory is missing", () => {
    const dir = createPack({ manifest: manifest(), executables: false });
    writeExecutable(join(dir, "python", "bin", "python3"));

    expect(issueCodes({ dir })).toEqual(["missing-launcher"]);
  });

  test("rejects a pack whose launcher files are missing", () => {
    const dir = createPack({ manifest: manifest(), executables: false });
    writeExecutable(join(dir, "python", "bin", "python3"));
    mkdirSync(join(dir, "bin"));

    expect(issueCodes({ dir })).toEqual([
      "missing-launcher",
      "missing-launcher",
    ]);
  });

  test("rejects a pack whose node_modules directory is missing", () => {
    const dir = createPack({ manifest: manifest(), nodeModules: false });

    expect(issueCodes({ dir })).toEqual(["missing-node-libraries"]);
  });

  test("rejects a python path that is not executable", () => {
    const dir = createPack({ manifest: manifest(), executables: false });
    writeExecutable(join(dir, "bin", "kowork-python"));
    writeExecutable(join(dir, "bin", "kowork-node"));
    const python = join(dir, "python", "bin", "python3");
    mkdirSync(dirname(python), { recursive: true });
    writeFileSync(python, "#!/bin/sh\n");
    chmodSync(python, 0o644);

    expect(issueCodes({ dir })).toEqual(["missing-python"]);
  });
});

describe("assertRuntimePack", () => {
  test("returns the pack when valid", () => {
    const dir = createPack({ manifest: manifest() });

    const pack = assertRuntimePack({ dir, platform: "darwin", arch: "arm64" });

    expect(pack.dir).toBe(dir);
  });

  test("throws the formatted issues when invalid", () => {
    const dir = createPack();

    expect(() =>
      assertRuntimePack({ dir, platform: "darwin", arch: "arm64" }),
    ).toThrow(/Office runtime pack is invalid:\n- Runtime manifest is missing/);
  });
});

describe("formatRuntimeValidationIssues", () => {
  test("lists each issue message", () => {
    expect(
      formatRuntimeValidationIssues([
        { code: "missing-runtime", message: "first" },
        { code: "unsafe-path", message: "second" },
      ]),
    ).toBe("Office runtime pack is invalid:\n- first\n- second");
  });
});
