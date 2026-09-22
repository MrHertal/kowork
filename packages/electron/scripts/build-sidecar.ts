import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveChannel } from "./utils";

const channel = resolveChannel();
const opencodePackage = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../opencode/packages/opencode/package.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { version?: unknown };

if (typeof opencodePackage.version !== "string") {
  throw new Error("OpenCode package version is missing");
}

// Pin the sidecar channel: opencode otherwise derives it from the submodule's
// git state, which changes the sidecar database filename per build context.
execSync("cd ../../opencode/packages/opencode && bun script/build-node.ts", {
  stdio: "inherit",
  env: {
    ...process.env,
    OPENCODE_CHANNEL: channel,
    OPENCODE_VERSION: opencodePackage.version,
  },
});
