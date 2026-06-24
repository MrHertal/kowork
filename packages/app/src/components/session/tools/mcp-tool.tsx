import { WrenchIcon } from "lucide-react";

import { POPULAR_MCP } from "@/data/popular-mcp";

import { BasicTool, type ToolProps } from "./basic-tool";

// OpenCode constructs MCP tool names as `<server>_<tool>` (see
// opencode/packages/opencode/src/mcp/index.ts). Server names may contain
// underscores, so we resolve by longest-prefix match against the list of
// installed servers rather than splitting on the first underscore.
export function parseMcpToolName(
  toolName: string,
  serverNames: readonly string[],
): { server: string; tool: string } | undefined {
  const sorted = [...serverNames].sort((a, b) => b.length - a.length);
  for (const server of sorted) {
    const prefix = server + "_";
    if (toolName.startsWith(prefix)) {
      return { server, tool: toolName.slice(prefix.length) };
    }
  }
  return undefined;
}

function humanize(value: string): string {
  const words = value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const first = words[0];
  if (!first) return value;
  return [first[0]!.toUpperCase() + first.slice(1), ...words.slice(1)].join(
    " ",
  );
}

interface McpToolProps extends ToolProps {
  server: string;
  mcpTool: string;
}

export function McpTool({ server, mcpTool, ...props }: McpToolProps) {
  const popular = POPULAR_MCP.find((p) => p.id === server);

  const icon = popular?.logo ? (
    <img src={popular.logo} alt="" className="size-4" />
  ) : (
    <WrenchIcon />
  );

  const title = popular?.name ?? humanize(server);
  const subtitle = mcpTool ? humanize(mcpTool) : undefined;

  return (
    <BasicTool
      icon={icon}
      title={title}
      subtitle={subtitle}
      status={props.status}
      hideDetails={props.hideDetails}
      defaultOpen={props.defaultOpen}
    />
  );
}
