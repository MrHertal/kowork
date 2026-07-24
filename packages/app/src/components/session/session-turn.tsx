import type {
  AssistantMessage,
  FilePart as FilePartType,
  Message as OpenCodeMessage,
  Part,
  SessionStatus,
  TextPart as TextPartType,
} from "@opencode-ai/sdk/v2/client";
import { CheckIcon, CopyIcon } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import {
  Attachment,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ErrorAlert } from "@/components/error-alert";
import {
  AssistantPartsDisplay,
  renderable,
} from "@/components/session/message-part";
import { SessionRetry } from "@/components/session/session-retry";
import { shallowArrayEqual, useChildData } from "@/contexts/global-sync";
import { useSDK } from "@/contexts/sdk";
import { m } from "@/paraglide/messages";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function unwrap(message: string): string {
  const text = message
    .replace(/^Error:\s*/, "")
    .replace(/^undefined:\s*/, "")
    .trim();

  const parse = (value: string) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  };

  const read = (value: string) => {
    const first = parse(value);
    if (typeof first !== "string") return first;
    return parse(first.trim());
  };

  let json = read(text);

  if (json === undefined) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      json = read(text.slice(start, end + 1));
    }
  }

  if (!record(json)) return text;

  const err = record(json.error) ? json.error : undefined;
  if (err) {
    const rawType = typeof err.type === "string" ? err.type : undefined;
    const type = rawType && rawType !== "undefined" ? rawType : undefined;
    const msg = typeof err.message === "string" ? err.message : undefined;
    if (type && msg) return `${type}: ${msg}`;
    if (msg) return msg;
    if (type) return type;
    const code = typeof err.code === "string" ? err.code : undefined;
    if (code) return code;
  }

  const msg = typeof json.message === "string" ? json.message : undefined;
  if (msg) return msg;

  const reason = typeof json.error === "string" ? json.error : undefined;
  if (reason) return reason;

  return text;
}

export function useUserMessageIDs(messages: OpenCodeMessage[]): string[] {
  return useMemo(
    () => messages.filter((m) => m.role === "user").map((m) => m.id),
    [messages],
  );
}

function formatDuration(ms: number): string {
  if (!(ms >= 0)) return "";
  const total = Math.round(ms / 1000);
  if (total < 60) return m.session_duration_seconds({ count: String(total) });
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return m.session_duration_minutes_seconds({
    minutes: String(minutes),
    seconds: String(seconds),
  });
}

