// @opencode-ref: opencode/packages/app/src/components/dialog-select-directory.tsx

export function getFilename(path: string | undefined) {
  if (!path) return "";
  const trimmed = path.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}

export function getDirectory(path: string | undefined) {
  if (!path) return "";
  const trimmed = path.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts.slice(0, parts.length - 1).join("/") + "/";
}

export function getFileExtension(path: string | undefined) {
  if (!path) return "";
  const parts = path.split(".");
  return parts[parts.length - 1];
}

export function getFilenameTruncated(
  path: string | undefined,
  maxLength: number = 20,
) {
  const filename = getFilename(path);
  if (filename.length <= maxLength) return filename;
  const lastDot = filename.lastIndexOf(".");
  const ext = lastDot <= 0 ? "" : filename.slice(lastDot);
  const available = maxLength - ext.length - 1; // -1 for ellipsis
  if (available <= 0) return filename.slice(0, maxLength - 1) + "…";
  return filename.slice(0, available) + "…" + ext;
}

export function relativizePath(path: string, directory?: string): string {
  if (!path) return "";
  if (!directory) return path;
  if (directory === "/") return path;
  if (directory === "\\") return path;
  if (path === directory) return "";

  const separator = directory.includes("\\") ? "\\" : "/";
  const prefix = directory.endsWith(separator)
    ? directory
    : directory + separator;
  if (!path.startsWith(prefix)) return path;
  return path.slice(directory.length);
}

export function abbreviateHomePath(path: string, home: string): string {
  if (!path || !home) return path;
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  const normalizedHome = home.replaceAll("\\", "/").replace(/\/+$/, "");
  const insensitive =
    /^[A-Za-z]:\//.test(normalizedHome) || normalizedHome.startsWith("//");
  const comparable = insensitive ? normalized.toLowerCase() : normalized;
  const comparableHome = insensitive
    ? normalizedHome.toLowerCase()
    : normalizedHome;

  if (comparable === comparableHome) return "~";
  if (!comparable.startsWith(`${comparableHome}/`)) return path;
  return `~${normalized.slice(normalizedHome.length)}`;
}

export function absolutizePath(path: string, directory: string): string {
  if (!path || !directory) return path;
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized))
    return normalized;
  const root = directory.replaceAll("\\", "/").replace(/\/+$/, "");
  return `${root}/${normalized.replace(/^\/+/, "")}`;
}

export function truncateMiddle(text: string, maxLength: number = 20) {
  if (text.length <= maxLength) return text;
  const available = maxLength - 1; // -1 for ellipsis
  const start = Math.ceil(available / 2);
  const end = Math.floor(available / 2);
  return text.slice(0, start) + "…" + text.slice(-end);
}
