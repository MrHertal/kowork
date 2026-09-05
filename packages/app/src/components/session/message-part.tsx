// @opencode-ref: opencode/packages/session-ui/src/components/message-part.tsx
import type {
  AssistantMessage,
  Part,
  ToolPart,
} from "@opencode-ai/sdk/v2/client";
import { type ReactNode, createElement, useMemo, useState } from "react";

import { MessageContent } from "@/components/ai-elements/message";
import { Activity } from "@/components/session/activity";
import {
  type ActivityCategory,
  classifyActivityPart,
} from "@/components/session/activity-classification";
import {
  PresentedFiles,
  type PresentedFile,
} from "@/components/session/presented-files";
import { shallowArrayEqual, useChildData } from "@/contexts/global-sync";
import { useSDK } from "@/contexts/sdk";

import { m } from "@/paraglide/messages";

import { partDefaultOpen } from "./part-default-open";
import { CompactionPart } from "./parts/compaction-part";
import { ReasoningPart } from "./parts/reasoning-part";
import { TextPart } from "./parts/text-part";
import {
  ContextToolGroup,
  isContextGroupTool,
} from "./tools/context-tool-group";
import type { ToolProps } from "./tools/basic-tool";
import { GenericTool } from "./tools/generic-tool";
import {
  McpTool,
  humanize,
  mcpServerTitle,
  parseMcpToolName,
} from "./tools/mcp-tool";
import {
  ToolErrorCard,
  type ToolErrorCardProps,
} from "./tools/tool-error-card";
import { ToolRegistry } from "./tool-registry";
import "./tool-registrations";

const emptyInput: Record<string, unknown> = {};
const emptyMetadata: Record<string, unknown> = {};
const emptyParts: Part[] = [];

function ToolPartDisplay({
  part,
  hideDetails,
  defaultOpen,
}: {
  part: ToolPart;
  hideDetails?: boolean;
  defaultOpen?: boolean;
}) {
  const input = part.state.input ?? emptyInput;
  const metadata =
    part.state.status === "pending"
      ? emptyMetadata
      : (part.state.metadata ?? emptyMetadata);
  const output =
    part.state.status === "completed" ? part.state.output : undefined;

  const taskId = (() => {
    if (part.tool !== "task") return undefined;
    const value = metadata.sessionId;
    if (typeof value === "string" && value) return value;
    return undefined;
  })();

  const taskHref = (() => {
    if (part.tool !== "task" || !taskId) return undefined;
    return `/session/${taskId}`;
  })();

  const taskSubtitle = (() => {
    if (part.tool !== "task") return undefined;
    const value = input.description;
    if (typeof value === "string" && value) return value;
    return undefined;
  })();

  if (part.state.status === "error" && part.state.error) {
    const error = part.state.error;
    const cleaned = error.replace("Error: ", "");
    if (
      part.tool === "question" &&
      cleaned.includes("dismissed this question")
    ) {
      return (
        <p className="text-xs text-muted-foreground">
          {m.session_tool_question_dismissed()}
        </p>
      );
    }
    return (
      <ToolError
        tool={part.tool}
        error={error}
        defaultOpen={defaultOpen}
        subtitle={taskSubtitle}
        href={taskHref}
      />
    );
  }

  const registered = ToolRegistry.render(part.tool);
  if (registered) {
    return createElement(registered, {
      input,
      tool: part.tool,
      metadata,
      output,
      status: part.state.status,
      hideDetails,
      defaultOpen,
    });
  }

  return (
    <McpOrGenericTool
      input={input}
      tool={part.tool}
      metadata={metadata}
      output={output}
      status={part.state.status}
      hideDetails={hideDetails}
      defaultOpen={defaultOpen}
    />
  );
}

function McpOrGenericTool(props: ToolProps) {
  const sdk = useSDK();
  const mcpNames = useChildData(
    sdk.directory,
    (s) => Object.keys(s.mcp),
    shallowArrayEqual,
  );
  const parsed = parseMcpToolName(props.tool, mcpNames);

  if (parsed) {
    return <McpTool {...props} server={parsed.server} mcpTool={parsed.tool} />;
  }
  return <GenericTool {...props} />;
}

function ToolError(props: ToolErrorCardProps) {
  const sdk = useSDK();
  const mcpNames = useChildData(
    sdk.directory,
    (s) => Object.keys(s.mcp),
    shallowArrayEqual,
  );
  const parsed = parseMcpToolName(props.tool, mcpNames);

  if (!parsed) return <ToolErrorCard {...props} />;
  return (
    <ToolErrorCard
      {...props}
      title={mcpServerTitle(parsed.server)}
      subtitle={props.subtitle ?? humanize(parsed.tool)}
    />
  );
}

