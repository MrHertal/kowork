import { execSync } from "node:child_process";
import { resolveChannel } from "./utils";

const channel = resolveChannel();
execSync(`tsx ./scripts/copy-icons.ts ${channel}`, { stdio: "inherit" });
// Pin the sidecar channel: opencode otherwise derives it from the submodule's
// git state, which changes the sidecar database filename per build context.
execSync("cd ../../opencode/packages/opencode && bun script/build-node.ts", {
  stdio: "inherit",
  env: { ...process.env, OPENCODE_CHANNEL: channel },
});
