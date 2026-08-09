// @opencode-ref: opencode/packages/desktop/src/main/constants.ts
import { app } from "electron";

export type Channel = "dev" | "beta" | "prod";
const raw = import.meta.env.KOWORK_CHANNEL;
export const CHANNEL: Channel =
  raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev";

export const SETTINGS_STORE = "kowork.settings";
export const DEFAULT_SERVER_URL_KEY = "defaultServerUrl";
export const WSL_ENABLED_KEY = "wslEnabled";
export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev";
