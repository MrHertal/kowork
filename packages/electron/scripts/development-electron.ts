import { createRequire } from "node:module";

export function resolveDevelopmentElectronExecutable(): string {
  const value: unknown = createRequire(import.meta.url)("electron");
  if (typeof value !== "string") {
    throw new Error("Could not resolve the development Electron executable");
  }
  return value;
}
