import { FileEditIcon } from "lucide-react";

import { getFilename } from "@/utils/path";

import {
  type Diagnostic,
  DiagnosticsDisplay,
  getDiagnostics,
} from "../diagnostics";
import { Diff } from "../diff";
import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

interface FileDiff {
  path?: string;
  file?: string;
  before?: string;
  after?: string;
}

export function EditTool(props: ToolProps) {
  const filePath = (props.input.filePath as string) ?? "";
  const filename = getFilename(filePath);
  const filediff = props.metadata.filediff as FileDiff | undefined;
  const diagnostics = getDiagnostics(
    props.metadata.diagnostics as Record<string, Diagnostic[]> | undefined,
    filePath,
  );

  const before = {
    name: filediff?.file || filePath,
    contents: filediff?.before || (props.input.oldString as string) || "",
  };
  const after = {
    name: filediff?.file || filePath,
    contents: filediff?.after || (props.input.newString as string) || "",
  };

  const hasDiff = before.contents || after.contents;

  return (
    <BasicTool
      icon={<FileEditIcon />}
      title={m.session_tool_edit()}
      subtitle={filename}
      status={props.status}
      hideDetails={props.hideDetails}
      defaultOpen={props.defaultOpen}
    >
      {hasDiff && <Diff before={before} after={after} />}
      {diagnostics.length > 0 && (
        <DiagnosticsDisplay diagnostics={diagnostics} />
      )}
    </BasicTool>
  );
}
