import type { ToolPart } from "@opencode-ai/sdk/v2/client";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { TaskItem, TaskItemFile } from "@/components/ai-elements/task";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useSDK } from "@/contexts/sdk";
import { m } from "@/paraglide/messages";
import { getDirectory, getFilename, relativizePath } from "@/utils/path";

export const CONTEXT_GROUP_TOOLS = new Set(["read", "glob", "grep", "list"]);

export function isContextGroupTool(part: { type: string; tool?: string }) {
  return part.type === "tool" && CONTEXT_GROUP_TOOLS.has(part.tool ?? "");
}

function contextToolSummary(parts: ToolPart[]) {
  const read = parts.filter((p) => p.tool === "read").length;
  const search = parts.filter(
    (p) => p.tool === "glob" || p.tool === "grep",
  ).length;
  const list = parts.filter((p) => p.tool === "list").length;
  return { read, search, list };
}

function formatSummary(summary: {
  read: number;
  search: number;
  list: number;
}) {
  const parts: string[] = [];
  if (summary.read > 0) {
    parts.push(
      summary.read === 1
        ? m.session_context_read_one({ count: summary.read })
        : m.session_context_read_other({ count: summary.read }),
    );
  }
  if (summary.search > 0) {
    parts.push(
      summary.search === 1
        ? m.session_context_search_one({ count: summary.search })
        : m.session_context_search_other({ count: summary.search }),
    );
  }
  if (summary.list > 0) {
    parts.push(
      summary.list === 1
        ? m.session_context_list_one({ count: summary.list })
        : m.session_context_list_other({ count: summary.list }),
    );
  }
  return parts.join(m.common_list_separator());
}

function contextToolTrigger(
  part: ToolPart,
  directory: string,
): { title: string; subtitle: string; args: string[] } {
  const input = (part.state.input ?? {}) as Record<string, unknown>;
  const path = typeof input.path === "string" ? input.path : "/";
  const filePath =
    typeof input.filePath === "string" ? input.filePath : undefined;
  const pattern = typeof input.pattern === "string" ? input.pattern : undefined;
  const include = typeof input.include === "string" ? input.include : undefined;
  const offset = typeof input.offset === "number" ? input.offset : undefined;
  const limit = typeof input.limit === "number" ? input.limit : undefined;

  switch (part.tool) {
    case "read": {
      const args: string[] = [];
      if (offset !== undefined) args.push("offset=" + offset);
      if (limit !== undefined) args.push("limit=" + limit);
      return {
        title: m.session_tool_read(),
        subtitle: filePath
          ? relativizePath(getFilename(filePath), directory)
          : "",
        args,
      };
    }
    case "list":
      return {
        title: m.session_tool_list(),
        subtitle: relativizePath(getDirectory(path), directory),
        args: [],
      };
    case "glob":
      return {
        title: m.session_tool_glob(),
        subtitle: relativizePath(getDirectory(path), directory),
        args: pattern ? ["pattern=" + pattern] : [],
      };
    case "grep": {
      const args: string[] = [];
      if (pattern) args.push("pattern=" + pattern);
      if (include) args.push("include=" + include);
      return {
        title: m.session_tool_grep(),
        subtitle: relativizePath(getDirectory(path), directory),
        args,
      };
    }
    default:
      return { title: part.tool, subtitle: "", args: [] };
  }
}

export function ContextToolGroup(props: { parts: ToolPart[]; busy?: boolean }) {
  const { directory } = useSDK();
  const [open, setOpen] = useState(false);

  const pending = useMemo(
    () =>
      !!props.busy ||
      props.parts.some(
        (part) =>
          part.state.status === "pending" || part.state.status === "running",
      ),
    [props.busy, props.parts],
  );

  const summary = useMemo(() => contextToolSummary(props.parts), [props.parts]);
  const summaryText = useMemo(() => formatSummary(summary), [summary]);

  const title = pending
    ? m.session_context_gathering()
    : m.session_context_gathered();
  const subtitle = pending ? "" : summaryText;

  const handleOpenChange = (value: boolean) => {
    if (pending) return;
    setOpen(value);
  };

  return (
    <Collapsible className="group" open={open} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger
        className={cn(
          "flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors",
          !pending && "hover:text-foreground",
        )}
      >
        <SearchIcon className="size-4 shrink-0" />
        {pending ? (
          <Shimmer as="span" duration={1}>
            {title}
          </Shimmer>
        ) : (
          <>
            <span className="font-medium">{title}</span>
            {subtitle && <span className="truncate">{subtitle}</span>}
          </>
        )}
        {!pending && (
          <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden text-sm outline-none data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="pt-4">
          <div className="space-y-2 border-l-2 border-muted pl-4">
            {props.parts.map((part) => {
              const trigger = contextToolTrigger(part, directory);
              const running =
                part.state.status === "pending" ||
                part.state.status === "running";
              return (
                <TaskItem key={part.id}>
                  <span className="inline-flex items-center gap-2">
                    <span className="shrink-0">
                      {running ? (
                        <Shimmer as="span" duration={1}>
                          {trigger.title}
                        </Shimmer>
                      ) : (
                        trigger.title
                      )}
                    </span>
                    {!running && trigger.subtitle && (
                      <TaskItemFile>{trigger.subtitle}</TaskItemFile>
                    )}
                    {!running &&
                      trigger.args.map((arg) => (
                        <span key={arg} className="text-xs">
                          {arg}
                        </span>
                      ))}
                  </span>
                </TaskItem>
              );
            })}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
