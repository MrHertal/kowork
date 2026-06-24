import { ListIcon } from "lucide-react";

import { useSDK } from "@/contexts/sdk";
import { getDirectory, relativizePath } from "@/utils/path";

import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

export function ListTool(props: ToolProps) {
  const { directory } = useSDK();
  return (
    <BasicTool
      icon={<ListIcon />}
      title={m.session_tool_list()}
      subtitle={relativizePath(
        getDirectory((props.input.path as string | undefined) || "/"),
        directory,
      )}
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
