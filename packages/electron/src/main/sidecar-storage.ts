import { mkdtempSync } from "node:fs";
import { basename, join } from "node:path";

export function getSidecarConfigPath(userDataPath: string) {
  return join(userDataPath, "sidecar", "config", "opencode");
}

export function createSidecarStorageEnv(
  userDataPath: string,
  tempPath: string,
) {
  const root = join(userDataPath, "sidecar");
  const tmp = join(
    mkdtempSync(join(tempPath, `${basename(userDataPath)}-`)),
    "sidecar",
  );

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
