/**
 * Builds the Kowork office runtime pack for the current platform — one shared,
 * relocatable runtime used by all document skills, never duplicated per skill.
 *
 * Layout produced (relocatable — no venv; libs live in the Python tree's own
 * site-packages so the whole tree can be moved/installed anywhere):
 *
 *   <out>/
 *     python/            python-build-standalone (libs installed into its site-packages)
 *     node_libs/         Node libraries exposed at runtime via NODE_PATH
 *     bin/               kowork-python/kowork-node shims (Node = Electron via ELECTRON_RUN_AS_NODE)
 *     MANIFEST.json      versions, platform, hashes, runtime paths
 *
 * Usage:  tsx ./scripts/build-runtime.ts [outDir]
 * Default outDir: resources/runtime  (gitignored; bundled via extraResources)
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeRuntimeSourceFingerprint,
  RUNTIME_SCHEMA_VERSION,
} from "../src/main/runtime-pack";

// --- Pinned versions (reproducible; bump deliberately) -----------------------
const PYTHON_VERSION = "3.12.13";
const PY_MAJOR_MINOR = PYTHON_VERSION.split(".").slice(0, 2).join("."); // "3.12"
const PBS_RELEASE = "20260610"; // astral-sh/python-build-standalone release tag
// Expected sha256 of each python-build-standalone `install_only` tarball, taken
// from the release's published SHA256SUMS. Verified before extraction so the
// runtime is pinned as strictly as the hash-locked pip deps below — TLS protects
// transit, this protects against a wrong, corrupted, or swapped release artifact.
// Update alongside PYTHON_VERSION / PBS_RELEASE.
const PBS_SHA256: Record<string, string> = {
  "aarch64-apple-darwin":
    "e18ddd4c1e8f4a1d6c4590b37f423d76aec734447edc20ed08e93983d95f2132",
  "x86_64-apple-darwin":
    "ba02164e4db381af8c288c0bc1657584a835e9121a0fa2836b0f2e712ff8cdf5",
  "x86_64-unknown-linux-gnu":
    "c218f50baeb2c06a30c2f03db5986b2bad6ab7c8a52faad2d5a59bda0677b93a",
  "aarch64-unknown-linux-gnu":
    "bc74cf1bb517651868342b0619b21eaaf9f94a2022c9c61886dd980e16fb091b",
  "x86_64-pc-windows-msvc":
    "f5e4d9f856567493776f3d1e832c939fbaba5dcbcc5e0492a82ecfceea83b316",
};
// -----------------------------------------------------------------------------

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(scriptsDir, "..");
const inputsDir = path.join(scriptsDir, "runtime");
const outDir = path.resolve(
  process.argv[2] ?? path.join(electronDir, "resources", "runtime"),
);

const TRIPLES: Record<string, string> = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "win32-x64": "x86_64-pc-windows-msvc",
};

const platformKey = `${process.platform}-${process.arch}`;
const triple = TRIPLES[platformKey];
if (!triple) {
  throw new Error(`Unsupported platform: ${platformKey}`);
}
const isWin = process.platform === "win32";

// Not "node_modules": electron-builder strips a root-level dir by that name from
// extraResources (app-builder-lib util/filter.js), which would drop docx-js.
const NODE_LIBS = "node_libs";

function log(msg: string) {
  console.log(`[build-runtime] ${msg}`);
}

function dirSize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(p);
    else if (entry.isFile()) total += statSync(p).size;
  }
  return total;
}

function rmGlob(root: string, names: Set<string>) {
  if (!statSafe(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (names.has(entry.name)) rmSync(p, { recursive: true, force: true });
      else rmGlob(p, names);
    } else if (entry.name.endsWith(".pyc")) {
      rmSync(p, { force: true });
    }
  }
}

function statSafe(p: string) {
  try {
    return statSync(p);
  } catch {
    return undefined;
  }
}

function listDirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

async function download(url: string, dest: string): Promise<void> {
  log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function lockedVersions(lockPath: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(lockPath, "utf8").split("\n")) {
    const m = /^([A-Za-z0-9_.-]+)==([^\s\\]+)/.exec(line.trim());
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

// Versions of the pack's top-level Node deps (whatever package.json declares),
// read from the committed lockfile.
function lockedNodeVersions(
  pkgPath: string,
  lockPath: string,
): Record<string, string> {
  const deps: Record<string, string> =
    JSON.parse(readFileSync(pkgPath, "utf8")).dependencies ?? {};
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const out: Record<string, string> = {};
  for (const name of Object.keys(deps)) {
    out[name] = lock.packages?.[`node_modules/${name}`]?.version ?? deps[name];
  }
  return out;
}

async function main() {
  log(`platform ${platformKey} -> ${triple}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  mkdirSync(path.join(outDir, "bin"), { recursive: true });

  // 1. Python runtime (python-build-standalone, install_only) ------------------
  const tarball = `cpython-${PYTHON_VERSION}+${PBS_RELEASE}-${triple}-install_only.tar.gz`;
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_RELEASE}/${tarball}`;
  const tarPath = path.join(outDir, tarball);
  await download(url, tarPath);
  const tarballSha256 = sha256(tarPath);
  const expectedSha256 = PBS_SHA256[triple];
  if (!expectedSha256) {
    rmSync(tarPath, { force: true });
    throw new Error(
      `No pinned sha256 for triple ${triple}; update PBS_SHA256.`,
    );
  }
  if (tarballSha256 !== expectedSha256) {
    rmSync(tarPath, { force: true });
    throw new Error(
      `Python runtime checksum mismatch for ${tarball}\n` +
        `  expected ${expectedSha256}\n  actual   ${tarballSha256}`,
    );
  }
  log(`extracting python runtime`);
  execFileSync("tar", ["-xzf", tarPath, "-C", outDir], { stdio: "inherit" });
  rmSync(tarPath, { force: true });

  const pyExe = isWin
    ? path.join(outDir, "python", "python.exe")
    : path.join(outDir, "python", "bin", "python3");
  const libDir = isWin
    ? path.join(outDir, "python", "Lib")
    : path.join(outDir, "python", "lib", `python${PY_MAJOR_MINOR}`);
  const pyScriptsDir = isWin
    ? path.join(outDir, "python", "Scripts")
    : path.join(outDir, "python", "bin");
  // Snapshot the interpreter's script dir before installing deps, so the prune
  // step can drop exactly the console scripts pip generates, without a
  // hard-coded name list.
  const scriptsBefore = new Set(listDirSafe(pyScriptsDir));

  // 2. Python deps -> INTO the tree's site-packages (relocatable, no venv) ------
  log(`pip install (hash-locked) into the python tree's site-packages`);
  execFileSync(
    pyExe,
    [
      "-m",
      "pip",
      "install",
      "--no-input",
      "--no-warn-script-location",
      "--require-hashes",
      "--no-deps",
      "-r",
      path.join(inputsDir, "requirements.lock"),
    ],
    { stdio: "inherit" },
  );

  // 3. Node deps -> npm ci into node_modules, then rename to NODE_LIBS ----------
  log(`npm ci node deps into ${NODE_LIBS}`);
  cpSync(
    path.join(inputsDir, "package.json"),
    path.join(outDir, "package.json"),
  );
  cpSync(
    path.join(inputsDir, "package-lock.json"),
    path.join(outDir, "package-lock.json"),
  );
  // npm ships as npm.cmd on Windows; execFile (no shell) won't find bare "npm".
  const npmBin = isWin ? "npm.cmd" : "npm";
  execFileSync(npmBin, ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: outDir,
    stdio: "inherit",
  });
  rmSync(path.join(outDir, "package.json"), { force: true });
  rmSync(path.join(outDir, "package-lock.json"), { force: true });

  // npm pulls type-only packages (`@types/*`, `undici-types`) as transitive deps;
  // they're pure dead weight at runtime, so drop them.
  for (const d of ["@types", "undici-types"]) {
    rmSync(path.join(outDir, "node_modules", d), {
      recursive: true,
      force: true,
    });
  }

  rmSync(path.join(outDir, NODE_LIBS), { recursive: true, force: true });
  renameSync(path.join(outDir, "node_modules"), path.join(outDir, NODE_LIBS));

  // 4. Shims (Node = Electron via ELECTRON_RUN_AS_NODE) -------------------------
  // Only kowork-* names: bare python/pip/node/npm belong to the user's own
  // toolchain. Isolation env lives in the shims so the sidecar env stays clean.
  log(`writing bin/ shims`);
  const binDir = path.join(outDir, "bin");
  const pythonRel = path.relative(outDir, pyExe);
  if (isWin) {
    writeFileSync(
      path.join(binDir, "kowork-node.cmd"),
      [
        `@echo off`,
        `rem Kowork: Node via the Electron binary; libs resolve via the pack's NODE_PATH.`,
        `if "%KOWORK_ELECTRON_BIN%"=="" (echo KOWORK_ELECTRON_BIN not set 1>&2 & exit /b 1)`,
        `set ELECTRON_RUN_AS_NODE=1`,
        `if defined NODE_PATH (set "NODE_PATH=%~dp0..\\${NODE_LIBS};%NODE_PATH%") else set "NODE_PATH=%~dp0..\\${NODE_LIBS}"`,
        `"%KOWORK_ELECTRON_BIN%" %*`,
        ``,
      ].join("\r\n"),
    );
    writeFileSync(
      path.join(binDir, "kowork-python.cmd"),
      [
        `@echo off`,
        `rem Kowork: embedded interpreter, isolated from the user's Python environment.`,
        `rem .pyc writes disabled: the pack lives in the signed app bundle.`,
        `set PYTHONNOUSERSITE=1`,
        `set PYTHONDONTWRITEBYTECODE=1`,
        `set PYTHONPATH=`,
        `set PYTHONHOME=`,
        `set VIRTUAL_ENV=`,
        `set CONDA_PREFIX=`,
        `"%~dp0..\\${pythonRel}" %*`,
        ``,
      ].join("\r\n"),
    );
  } else {
    // Self-locating without realpath: it only exists on macOS 13+, we support
    // 12 — and $0 is already absolute after a PATH lookup.
    const node = `#!/bin/sh
# Kowork: Node via the Electron binary; libs resolve via the pack's NODE_PATH.
pack=$(CDPATH= cd -P "$(dirname "$0")/.." && pwd)
export NODE_PATH="$pack/${NODE_LIBS}\${NODE_PATH:+:$NODE_PATH}"
export ELECTRON_RUN_AS_NODE=1
exec "\${KOWORK_ELECTRON_BIN:?KOWORK_ELECTRON_BIN not set}" "$@"
`;
    const python = `#!/bin/sh
# Kowork: embedded interpreter, isolated from the user's Python environment.
# .pyc writes disabled: the pack lives in the signed app bundle.
pack=$(CDPATH= cd -P "$(dirname "$0")/.." && pwd)
unset PYTHONPATH PYTHONHOME VIRTUAL_ENV CONDA_PREFIX
export PYTHONNOUSERSITE=1
export PYTHONDONTWRITEBYTECODE=1
exec "$pack/${pythonRel}" "$@"
`;
    writeFileSync(path.join(binDir, "kowork-node"), node);
    writeFileSync(path.join(binDir, "kowork-python"), python);
    chmodSync(path.join(binDir, "kowork-node"), 0o755);
    chmodSync(path.join(binDir, "kowork-python"), 0o755);
  }

  // 5. Prune (drop pyc caches + unused stdlib weight + dead deps) --------------
  log(`pruning`);
  rmGlob(path.join(outDir, "python"), new Set(["__pycache__"]));
  for (const d of ["test", "idlelib", "turtledemo", "tkinter", "ensurepip"]) {
    rmSync(path.join(libDir, d), { recursive: true, force: true });
  }

  // Drop the console-script wrappers pip generated: their shebang/launcher bakes
  // in the build-time interpreter path, which breaks once the pack is relocated.
  // The skills use these libs via `import`, never their CLIs.
  for (const name of listDirSafe(pyScriptsDir)) {
    if (!scriptsBefore.has(name)) {
      rmSync(path.join(pyScriptsDir, name), { recursive: true, force: true });
    }
  }

  // Remove pip itself: nothing may install into the signed bundle or fetch
  // unpinned code; bare `pip` resolves to the user's own pip, if any.
  const sitePackages = path.join(libDir, "site-packages");
  for (const name of listDirSafe(sitePackages)) {
    if (/^pip($|[.-])/.test(name)) {
      rmSync(path.join(sitePackages, name), { recursive: true, force: true });
    }
  }
  for (const name of listDirSafe(pyScriptsDir)) {
    if (/^pip[\d.]*(\.exe)?$/i.test(name)) {
      rmSync(path.join(pyScriptsDir, name), { recursive: true, force: true });
    }
  }

  // 6. MANIFEST ----------------------------------------------------------------
  const pythonPackages = lockedVersions(
    path.join(inputsDir, "requirements.lock"),
  );
  const nodePackages = lockedNodeVersions(
    path.join(inputsDir, "package.json"),
    path.join(inputsDir, "package-lock.json"),
  );
  const sizeBytes = dirSize(outDir);
  const manifest = {
    runtime: "office",
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    platform: process.platform,
    arch: process.arch,
    sourceFingerprint: computeRuntimeSourceFingerprint(electronDir),
    triple,
    python: {
      version: PYTHON_VERSION,
      pbsRelease: PBS_RELEASE,
      tarballSha256,
    },
    paths: {
      pythonExe: path.relative(outDir, pyExe),
      binDir: "bin",
      nodeModules: NODE_LIBS,
    },
    pythonPackages,
    node: nodePackages,
    builtAt: new Date().toISOString(),
    sizeBytes,
  };
  writeFileSync(
    path.join(outDir, "MANIFEST.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  log(`done -> ${outDir}`);
  log(`size: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