export function Part({
  part,
  hideDetails,
  defaultOpen,
  streaming,
}: {
  part: Part;
  hideDetails?: boolean;
  defaultOpen?: boolean;
  streaming?: boolean;
}) {
  switch (part.type) {
    case "text":
      return <TextPart part={part} streaming={streaming} />;
    case "reasoning":
      return <ReasoningPart part={part} streaming={streaming} />;
    case "tool":
      return (
        <ToolPartDisplay
          part={part}
          hideDetails={hideDetails}
          defaultOpen={defaultOpen}
        />
      );
    case "compaction":
      return <CompactionPart />;
    default:
      return null;
  }
}

const HIDDEN_TOOLS = new Set(["present_files", "todowrite"]);

function toPresentedFile(value: unknown): PresentedFile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.path !== "string" || !v.path.trim()) return undefined;
  if (typeof v.filename !== "string" || !v.filename.trim()) return undefined;
  if (typeof v.mime !== "string" || !v.mime.trim()) return undefined;
  if (typeof v.size !== "number" || !Number.isFinite(v.size) || v.size < 0)
    return undefined;
  return { path: v.path, filename: v.filename, mime: v.mime, size: v.size };
}

function presentedFiles(partsList: Part[][]): PresentedFile[] {
  const files = new Map<string, PresentedFile>();
  for (const parts of partsList) {
    for (const part of parts) {
      if (
        part.type !== "tool" ||
        part.tool !== "present_files" ||
        part.state.status !== "completed"
      )
        continue;
      const metadata = part.state.metadata;
      if (!metadata || typeof metadata !== "object") continue;
      const values = "files" in metadata ? metadata.files : undefined;
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        const file = toPresentedFile(value);
        if (!file) continue;
        files.delete(file.path);
        files.set(file.path, file);
      }
    }
  }
  return [...files.values()];
}

function isPendingQuestion(part: Part): boolean {
  return (
    part.type === "tool" &&
    part.tool === "question" &&
    (part.state.status === "pending" || part.state.status === "running")
  );
}

export function renderable(part: Part, showReasoningSummaries = true): boolean {
  switch (part.type) {
    case "tool":
      if (HIDDEN_TOOLS.has(part.tool)) return false;
      if (isPendingQuestion(part)) return false;
      return true;
    case "text":
      return !!part.text?.trim();
    case "reasoning":
      return showReasoningSummaries && !!part.text?.trim();
    case "compaction":
      return true;
    default:
      return false;
  }
}

type PartRef = {
  messageID: string;
  partID: string;
};

type PartGroup =
  | { key: string; type: "part"; ref: PartRef }
  | { key: string; type: "context"; refs: PartRef[] };

function sameRef(a: PartRef, b: PartRef) {
  return a.messageID === b.messageID && a.partID === b.partID;
}

function sameGroup(a: PartGroup, b: PartGroup) {
  if (a === b) return true;
  if (a.key !== b.key || a.type !== b.type) return false;
  if (a.type === "part" && b.type === "part") return sameRef(a.ref, b.ref);
  if (a.type === "context" && b.type === "context") {
    if (a.refs.length !== b.refs.length) return false;
    return a.refs.every((ref, i) => sameRef(ref, b.refs[i]!));
  }
  return false;
}

function sameGroups(a: readonly PartGroup[], b: readonly PartGroup[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, i) => sameGroup(item, b[i]!));
}

function useStable<T>(value: T, equals: (a: T, b: T) => boolean): T {
  const [stable, setStable] = useState(value);
  if (equals(stable, value)) return stable;
  setStable(value);
  return value;
}

function groupParts(parts: { messageID: string; part: Part }[]): PartGroup[] {
  const result: PartGroup[] = [];
  let start = -1;

  const flush = (end: number) => {
    if (start < 0) return;
    const first = parts[start];
    const last = parts[end];
    if (!first || !last) {
      start = -1;
      return;
    }
    result.push({
      key: `context:${first.messageID}:${first.part.id}`,
      type: "context",
      refs: parts.slice(start, end + 1).map((item) => ({
        messageID: item.messageID,
        partID: item.part.id,
      })),
    });
    start = -1;
  };

  parts.forEach((item, index) => {
    if (isContextGroupTool(item.part)) {
      if (start < 0) start = index;
      return;
    }

    flush(index - 1);
    result.push({
      key: `part:${item.messageID}:${item.part.id}`,
      type: "part",
      ref: {
        messageID: item.messageID,
        partID: item.part.id,
      },
    });
  });

  flush(parts.length - 1);
  return result;
}

