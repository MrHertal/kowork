import type { Message, Part } from "@opencode-ai/sdk/v2/client";
import { useMemo } from "react";

import { shallowArrayEqual, useChildData } from "@/contexts/global-sync";
import { useSDK } from "@/contexts/sdk";
import { projectSessionFiles } from "@/utils/session-files";

const emptyMessages: Message[] = [];
const emptyParts: Part[] = [];

export function useSessionFiles(sessionID: string) {
  const sdk = useSDK();
  const messages = useChildData(
    sdk.directory,
    (state) => state.message[sessionID] ?? emptyMessages,
    shallowArrayEqual,
  );
  const assistantMessageIDs = useMemo(
    () =>
      messages.flatMap((message) =>
        message.role === "assistant" ? [message.id] : [],
      ),
    [messages],
  );
  const parts = useChildData(
    sdk.directory,
    (state) =>
      assistantMessageIDs.flatMap(
        (messageID) => state.part[messageID] ?? emptyParts,
      ),
    shallowArrayEqual,
  );
  const revert = useChildData(
    sdk.directory,
    (state) =>
      state.session.find((session) => session.id === sessionID)?.revert,
    (a, b) => a?.messageID === b?.messageID && a?.partID === b?.partID,
  );
  const active = useChildData(
    sdk.directory,
    (state) => (state.session_status[sessionID]?.type ?? "idle") !== "idle",
  );

  return useMemo(
    () =>
      projectSessionFiles({
        messages,
        parts,
        directory: sdk.directory,
        revert,
        active,
      }),
    [active, messages, parts, revert, sdk.directory],
  );
}
