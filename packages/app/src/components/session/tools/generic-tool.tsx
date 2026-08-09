import { WrenchIcon } from "lucide-react";

import { getToolTitle } from "../tool-title";
import { BasicTool, type ToolProps } from "./basic-tool";

export function GenericTool(props: ToolProps) {
  return (
    <BasicTool
      icon={<WrenchIcon />}
      title={getToolTitle(props.tool)}
      status={props.status}
      hideDetails={props.hideDetails}
    />
  );
}
