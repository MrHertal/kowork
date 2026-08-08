import { SearchIcon } from "lucide-react";

import { useSDK } from "@/contexts/sdk";
import { getDirectory, relativizePath } from "@/utils/path";

import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

export function GrepTool(props: ToolProps) {
  const { directory } = useSDK();
  const args: string[] = [];
  if (typeof props.input.pattern === "string" && props.input.pattern)
    args.push("pattern=" + props.input.pattern);
  if (typeof props.input.include === "string" && props.input.include)
    args.push("include=" + props.input.include);

  return (
    <BasicTool
      icon={<SearchIcon />}
      title={m.session_tool_grep()}
      subtitle={relativizePath(
        getDirectory((props.input.path as string | undefined) || "/"),
        directory,
      )}
      args={args}
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
