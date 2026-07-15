export const SESSION_DIRECTORY_MODE_METADATA_KEY = "kowork.directoryMode";

export type SessionDirectoryMode = "default" | "attached";

export function getSessionDirectoryMode(
  session: {
    directory: string;
    metadata?: Record<string, unknown>;
  },
  defaultDirectory?: string,
): SessionDirectoryMode {
  const mode = session.metadata?.[SESSION_DIRECTORY_MODE_METADATA_KEY];
  if (mode === "default" || mode === "attached") return mode;
  return defaultDirectory && session.directory === defaultDirectory
    ? "default"
    : "attached";
}
