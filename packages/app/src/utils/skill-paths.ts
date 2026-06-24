import type { AppSkillsResponses } from "@opencode-ai/sdk/v2/client";

type SkillLocation = Pick<AppSkillsResponses[200][number], "location">;

// OpenCode and Electron can disagree on slash direction / drive casing on
// Windows; normalize before any prefix comparison.
function normalize(value: string): string {
  const slashed = value.replace(/\\/g, "/");
  return /^[A-Za-z]:/.test(slashed)
    ? slashed.charAt(0).toLowerCase() + slashed.slice(1)
    : slashed;
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isAbsolute(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

export function findOwningPath(
  skill: SkillLocation,
  paths: readonly string[],
): string | null {
  const location = normalize(skill.location);
  for (const entry of paths) {
    if (!isAbsolute(entry)) continue;
    if (location.startsWith(withTrailingSlash(normalize(entry)))) return entry;
  }
  return null;
}

export function isSkillInPath(skill: SkillLocation, path: string): boolean {
  return normalize(skill.location).startsWith(
    withTrailingSlash(normalize(path)),
  );
}

export function countSkillsInPath(
  skills: readonly SkillLocation[],
  path: string,
): number {
  return skills.reduce(
    (total, skill) => (isSkillInPath(skill, path) ? total + 1 : total),
    0,
  );
}

// Install id (first segment under the managed dir) for a bundled skill, or
// null if it lives elsewhere — lets callers tell installs from user folders.
export function bundledSkillId(
  skill: SkillLocation,
  managedDir: string,
): string | null {
  const prefix = withTrailingSlash(normalize(managedDir));
  const location = normalize(skill.location);
  if (!location.startsWith(prefix)) return null;
  const rest = location.slice(prefix.length);
  const segment = rest.split("/")[0] ?? "";
  return segment.length > 0 ? segment : null;
}
