export type PermissionMode = "ask" | "auto";

export const defaultPermissionMode: PermissionMode = "ask";

interface PermissionController {
  enableAutoAccept: (sessionID: string, directory: string) => void;
  disableAutoAccept: (sessionID: string, directory?: string) => void;
}

export function getPermissionMode(autoAccepting: boolean): PermissionMode {
  return autoAccepting ? "auto" : "ask";
}

export function applyPermissionMode(
  permission: PermissionController,
  mode: PermissionMode,
  sessionID: string,
  directory: string,
) {
  if (mode === "auto") {
    permission.enableAutoAccept(sessionID, directory);
    return;
  }
  permission.disableAutoAccept(sessionID, directory);
}
