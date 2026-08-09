import { CornerDownRightIcon, GlassesIcon } from "lucide-react";
import { useMemo } from "react";

import { useSDK } from "@/contexts/sdk";
import { getFilename, relativizePath } from "@/utils/path";

import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

const EMPTY_LOADED: string[] = [];

export function ReadTool(props: ToolProps) {
  const { directory } = useSDK();
  const args: string[] = [];
  if (typeof props.input.offset === "number")
    args.push("offset=" + String(props.input.offset));
  if (typeof props.input.limit === "number")
    args.push("limit=" + String(props.input.limit));

  const loaded = useMemo(() => {
    if (props.status !== "completed") return EMPTY_LOADED;
    const value = props.metadata.loaded;
    if (!value || !Array.isArray(value)) return EMPTY_LOADED;
    return value.filter((p): p is string => typeof p === "string");
  }, [props.status, props.metadata.loaded]);

  return (
    <>
      <BasicTool
        icon={<GlassesIcon />}
        title={m.session_tool_read()}
        subtitle={
          typeof props.input.filePath === "string" && props.input.filePath
            ? getFilename(props.input.filePath)
            : undefined
        }
        args={args}
        status={props.status}
        hideDetails={props.hideDetails}
      />
      {loaded.length > 0 && (
        <div className="space-y-1 py-1 pl-3">
          {loaded.map((filepath) => (
            <div
              key={filepath}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <CornerDownRightIcon className="size-3" />
              <span>
                {m.session_tool_read_loaded({
                  path: relativizePath(filepath, directory),
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