function ResponseActions({
  text,
  durationMs,
}: {
  text: string;
  durationMs: number | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const duration =
    typeof durationMs === "number" ? formatDuration(durationMs) : "";

  return (
    <MessageActions>
      <MessageAction
        tooltip={copied ? m.common_copied() : m.common_copy_response()}
        onClick={handleCopy}
      >
        {copied ? (
          <CheckIcon className="size-3.5" aria-hidden="true" />
        ) : (
          <CopyIcon className="size-3.5" aria-hidden="true" />
        )}
      </MessageAction>
      {duration && (
        <span className="text-xs text-muted-foreground">{duration}</span>
      )}
    </MessageActions>
  );
}

function TurnDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function UserMessage({ parts }: { parts: Part[] }) {
  const textParts = parts.filter(
    (p): p is TextPartType => p.type === "text" && !p.synthetic,
  );
  // file:// refs render inline in text, not as tiles.
  const attachments = parts.filter(
    (p): p is FilePartType => p.type === "file" && p.url.startsWith("data:"),
  );
  return (
    <Message from="user">
      <div>
        {attachments.length > 0 && (
          <Attachments className="mb-2" variant="grid">
            {attachments.map((part) => (
              <Attachment
                key={part.id}
                title={part.filename}
                data={{
                  id: part.id,
                  type: "file",
                  filename: part.filename,
                  mediaType: part.mime,
                  url: part.url,
                }}
              >
                <AttachmentPreview />
              </Attachment>
            ))}
          </Attachments>
        )}
        <MessageContent className="gap-4">
          {textParts.length > 0 ? (
            textParts.map((part) => <span key={part.id}>{part.text}</span>)
          ) : (
            <span className="text-muted-foreground italic">...</span>
          )}
        </MessageContent>
      </div>
    </Message>
  );
}

const emptyParts: Part[] = [];
const emptyAssistants: AssistantMessage[] = [];
const idle: SessionStatus = { type: "idle" as const };

interface SessionTurnProps {
  sessionID: string;
  messageID: string;
  active: boolean;
  status: SessionStatus | undefined;
  showReasoningSummaries?: boolean;
  shellToolDefaultOpen?: boolean;
  editToolDefaultOpen?: boolean;
}

function SessionTurnImpl({
  sessionID,
  messageID,
  active,
  status: statusProp,
  showReasoningSummaries,
  shellToolDefaultOpen,
  editToolDefaultOpen,
}: SessionTurnProps) {
  const { directory } = useSDK();

  const userMessage = useChildData(directory, (s) => {
    const list = s.message[sessionID];
    if (!list) return undefined;
    const msg = list.find((m) => m.id === messageID);
    if (!msg || msg.role !== "user") return undefined;
    return msg;
  });

  const assistantMessages = useChildData(
    directory,
    (s) => {
      const list = s.message[sessionID];
      if (!list) return emptyAssistants;
      const idx = list.findIndex((m) => m.id === messageID);
      if (idx < 0 || list[idx]?.role !== "user") return emptyAssistants;
      const result: AssistantMessage[] = [];
      for (let i = idx + 1; i < list.length; i++) {
        const msg = list[i];
        if (!msg) continue;
        if (msg.role === "user") break;
        if (msg.role === "assistant" && msg.parentID === messageID) {
          result.push(msg as AssistantMessage);
        }
      }
      return result.length === 0 ? emptyAssistants : result;
    },
    shallowArrayEqual,
  );

  const userParts = useChildData(
    directory,
    (s) => s.part[messageID] ?? emptyParts,
    shallowArrayEqual,
  );

  const assistantIDs = useMemo(
    () => assistantMessages.map((m) => m.id),
    [assistantMessages],
  );
  const assistantPartsList = useChildData(
    directory,
    (s) => assistantIDs.map((id) => s.part[id] ?? emptyParts),
    shallowArrayEqual,
  );

  const status = statusProp ?? idle;
  const working = status.type !== "idle" && active;
  const retrying = status.type === "retry" && active;

  const error = useMemo(
    () =>
      assistantMessages.find(
        (m) => m.error && m.error.name !== "MessageAbortedError",
      )?.error,
    [assistantMessages],
  );

  const errorText = useMemo(() => {
    const msg = error?.data?.message;
    if (typeof msg === "string") return unwrap(msg);
    if (msg === undefined || msg === null) return "";
    return unwrap(String(msg));
  }, [error]);

  const resolvedShowReasoningSummaries = showReasoningSummaries ?? true;

  const assistantVisible = useMemo(() => {
    let count = 0;
    for (const parts of assistantPartsList) {
      for (const part of parts) {
        if (renderable(part, resolvedShowReasoningSummaries)) count++;
      }
    }
    return count;
  }, [assistantPartsList, resolvedShowReasoningSummaries]);

  const showThinking = useMemo(() => {
    if (!working || !!error) return false;
    if (retrying) return false;
    if (resolvedShowReasoningSummaries) return assistantVisible === 0;
    return true;
  }, [
    working,
    error,
    retrying,
    resolvedShowReasoningSummaries,
    assistantVisible,
  ]);

  const interrupted = useMemo(
    () =>
      assistantMessages.some((m) => m.error?.name === "MessageAbortedError"),
    [assistantMessages],
  );

  const compaction = useMemo(
    () => userParts.some((p) => p.type === "compaction"),
    [userParts],
  );

  const dividerLabel = compaction
    ? m.session_divider_compaction()
    : interrupted
      ? m.session_divider_interrupted()
      : undefined;

  const lastTextContent = useMemo(() => {
    if (working) return undefined;
    for (let i = assistantPartsList.length - 1; i >= 0; i--) {
      const parts = assistantPartsList[i] ?? emptyParts;
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j];
        if (part?.type === "text" && part.text?.trim())
          return (part as TextPartType).text;
      }
    }
    return undefined;
  }, [working, assistantPartsList]);

  const turnDurationMs = useMemo(() => {
    if (!userMessage) return undefined;
    const start = userMessage.time.created;
    if (typeof start !== "number") return undefined;
    let max: number | undefined;
    for (const msg of assistantMessages) {
      const t = msg.time.completed;
      if (typeof t === "number" && (max === undefined || t > max)) max = t;
    }
    if (typeof max !== "number" || max < start) return undefined;
    return max - start;
  }, [userMessage, assistantMessages]);

  if (!userMessage) return null;

  return (
    <>
      <UserMessage parts={userParts} />

      {dividerLabel && <TurnDivider label={dividerLabel} />}

      <Message from="assistant">
        {assistantMessages.length > 0 && (
          <div
            className="flex flex-col gap-4 empty:hidden"
            aria-hidden={working}
          >
            <AssistantPartsDisplay
              messages={assistantMessages}
              working={working}
              showReasoningSummaries={resolvedShowReasoningSummaries}
              shellToolDefaultOpen={shellToolDefaultOpen}
              editToolDefaultOpen={editToolDefaultOpen}
            />
          </div>
        )}

        {showThinking && (
          <Shimmer as="span" duration={1} className="w-fit text-sm">
            {m.session_status_thinking()}
          </Shimmer>
        )}

        {lastTextContent && (
          <ResponseActions text={lastTextContent} durationMs={turnDurationMs} />
        )}
      </Message>

      {error && <ErrorAlert text={errorText} />}

      <SessionRetry status={status} show={active} />
    </>
  );
}

export const SessionTurn = memo(SessionTurnImpl);
