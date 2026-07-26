import type { Todo } from "@opencode-ai/sdk/v2/client";
import { useEffect } from "react";

import { useChildData } from "@/contexts/global-sync";
import { useSDK } from "@/contexts/sdk";
import { useSync } from "@/contexts/sync";

const emptyTodos: Todo[] = [];

export function useSessionTodos(sessionID: string) {
  const sdk = useSDK();
  const sync = useSync();
  const todos = useChildData(
    sdk.directory,
    (state) => state.todo[sessionID] ?? emptyTodos,
  );

  useEffect(() => {
    void sync.session.todo(sessionID);
  }, [sessionID, sdk.directory, sync.session]);

  return todos;
}
