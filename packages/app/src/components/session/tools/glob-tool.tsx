import { SearchIcon } from "lucide-react";

import { useSDK } from "@/contexts/sdk";
import { getDirectory, relativizePath } from "@/utils/path";

import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

export function GlobTool(props: ToolProps) {
  const { directory } = useSDK();
  return (
    <BasicTool
      icon={<SearchIcon />}
      title={m.session_tool_glob()}
      subtitle={relativizePath(
        getDirectory((props.input.path as string | undefined) || "/"),
        directory,
      )}
      args={
        typeof props.input.pattern === "string" && props.input.pattern
          ? ["pattern=" + props.input.pattern]
          : []
      }
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
