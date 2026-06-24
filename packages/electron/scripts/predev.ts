import { execSync } from "node:child_process";

execSync(`tsx ./scripts/copy-icons.ts ${process.env.KOWORK_CHANNEL ?? "dev"}`, {
  stdio: "inherit",
});
execSync("cd ../../opencode/packages/opencode && bun script/build-node.ts", {
  stdio: "inherit",
});
