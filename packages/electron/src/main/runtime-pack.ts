import { createHash } from "node:crypto";
import { accessSync, constants, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const RUNTIME_SCHEMA_VERSION = 2;

const RUNTIME_SOURCE_INPUTS = [
  "scripts/build-runtime.ts",
  "scripts/runtime/requirements.lock",
  "scripts/runtime/package.json",
  "scripts/runtime/package-lock.json",
] as const;

export type RuntimePack = {
  dir: string;
  pythonExe: string;
  /** Dir containing the interpreter (python/bin; python on Windows). */
  pythonBinDir: string;
  /** Pack bin/ with the node + npm shims. */
  binDir: string;
  /** Resolved by the agent via NODE_PATH. */
  nodeModules: string;
};

export type RuntimeManifest = {
  runtime: "office";
  schemaVersion: number;
  platform: NodeJS.Platform;
  arch: string;
  sourceFingerprint: string;
  paths: {
    pythonExe: string;
    binDir: string;
    nodeModules: string;
  };
};

export type RuntimeValidationIssueCode =
  | "missing-runtime"
  | "missing-manifest"
  | "invalid-manifest"
  | "unsupported-schema"
  | "platform-mismatch"
  | "architecture-mismatch"
  | "fingerprint-mismatch"
  | "unsafe-path"
  | "missing-python"
  | "missing-launcher"
  | "missing-node-libraries";

export type RuntimeValidationIssue = {
  code: RuntimeValidationIssueCode;
  message: string;
};

export type RuntimeValidationResult =
  | { ok: true; pack: RuntimePack; manifest: RuntimeManifest }
  | { ok: false; issues: RuntimeValidationIssue[] };

export type RuntimeValidationOptions = {
  dir: string;
  platform: NodeJS.Platform;
  arch: string;
  sourceFingerprint?: string;
};

export function computeRuntimeSourceFingerprint(electronDir: string): string {
  const hash = createHash("sha256");
  for (const relative of RUNTIME_SOURCE_INPUTS) {
    hash.update(relative);
    hash.update("\0");
    hash.update(readFileSync(path.join(electronDir, relative)));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export function validateRuntimePack(
  options: RuntimeValidationOptions,
): RuntimeValidationResult {
  const dir = path.resolve(options.dir);
  if (!isDirectory(dir)) {
    return invalid("missing-runtime", `Runtime directory is missing: ${dir}`);
  }

  const manifestPath = path.join(dir, "MANIFEST.json");
  if (!isFile(manifestPath)) {
    return invalid(
      "missing-manifest",
      `Runtime manifest is missing: ${manifestPath}`,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return invalid(
      "invalid-manifest",
      `Runtime manifest is not valid JSON: ${manifestPath}`,
    );
  }
  if (!isRecord(value)) {
    return invalid(
      "invalid-manifest",
      `Runtime manifest must contain an object: ${manifestPath}`,
    );
  }

  const issues: RuntimeValidationIssue[] = [];
  if (value.runtime !== "office") {
    issues.push({
      code: "invalid-manifest",
      message: `Runtime identity must be "office"`,
    });
  }
  if (value.schemaVersion !== RUNTIME_SCHEMA_VERSION) {
    issues.push({
      code: "unsupported-schema",
      message: `Runtime schema must be ${RUNTIME_SCHEMA_VERSION}; found ${String(value.schemaVersion)}`,
    });
  }
  if (value.platform !== options.platform) {
    issues.push({
      code: "platform-mismatch",
      message: `Runtime platform must be ${options.platform}; found ${String(value.platform)}`,
    });
  }
  if (value.arch !== options.arch) {
    issues.push({
      code: "architecture-mismatch",
      message: `Runtime architecture must be ${options.arch}; found ${String(value.arch)}`,
    });
  }
  if (
    typeof value.sourceFingerprint !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(value.sourceFingerprint)
  ) {
    issues.push({
      code: "invalid-manifest",
      message: "Runtime source fingerprint is missing or invalid",
    });
  } else if (
    options.sourceFingerprint &&
    value.sourceFingerprint !== options.sourceFingerprint
  ) {
    issues.push({
      code: "fingerprint-mismatch",
      message: "Runtime was built from different source inputs",
    });
  }

  const paths = isRecord(value.paths) ? value.paths : undefined;
  if (!paths) {
    issues.push({
      code: "invalid-manifest",
      message: "Runtime manifest paths are missing or invalid",
    });
  }

  const pythonExe = resolvePackPath(dir, paths?.pythonExe, "pythonExe", issues);
  const binDir = resolvePackPath(dir, paths?.binDir, "binDir", issues);
  const nodeModules = resolvePackPath(
    dir,
    paths?.nodeModules,
    "nodeModules",
    issues,
  );

  if (pythonExe && !isExecutableFile(pythonExe, options.platform)) {
    issues.push({
      code: "missing-python",
      message: `Runtime Python executable is missing or not executable: ${pythonExe}`,
    });
  }
  if (binDir && !isDirectory(binDir)) {
    issues.push({
      code: "missing-launcher",
      message: `Runtime launcher directory is missing: ${binDir}`,
    });
  }
  if (binDir && isDirectory(binDir)) {
    const suffix = options.platform === "win32" ? ".cmd" : "";
    for (const name of ["kowork-python", "kowork-node"]) {
      const launcher = path.join(binDir, `${name}${suffix}`);
      if (isExecutableFile(launcher, options.platform)) continue;
      issues.push({
        code: "missing-launcher",
        message: `Runtime launcher is missing or not executable: ${launcher}`,
      });
    }
  }
  if (nodeModules && !isDirectory(nodeModules)) {
    issues.push({
      code: "missing-node-libraries",
      message: `Runtime Node library directory is missing: ${nodeModules}`,
    });
  }

  if (issues.length || !pythonExe || !binDir || !nodeModules) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    manifest: value as RuntimeManifest,
    pack: {
      dir,
      pythonExe,
      pythonBinDir: path.dirname(pythonExe),
      binDir,
      nodeModules,
    },
  };
}

export function assertRuntimePack(
  options: RuntimeValidationOptions,
): RuntimePack {
  const result = validateRuntimePack(options);
  if (result.ok) return result.pack;
  throw new Error(formatRuntimeValidationIssues(result.issues));
}

export function formatRuntimeValidationIssues(
  issues: RuntimeValidationIssue[],
): string {
  return [
    "Office runtime pack is invalid:",
    ...issues.map((issue) => `- ${issue.message}`),
  ].join("\n");
}

function resolvePackPath(
  root: string,
  value: unknown,
  name: string,
  issues: RuntimeValidationIssue[],
): string | undefined {
  if (typeof value !== "string" || !value) {
    issues.push({
      code: "invalid-manifest",
      message: `Runtime path "${name}" is missing or invalid`,
    });
    return;
  }
  const unsafe =
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    value.split(/[\\/]+/).includes("..");
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (
    unsafe ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    issues.push({
      code: "unsafe-path",
      message: `Runtime path "${name}" escapes the pack: ${value}`,
    });
    return;
  }
  return resolved;
}

function invalid(
  code: RuntimeValidationIssueCode,
  message: string,
): RuntimeValidationResult {
  return { ok: false, issues: [{ code, message }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDirectory(value: string): boolean {
  try {
    return statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function isFile(value: string): boolean {
  try {
    return statSync(value).isFile();
  } catch {
    return false;
  }
}

function isExecutableFile(value: string, platform: NodeJS.Platform): boolean {
  if (!isFile(value)) return false;
  if (platform === "win32") return true;
  try {
    accessSync(value, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
