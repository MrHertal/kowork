import { ExternalLinkIcon, GlobeIcon } from "lucide-react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { usePlatform } from "@/contexts/platform";

import { MessageResponse } from "@/components/ai-elements/message";

import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

export function WebFetchTool(props: ToolProps) {
  const { openLink } = usePlatform();
  const url = props.input.url as string | undefined;
  const format = props.input.format as string | undefined;
  const isMarkdown = format === "markdown";
  const pending = props.status === "pending" || props.status === "running";
  const title = m.session_tool_webfetch();

  const trigger = (
    <div className="flex min-w-0 items-center gap-2">
      <GlobeIcon className="size-4 shrink-0" />
      <span className="shrink-0 font-medium">
        {pending ? (
          <Shimmer as="span" duration={1}>
            {title}
          </Shimmer>
        ) : (
          title
        )}
      </span>
      {!pending && url && <span className="truncate">{url}</span>}
    </div>
  );

  return (
    <BasicTool
      trigger={trigger}
      status={props.status}
      hideDetails={props.hideDetails}
      action={
        !pending && url ? (
          <a
            href={url}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openLink(url);
            }}
          >
            <ExternalLinkIcon className="size-4 shrink-0" />
          </a>
        ) : undefined
      }
    >
      {props.output &&
        (isMarkdown ? (
          <div className="max-h-64 overflow-auto border-l-2 border-muted pl-4">
            <MessageResponse>{props.output}</MessageResponse>
          </div>
        ) : (
          <div className="max-h-64 overflow-auto">
            <pre className="rounded-md bg-muted p-3 text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground">
              {props.output}
            </pre>
          </div>
        ))}
    </BasicTool>
  );
}