export function AssistantPartsDisplay({
  messages,
  working,
  shellToolDefaultOpen,
  editToolDefaultOpen,
  showReasoningSummaries = true,
}: {
  messages: AssistantMessage[];
  working?: boolean;
  shellToolDefaultOpen?: boolean;
  editToolDefaultOpen?: boolean;
  showReasoningSummaries?: boolean;
}) {
  const { directory } = useSDK();
  const messageIDs = useMemo(() => messages.map((m) => m.id), [messages]);
  const partsList = useChildData(
    directory,
    (s) => messageIDs.map((id) => s.part[id] ?? emptyParts),
    shallowArrayEqual,
  );

  const partsIndex = useMemo(() => {
    const map = new Map<string, Map<string, Part>>();
    messageIDs.forEach((id, i) => {
      const inner = new Map<string, Part>();
      for (const part of partsList[i] ?? emptyParts) inner.set(part.id, part);
      map.set(id, inner);
    });
    return map;
  }, [messageIDs, partsList]);

  const messagesByID = useMemo(() => {
    const map = new Map<string, AssistantMessage>();
    for (const message of messages) map.set(message.id, message);
    return map;
  }, [messages]);

  const computed = useMemo(() => {
    const entries: { messageID: string; part: Part }[] = [];
    messageIDs.forEach((id, i) => {
      const parts = partsList[i];
      if (!parts) return;
      for (const part of parts) {
        if (
          !renderable(part, showReasoningSummaries) &&
          !isPendingQuestion(part)
        )
          continue;
        entries.push({ messageID: id, part });
      }
    });
    return groupParts(entries);
  }, [messageIDs, partsList, showReasoningSummaries]);

  const grouped = useStable(computed, sameGroups);
  const presented = useMemo(() => presentedFiles(partsList), [partsList]);
  const showPresented = !working && presented.length > 0;

  if (grouped.length === 0 && !showPresented) return null;

  return (
    <>
      {grouped.length > 0 && (
        <GroupedPartsRenderer
          grouped={grouped}
          partsIndex={partsIndex}
          messagesByID={messagesByID}
          busy={working}
          shellToolDefaultOpen={shellToolDefaultOpen}
          editToolDefaultOpen={editToolDefaultOpen}
        />
      )}
      {showPresented && <PresentedFiles files={presented} />}
    </>
  );
}

function isProseGroup(
  group: PartGroup,
  partsIndex: Map<string, Map<string, Part>>,
): boolean {
  if (group.type !== "part") return false;
  const part = partsIndex.get(group.ref.messageID)?.get(group.ref.partID);
  return part?.type === "text";
}

function isActivityGroup(
  group: PartGroup,
  partsIndex: Map<string, Map<string, Part>>,
): boolean {
  if (group.type === "context") return true;
  const part = partsIndex.get(group.ref.messageID)?.get(group.ref.partID);
  return (
    part?.type === "reasoning" ||
    (part?.type === "tool" && part.tool !== "question" && part.tool !== "task")
  );
}

function activityStatus(
  group: PartGroup,
  partsIndex: Map<string, Map<string, Part>>,
  mcpNames: readonly string[],
): string {
  const part =
    group.type === "part"
      ? partsIndex.get(group.ref.messageID)?.get(group.ref.partID)
      : undefined;
  const category = (() => {
    if (group.type === "context") return "context";
    if (!part) return undefined;
    return classifyActivityPart(part);
  })();

  switch (category) {
    case "thinking":
      return m.session_status_thinking();
    case "context":
      return m.session_status_gathering_context();
    case "modification":
      return m.session_activity_making_changes();
    case "command":
      return m.session_activity_running_command();
    case "skill":
      return m.session_activity_loading_skill();
    case "websearch":
      return m.session_status_searching_web();
    default: {
      const parsed =
        part?.type === "tool"
          ? parseMcpToolName(part.tool, mcpNames)
          : undefined;
      if (parsed) {
        return m.session_activity_using_connector({
          connector: mcpServerTitle(parsed.server),
        });
      }
      return m.session_activity_working();
    }
  }
}

