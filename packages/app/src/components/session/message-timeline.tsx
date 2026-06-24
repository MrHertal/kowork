import type {
  AssistantMessage,
  Message as OpenCodeMessage,
  SessionStatus,
} from "@opencode-ai/sdk/v2/client";
import { useMemo } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  SessionTurn,
  useUserMessageIDs,
} from "@/components/session/session-turn";
import { shallowArrayEqual, useChildData } from "@/contexts/global-sync";
import { useSDK } from "@/contexts/sdk";
import type { StickToBottomContext } from "use-stick-to-bottom";

const emptyMessages: OpenCodeMessage[] = [];

function useActiveMessageID(
  messages: OpenCodeMessage[],
  sessionStatus: SessionStatus | undefined,
): string | undefined {
  return useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === "assistant" && typeof msg.time.completed !== "number") {
        const parentID = (msg as AssistantMessage).parentID;
        const parent = messages.find((m) => m.id === parentID);
        if (parent && parent.role === "user") return parent.id;
        break;
      }
    }

    if (sessionStatus && sessionStatus.type !== "idle") {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === "user") return messages[i]!.id;
      }
    }

    return undefined;
  }, [messages, sessionStatus]);
}

interface MessageTimelineProps {
  sessionID: string;
  contextRef?: React.RefObject<StickToBottomContext | null>;
  showReasoningSummaries?: boolean;
  shellToolDefaultOpen?: boolean;
  editToolDefaultOpen?: boolean;
}

export function MessageTimeline({
  sessionID,
  contextRef,
  showReasoningSummaries,
  shellToolDefaultOpen,
  editToolDefaultOpen,
}: MessageTimelineProps) {
  const { directory } = useSDK();

  const messages = useChildData(
    directory,
    (s) => s.message[sessionID] ?? emptyMessages,
    shallowArrayEqual,
  );
  const sessionStatus = useChildData(
    directory,
    (s) => s.session_status[sessionID],
  );

  const userMessageIDs = useUserMessageIDs(messages);
  const activeMessageID = useActiveMessageID(messages, sessionStatus);

  return (
    <Conversation
      key={sessionID}
      contextRef={contextRef}
      initial="instant"
      resize="instant"
    >
      <ConversationContent className="mx-auto w-full max-w-4xl px-8">
        {userMessageIDs.map((messageID) => {
          const active = messageID === activeMessageID;
          return (
            <div
              key={messageID}
              data-message-id={messageID}
              className="flex flex-col gap-8"
              style={
                active
                  ? undefined
                  : {
                      contentVisibility: "auto",
                      containIntrinsicSize: "auto 500px",
                    }
              }
            >
              <SessionTurn
                sessionID={sessionID}
                messageID={messageID}
                active={active}
                status={active ? sessionStatus : undefined}
                showReasoningSummaries={showReasoningSummaries}
                shellToolDefaultOpen={shellToolDefaultOpen}
                editToolDefaultOpen={editToolDefaultOpen}
              />
            </div>
          );
        })}
      </ConversationContent>
      <ConversationScrollButton className="z-10" />
    </Conversation>
  );
}
