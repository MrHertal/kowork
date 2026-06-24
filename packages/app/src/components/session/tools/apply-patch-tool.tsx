import { CodeIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

import { Diff } from "../diff";
import { BasicTool, type ToolProps } from "./basic-tool";

interface ApplyPatchFile {
  filePath: string;
  relativePath: string;
  type: "add" | "update" | "delete" | "move";
  diff: string;
  before: string;
  after: string;
  movePath?: string;
}

const EMPTY_FILES: ApplyPatchFile[] = [];

const ACTION_LABELS: Record<
  ApplyPatchFile["type"],
  { label: () => string; className: string }
> = {
  add: { label: () => m.session_patch_created(), className: "text-green-600" },
  delete: { label: () => m.session_patch_deleted(), className: "text-red-600" },
  move: { label: () => m.session_patch_moved(), className: "text-blue-600" },
  update: {
    label: () => m.session_patch_patched(),
    className: "text-muted-foreground",
  },
};

export function ApplyPatchTool(props: ToolProps) {
  const files = (props.metadata.files ?? EMPTY_FILES) as ApplyPatchFile[];
  const subtitle =
    files.length > 0
      ? files.length === 1
        ? m.session_patch_file_count_one({ count: String(files.length) })
        : m.session_patch_file_count({ count: String(files.length) })
      : undefined;

  return (
    <BasicTool
      icon={<CodeIcon />}
      title={m.session_tool_patch()}
      subtitle={subtitle}
      status={props.status}
      hideDetails={props.hideDetails}
      defaultOpen={props.defaultOpen}
    >
      {files.length > 0 && (
        <div className="space-y-3 border-l-2 border-muted pl-4">
          {files.map((file) => {
            const action = ACTION_LABELS[file.type];
            return (
              <div key={file.filePath} className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className={cn("font-medium", action.className)}>
                    {action.label()}
                  </span>
                  {file.type === "delete" && (
                    <span className="truncate text-muted-foreground">
                      {file.relativePath}
                    </span>
                  )}
                </div>
                {file.type !== "delete" && (
                  <Diff
                    before={{ name: file.filePath, contents: file.before }}
                    after={{ name: file.filePath, contents: file.after }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </BasicTool>
  );
}
