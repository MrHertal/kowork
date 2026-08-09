import type { SessionStatus } from "@opencode-ai/sdk/v2/client";
import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { m } from "@/paraglide/messages";

type RetryStatus = Extract<SessionStatus, { type: "retry" }>;

function useRetryCountdown(
  retry: RetryStatus | undefined,
  show: boolean,
): number {
  const [seconds, setSeconds] = useState(0);
  const next = retry?.next;

  useEffect(() => {
    if (!show || !next) return;
    const tick = () =>
      setSeconds(Math.max(0, Math.round((next - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [next, show]);

  return seconds;
}

export function SessionRetry({
  status,
  show = true,
}: {
  status: SessionStatus;
  show?: boolean;
}) {
  const retry = status.type === "retry" ? status : undefined;
  const seconds = useRetryCountdown(retry, show);

  if (!retry || !show) return null;

  const isGeminiQuota =
    retry.message.includes("exceeded your current quota") &&
    retry.message.includes("gemini");
  const truncated = retry.message.length > 80;
  const message = isGeminiQuota
    ? m.session_retry_gemini_hot()
    : truncated
      ? retry.message.slice(0, 80) + "..."
      : retry.message;

  const delay =
    seconds > 0
      ? m.session_steps_retrying_in({ seconds: String(seconds) })
      : "";
  const info = [m.session_steps_retrying(), delay].filter(Boolean).join(" ");
  const infoLine = info
    ? `${info} ${m.session_steps_retry_attempt({ attempt: String(retry.attempt) })}`
    : m.session_steps_retry_attempt({ attempt: String(retry.attempt) });

  const messageContent = truncated ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help truncate">{message}</div>
      </TooltipTrigger>
      <TooltipContent>{retry.message}</TooltipContent>
    </Tooltip>
  ) : (
    <div>{message}</div>
  );

  return (
    <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <div className="flex items-start gap-2">
        <Spinner className="mt-0.5 size-4" />
        <div className="min-w-0">
          {messageContent}
          {infoLine && (
            <div className="text-xs text-muted-foreground">{infoLine}</div>
          )}
        </div>
      </div>
    </div>
  );
}
