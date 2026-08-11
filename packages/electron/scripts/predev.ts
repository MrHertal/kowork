import { execSync } from "node:child_process";
import { resolveChannel } from "./utils";

const channel = resolveChannel();
execSync("tsx ./scripts/ensure-runtime.ts", { stdio: "inherit" });
execSync(`tsx ./scripts/copy-icons.ts ${channel}`, { stdio: "inherit" });
// See prebuild.ts: the sidecar channel must stay pinned, not derived from the
// submodule's git state.
execSync("cd ../../opencode/packages/opencode && bun script/build-node.ts", {
  stdio: "inherit",
  env: { ...process.env, OPENCODE_CHANNEL: channel },
});
