import { POPULAR_MCP } from "@/data/popular-mcp";

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

export function humanize(value: string): string {
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

export function mcpServerTitle(server: string): string {
  const popular = POPULAR_MCP.find((p) => p.id === server);
  return popular?.name ?? humanize(server);
}
