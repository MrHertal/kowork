import type { RuntimePack } from "./runtime-pack";

export function createRuntimeSidecarEnv({
  env,
  runtime,
  electronExecutable,
  platform,
}: {
  env: Record<string, string>;
  runtime: RuntimePack | null;
  electronExecutable: string;
  platform: NodeJS.Platform;
}): Record<string, string> {
  const result = { ...env };
  delete result.DEBUG;
  if (platform === "linux") delete result.LD_PRELOAD;
  if (!runtime) return result;

  result.KOWORK_ELECTRON_BIN = electronExecutable;
  const pathKey =
    Object.keys(result).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const delimiter = platform === "win32" ? ";" : ":";
  result[pathKey] = [runtime.binDir, result[pathKey]]
    .filter(Boolean)
    .join(delimiter);
  return result;
}
