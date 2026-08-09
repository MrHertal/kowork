import type { Agent, Session } from "@opencode-ai/sdk/v2/client";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowUpRightIcon, BotIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { shallowArrayEqual, useChildData } from "@/contexts/global-sync";
import { useSDK } from "@/contexts/sdk";
import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

function capitalize(value: string): string {
  return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

function resolveAgent(
  raw: unknown,
  list: Agent[],
): { name?: string; color?: string } {
  if (typeof raw !== "string" || !raw) return {};
  const key = raw.toLowerCase();
  const item = list.find(
    (entry) => entry.name === raw || entry.name.toLowerCase() === key,
  );
  return {
    name: capitalize(item?.name ?? raw),
    color: item?.color,
  };
}

const emptySessions: Session[] = [];

function findChildSession(
  parentID: string | undefined,
  sessions: Session[],
  description: string,
  agentName: string | undefined,
): string | undefined {
  if (!parentID) return undefined;
  return sessions
    .filter(
      (session) => session.parentID === parentID && !session.time?.archived,
    )
    .filter((session) =>
      description ? session.title.startsWith(description) : true,
    )
    .filter((session) =>
      agentName ? session.title.includes(`@${agentName}`) : true,
    )
    .sort((a, b) => (b.time.created ?? 0) - (a.time.created ?? 0))[0]?.id;
}

export function TaskTool(props: ToolProps) {
  const { directory } = useSDK();
  const navigate = useNavigate();
  const parentID = useParams({
    from: "/session/$id",
    select: (p) => p.id,
    shouldThrow: false,
  });
  const description =
    typeof props.input.description === "string" ? props.input.description : "";
  const metaSessionId =
    typeof props.metadata.sessionId === "string"
      ? props.metadata.sessionId
      : undefined;

  const agents = useChildData(directory, (s) => s.agent, shallowArrayEqual);
  const needsLookup = !metaSessionId;
  const sessions = useChildData(
    directory,
    (s) => (needsLookup ? s.session : emptySessions),
    shallowArrayEqual,
  );

  const { agentName, agentColor } = useMemo(() => {
    const agent = resolveAgent(props.input.subagent_type, agents);
    return { agentName: agent.name, agentColor: agent.color };
  }, [props.input.subagent_type, agents]);

  const childSessionId = useMemo(() => {
    if (metaSessionId) return metaSessionId;
    return findChildSession(parentID, sessions, description, agentName);
  }, [metaSessionId, parentID, sessions, description, agentName]);

  const running = props.status === "pending" || props.status === "running";
  const title = agentName ?? m.session_tool_agent_default();
  const subtitle = description;
  const href = childSessionId ? `/session/${childSessionId}` : undefined;

  const handleTriggerClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!childSessionId) return;
      if (
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      event.preventDefault();
      void navigate({ to: "/session/$id", params: { id: childSessionId } });
    },
    [childSessionId, navigate],
  );

  const trigger = (
    <div className="flex min-w-0 items-center gap-2">
      <BotIcon className="size-4 shrink-0" />
      <span
        className="shrink-0 font-medium"
        style={agentColor ? { color: agentColor } : undefined}
      >
        {running ? (
          <Shimmer as="span" duration={1}>
            {title}
          </Shimmer>
        ) : (
          title
        )}
      </span>
      {href && subtitle && <span className="truncate">{subtitle}</span>}
    </div>
  );

  return (
    <BasicTool
      trigger={trigger}
      status={props.status}
      hideDetails
      triggerHref={href}
      onTriggerClick={handleTriggerClick}
      action={
        href ? <ArrowUpRightIcon className="size-4 shrink-0" /> : undefined
      }
    />
  );
}
