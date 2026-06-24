import { useCallback } from "react";

import { useGlobalSDK } from "@/contexts/global-sdk";

export function useRenameSession() {
  const client = useGlobalSDK().client;

  const renameSession = useCallback(
    (session: { id: string; directory: string }, title: string) => {
      client.session.update({
        sessionID: session.id,
        directory: session.directory,
        title,
      });
    },
    [client],
  );

  return renameSession;
}
