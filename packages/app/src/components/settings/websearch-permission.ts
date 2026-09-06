import type {
  PermissionActionConfig,
  PermissionConfig,
} from "@opencode-ai/sdk/v2/client";

// Enabled unless the config carries an explicit websearch: "deny" rule — a
// bare "deny" both hides the tool from the model and hard-blocks execution.
export function webSearchEnabled(permission: PermissionConfig | undefined) {
  if (!permission || typeof permission === "string") return true;
  return permission.websearch !== "deny";
}

// The server deep-merges `permission`, so sibling rules are preserved.
// Enabling writes "allow" — JSON merge can't express key deletion.
export function webSearchPermission(
  enabled: boolean,
): Pick<Extract<PermissionConfig, object>, "websearch"> {
  const action: PermissionActionConfig = enabled ? "allow" : "deny";
  return { websearch: action };
}