function activitySummary(
  groups: PartGroup[],
  partsIndex: Map<string, Map<string, Part>>,
): string {
  const counts = new Map<
    Exclude<ActivityCategory, "thinking" | "websearch">,
    number
  >();
  const seen = new Set<string>();

  for (const group of groups) {
    const refs = group.type === "context" ? group.refs : [group.ref];
    for (const ref of refs) {
      const part = partsIndex.get(ref.messageID)?.get(ref.partID);
      if (
        part?.type !== "tool" ||
        part.state.status !== "completed" ||
        seen.has(part.id)
      )
        continue;
      seen.add(part.id);

      const category = classifyActivityPart(part);
      if (!category || category === "thinking") continue;
      // The summary counts web searches as context, like webfetch.
      const bucket = category === "websearch" ? "context" : category;
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
  }

  const entries = [...counts];
  const labels = (entries.length > 3 ? entries.slice(0, 2) : entries).map(
    ([category, count], index) => {
      switch (category) {
        case "context":
          return index === 0
            ? m.session_activity_summary_context()
            : m.session_activity_summary_context_following();
        case "modification":
          return count === 1
            ? m.session_activity_summary_modification_one({ count })
            : m.session_activity_summary_modification_other({ count });
        case "command":
          return count === 1
            ? m.session_activity_summary_command_one({ count })
            : m.session_activity_summary_command_other({ count });
        case "skill":
          return count === 1
            ? m.session_activity_summary_skill_one({ count })
            : m.session_activity_summary_skill_other({ count });
        case "other":
          return count === 1
            ? m.session_activity_summary_other_one({ count })
            : m.session_activity_summary_other_other({ count });
      }
    },
  );

  if (entries.length > 3) {
    const count = entries
      .slice(2)
      .reduce((total, [, value]) => total + value, 0);
    labels.push(m.session_activity_summary_more_other({ count }));
  }

  return (
    labels.join(m.common_list_separator()) ||
    m.session_activity_summary_completed()
  );
}

function GroupedPartsRenderer({
  grouped,
  partsIndex,
  messagesByID,
  busy,
  shellToolDefaultOpen,
  editToolDefaultOpen,
}: {
  grouped: PartGroup[];
  partsIndex: Map<string, Map<string, Part>>;
  messagesByID: Map<string, AssistantMessage>;
  busy?: boolean;
  shellToolDefaultOpen?: boolean;
  editToolDefaultOpen?: boolean;
}) {
  const { directory } = useSDK();
  const mcpNames = useChildData(
    directory,
    (s) => Object.keys(s.mcp),
    shallowArrayEqual,
  );
  const lastKey = grouped[grouped.length - 1]?.key;

  const renderGroup = (group: PartGroup) => {
    if (group.type === "context") {
      const parts = group.refs
        .map((ref) => partsIndex.get(ref.messageID)?.get(ref.partID))
        .filter((p): p is ToolPart => !!p && isContextGroupTool(p));
      if (parts.length === 0) return null;
      return (
        <ContextToolGroup
          key={group.key}
          parts={parts}
          busy={busy && group.key === lastKey}
        />
      );
    }
    const part = partsIndex.get(group.ref.messageID)?.get(group.ref.partID);
    if (!part || isPendingQuestion(part)) return null;
    const message = messagesByID.get(group.ref.messageID);
    const streaming = !!message && typeof message.time.completed !== "number";
    return (
      <Part
        key={group.key}
        part={part}
        streaming={streaming}
        defaultOpen={partDefaultOpen(
          part,
          shellToolDefaultOpen,
          editToolDefaultOpen,
        )}
      />
    );
  };

  const output: ReactNode[] = [];
  let prose: PartGroup[] = [];
  let activity: PartGroup[] = [];

  const flushProse = () => {
    if (prose.length === 0) return;
    const rendered = prose.map(renderGroup).filter(Boolean);
    if (rendered.length > 0) {
      output.push(
        <MessageContent key={`prose:${prose[0]!.key}`} className="gap-4">
          {rendered}
        </MessageContent>,
      );
    }
    prose = [];
  };

  const flushActivity = () => {
    if (activity.length === 0) return;
    const last = activity[activity.length - 1]!;
    const rendered = activity.map(renderGroup).filter(Boolean);
    if (rendered.length > 0) {
      output.push(
        <Activity
          key={`activity:${activity[0]!.key}`}
          running={busy && last.key === lastKey}
          status={activityStatus(last, partsIndex, mcpNames)}
          summary={activitySummary(activity, partsIndex)}
        >
          {rendered}
        </Activity>,
      );
    }
    activity = [];
  };

  for (const group of grouped) {
    if (isActivityGroup(group, partsIndex)) {
      flushProse();
      activity.push(group);
      continue;
    }

    flushActivity();
    if (isProseGroup(group, partsIndex)) {
      prose.push(group);
    } else {
      flushProse();
      output.push(renderGroup(group));
    }
  }
  flushProse();
  flushActivity();

  return <>{output}</>;
}
