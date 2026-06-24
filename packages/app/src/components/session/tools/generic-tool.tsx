import { WrenchIcon } from "lucide-react";

import { BasicTool, type ToolProps } from "./basic-tool";

export function GenericTool(props: ToolProps) {
  return (
    <BasicTool
      icon={<WrenchIcon />}
      title={props.tool}
      status={props.status}
      hideDetails={props.hideDetails}
    />
  );
}
