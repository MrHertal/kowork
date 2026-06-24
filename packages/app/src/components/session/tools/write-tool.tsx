import { File as FileViewer } from "@pierre/diffs/react";
import { FileEditIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { getFilename } from "@/utils/path";

import {
  type Diagnostic,
  DiagnosticsDisplay,
  getDiagnostics,
} from "../diagnostics";
import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

export function WriteTool(props: ToolProps) {
  const { resolvedTheme } = useTheme();
  const themeType = resolvedTheme === "dark" ? "dark" : "light";
  const filePath = (props.input.filePath as string) ?? "";
  const filename = getFilename(filePath);
  const content = (props.input.content as string) ?? "";
  const diagnostics = getDiagnostics(
    props.metadata.diagnostics as Record<string, Diagnostic[]> | undefined,
    filePath,
  );

  return (
    <BasicTool
      icon={<FileEditIcon />}
      title={m.session_tool_write()}
      subtitle={filename}
      status={props.status}
      hideDetails={props.hideDetails}
      defaultOpen={props.defaultOpen}
    >
      {content && (
        <div className="max-h-96 overflow-auto rounded-md border">
          <FileViewer
            file={{ name: filePath, contents: content }}
            options={{
              theme: { dark: "pierre-dark", light: "pierre-light" },
              themeType,
            }}
          />
        </div>
      )}
      {diagnostics.length > 0 && (
        <DiagnosticsDisplay diagnostics={diagnostics} />
      )}
    </BasicTool>
  );
}
