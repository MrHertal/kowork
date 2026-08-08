import type {
  Message as OpenCodeMessage,
  SessionStatus,
} from "@opencode-ai/sdk/v2/client";
import { useEffect, useMemo } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { KoworkIcon } from "@/components/kowork-icon";
import {
  SessionTurn,
  useUserMessageIDs,
} from "@/components/session/session-turn";
import { shallowArrayEqual, useChildData } from "@/contexts/global-sync";
import { useSDK } from "@/contexts/sdk";
import {
  type StickToBottomContext,
  useStickToBottomContext,
} from "use-stick-to-bottom";

const emptyMessages: OpenCodeMessage[] = [];

function useActiveMessageID(
  messages: OpenCodeMessage[],
  sessionStatus: SessionStatus | undefined,
): string | undefined {
  return useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === "assistant" && typeof msg.time.completed !== "number") {
        const parentID = msg.parentID;
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

function TimelineScrollButton() {
  const context = useStickToBottomContext();
  const handleScrollToBottom = async () => {
    if (!(await context.scrollToBottom())) return;
    const scrollElement = context.scrollRef.current;
    if (scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight;
  };

  return (
    <ConversationScrollButton
      className="z-10"
      onClick={() => void handleScrollToBottom()}
    />
  );
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
  const busy = !!sessionStatus && sessionStatus.type !== "idle";

  useEffect(() => {
    const context = contextRef?.current;
    const scrollElement = context?.scrollRef.current;
    if (!context || !scrollElement) return;

    const anchorInitialBottom = () => {
      if (!context.state.isAtBottom || context.state.escapedFromLock) return;
      if (scrollElement.scrollHeight <= scrollElement.clientHeight) return;
      const remaining =
        scrollElement.scrollHeight -
        scrollElement.clientHeight -
        scrollElement.scrollTop;
      if (remaining > 1) return;
      scrollElement.removeEventListener("scroll", anchorInitialBottom);
      scrollElement.scrollTop = scrollElement.scrollHeight;
    };

    scrollElement.addEventListener("scroll", anchorInitialBottom, {
      passive: true,
    });
    anchorInitialBottom();
    return () =>
      scrollElement.removeEventListener("scroll", anchorInitialBottom);
  }, [contextRef, sessionID]);

  useEffect(() => {
    const context = contextRef?.current;
    const scrollElement = context?.scrollRef.current;
    const contentElement = context?.contentRef.current;
    if (!context || !scrollElement || !contentElement) return;

    const observer = new ResizeObserver(() => {
      if (busy) return;
      // The library's target is one pixel short of the native scroll maximum.
      if (!context.state.isAtBottom || context.state.escapedFromLock) return;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    });
    observer.observe(contentElement);
    return () => observer.disconnect();
  }, [busy, contextRef, sessionID]);

  return (
    <Conversation
      key={sessionID}
      contextRef={contextRef}
      initial="instant"
      resize="smooth"
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
        {userMessageIDs.length > 0 && <KoworkIcon busy={busy} />}
      </ConversationContent>
      <TimelineScrollButton />
    </Conversation>
  );
}
