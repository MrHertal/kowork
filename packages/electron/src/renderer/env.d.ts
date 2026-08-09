// @opencode-ref: opencode/packages/desktop/src/renderer/env.d.ts
import type { ElectronAPI } from "../preload/types";

declare global {
  interface Window {
    api: ElectronAPI;
    __KOWORK__?: {
      updaterEnabled?: boolean;
      wsl?: boolean;
      deepLinks?: string[];
    };
  }
}
