import type {
  PermissionActionConfig,
  PermissionConfig,
} from "@opencode-ai/sdk/v2/client";

// Web search is enabled unless the config carries an explicit websearch: "deny"
// rule. Any other value (allow, ask, per-pattern object, or no rule at all)
// leaves it on — the sidecar gates the tool behind OPENCODE_ENABLE_EXA, and a
// bare "deny" both hides the tool from the model and hard-blocks execution.
export function webSearchEnabled(permission: PermissionConfig | undefined) {
  if (!permission || typeof permission === "string") return true;
  return permission.websearch !== "deny";
}

// The partial permission object to merge into the config for a toggle. The
// server deep-merges `permission` into the existing config, so sibling rules
// are preserved. Enabling writes "allow" (the effective default) rather than
// deleting the key — json merge can't express key deletion.
export function webSearchPermission(
  enabled: boolean,
): Pick<Extract<PermissionConfig, object>, "websearch"> {
  const action: PermissionActionConfig = enabled ? "allow" : "deny";
  return { websearch: action };
}
