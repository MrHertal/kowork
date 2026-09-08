import { WrenchIcon } from "lucide-react";

import { POPULAR_MCP } from "@/data/popular-mcp";
import { cn } from "@/lib/utils";
import { humanize, mcpServerTitle } from "@/utils/mcp";
export { humanize, mcpServerTitle, parseMcpToolName } from "@/utils/mcp";

import { BasicTool, type ToolProps } from "./basic-tool";

interface McpToolProps extends ToolProps {
  server: string;
  mcpTool: string;
}

export function McpTool({ server, mcpTool, ...props }: McpToolProps) {
  const popular = POPULAR_MCP.find((p) => p.id === server);

  const icon = popular?.logo ? (
    <img
      src={popular.logo}
      alt=""
      className={cn("size-4", popular.logoClassName)}
    />
  ) : (
    <WrenchIcon />
  );

  const title = mcpServerTitle(server);
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
