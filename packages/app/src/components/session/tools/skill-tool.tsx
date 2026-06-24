import { GraduationCapIcon } from "lucide-react";

import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

export function SkillTool(props: ToolProps) {
  const name = props.input.name as string | undefined;

  return (
    <BasicTool
      icon={<GraduationCapIcon />}
      title={m.session_tool_skill()}
      subtitle={name || undefined}
      status={props.status}
      hideDetails
    />
  );
}
