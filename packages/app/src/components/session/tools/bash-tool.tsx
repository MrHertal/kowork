import { TerminalSquareIcon } from "lucide-react";

import {
  Terminal,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalTitle,
} from "@/components/ai-elements/terminal";

import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

export function BashTool(props: ToolProps) {
  const command = (props.input.command ??
    props.metadata.command ??
    "") as string;
  const output = (props.output || props.metadata.output || "") as string;

  const fullOutput = command
    ? output
      ? `$ ${command}\n\n${output}`
      : `$ ${command}`
    : output;

  return (
    <BasicTool
      icon={<TerminalSquareIcon />}
      title={m.session_tool_shell()}
      subtitle={props.input.description as string | undefined}
      status={props.status}
      hideDetails={props.hideDetails}
      defaultOpen={props.defaultOpen}
    >
      {fullOutput && (
        <Terminal
          className="rounded-md"
          output={fullOutput}
          isStreaming={props.status === "running"}
        >
          <TerminalHeader>
            <TerminalTitle />
            <TerminalCopyButton />
          </TerminalHeader>
          <TerminalContent className="max-h-64" />
        </Terminal>
      )}
    </BasicTool>
  );
}
