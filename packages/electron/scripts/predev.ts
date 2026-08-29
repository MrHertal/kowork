import { execSync } from "node:child_process";
import { resolveChannel } from "./utils";

const channel = resolveChannel();
execSync("tsx ./scripts/ensure-runtime.ts", { stdio: "inherit" });
execSync(`tsx ./scripts/copy-icons.ts ${channel}`, { stdio: "inherit" });
execSync("tsx ./scripts/build-sidecar.ts", { stdio: "inherit" });
