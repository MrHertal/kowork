import type {
  AssistantMessage,
  Part,
  ToolPart,
} from "@opencode-ai/sdk/v2/client";
import { type ReactNode, useEffect, useMemo, useRef } from "react";

import { MessageContent } from "@/components/ai-elements/message";
import { shallowArrayEqual, useChildData } from "@/contexts/global-sync";
import { useSDK } from "@/contexts/sdk";

import { m } from "@/paraglide/messages";

import { CompactionPart } from "./parts/compaction-part";
import { ReasoningPart } from "./parts/reasoning-part";
import { TextPart } from "./parts/text-part";
import {
  ContextToolGroup,
  isContextGroupTool,
} from "./tools/context-tool-group";
import type { ToolProps } from "./tools/basic-tool";
import { GenericTool } from "./tools/generic-tool";
import { McpTool, parseMcpToolName } from "./tools/mcp-tool";
import { ToolErrorCard } from "./tools/tool-error-card";
import { ToolRegistry } from "./tool-registry";
import "./tool-registrations";

const emptyInput: Record<string, unknown> = {};
const emptyMetadata: Record<string, unknown> = {};
const emptyParts: Part[] = [];

function toolDefaultOpen(tool: string, shell = false, edit = false) {
  if (tool === "bash") return shell;
  if (tool === "edit" || tool === "write" || tool === "apply_patch")
    return edit;
}

function partDefaultOpen(part: Part, shell = false, edit = false) {
  if (part.type !== "tool") return undefined;
  return toolDefaultOpen(part.tool, shell, edit);
}

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
      <ToolErrorCard
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
    const Renderer = registered;
    return (
      <Renderer
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

const HIDDEN_TOOLS = new Set(["todowrite"]);

export function renderable(part: Part, showReasoningSummaries = true): boolean {
  switch (part.type) {
    case "tool":
      if (HIDDEN_TOOLS.has(part.tool)) return false;
      if (
        part.tool === "question" &&
        (part.state.status === "pending" || part.state.status === "running")
      )
        return false;
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
  const ref = useRef(value);
  const result = equals(ref.current, value) ? ref.current : value;
  useEffect(() => {
    ref.current = result;
  }, [result]);
  return result;
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
        if (!renderable(part, showReasoningSummaries)) continue;
        entries.push({ messageID: id, part });
      }
    });
    return groupParts(entries);
  }, [messageIDs, partsList, showReasoningSummaries]);

  const grouped = useStable(computed, sameGroups);

  if (grouped.length === 0) return null;

  return (
    <GroupedPartsRenderer
      grouped={grouped}
      partsIndex={partsIndex}
      messagesByID={messagesByID}
      busy={working}
      shellToolDefaultOpen={shellToolDefaultOpen}
      editToolDefaultOpen={editToolDefaultOpen}
    />
  );
}

function isProseGroup(
  group: PartGroup,
  partsIndex: Map<string, Map<string, Part>>,
): boolean {
  if (group.type !== "part") return false;
  const part = partsIndex.get(group.ref.messageID)?.get(group.ref.partID);
  return part?.type === "text" || part?.type === "reasoning";
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
    if (!part) return null;
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

  for (const group of grouped) {
    if (isProseGroup(group, partsIndex)) {
      prose.push(group);
    } else {
      flushProse();
      output.push(renderGroup(group));
    }
  }
  flushProse();

  return <>{output}</>;
}
