import { GlobeIcon } from "lucide-react";

import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

export function webSearchBackendLabel(provider: unknown) {
  if (provider === "exa") return "Exa";
  if (provider === "parallel") return "Parallel";
  return undefined;
}

export function WebSearchTool(props: ToolProps) {
  const query =
    typeof props.input.query === "string" && props.input.query
      ? props.input.query
      : undefined;
  const backend = webSearchBackendLabel(props.metadata.provider);

  return (
    <BasicTool
      icon={<GlobeIcon />}
      title={
        backend
          ? m.session_tool_websearch_via({ provider: backend })
          : m.session_tool_websearch()
      }
      subtitle={query}
      status={props.status}
      hideDetails={props.hideDetails}
    >
      {props.output && (
        <div className="max-h-64 overflow-auto">
          <pre className="rounded-md bg-muted p-3 text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground">
            {props.output}
          </pre>
        </div>
      )}
    </BasicTool>
  );
}
