import { chmodSync, mkdirSync, mkdtempSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const ISOLATED_ENV_KEYS = new Set([
  "OPENCODE_CONFIG",
  "OPENCODE_CONFIG_DIR",
  "OPENCODE_CONFIG_CONTENT",
  "OPENCODE_DB",
  "OPENCODE_PLUGIN_META_FILE",
  "OPENCODE_TEST_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
]);

export function getSidecarConfigPath(userDataPath: string) {
  return join(userDataPath, "sidecar", "config", "opencode");
}

export function createSidecarStorageEnv(
  userDataPath: string,
  tempPath: string,
) {
  const root = join(userDataPath, "sidecar");
  const tmp = join(stableTempDir(tempPath, basename(userDataPath)), "sidecar");

  return {
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_STATE_HOME: join(root, "state"),
    TMPDIR: tmp,
    TMP: tmp,
    TEMP: tmp,
  };
}

export function createIsolatedSidecarEnv(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, value]) =>
      value === undefined || ISOLATED_ENV_KEYS.has(key.toUpperCase())
        ? []
        : [[key, String(value)]],
    ),
  );
}

function stableTempDir(tempPath: string, name: string) {
  const dir = join(tempPath, name);
  const stat = statSync(dir, { throwIfNoEntry: false });
  const uid = process.getuid?.();
  if (
    stat &&
    (!stat.isDirectory() || (uid !== undefined && stat.uid !== uid))
  ) {
    return mkdtempSync(join(tempPath, `${name}-`));
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") chmodSync(dir, 0o700);
  return dir;
}
