// @opencode-ref: opencode/packages/session-ui/src/components/message-part.tsx
import type { ReasoningPart as ReasoningPartType } from "@opencode-ai/sdk/v2/client";
import { Streamdown } from "streamdown";

import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Reasoning,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { streamdownLinkSafety } from "@/components/session/external-link-dialog";
import { CollapsibleContent } from "@/components/ui/collapsible";
import { m } from "@/paraglide/messages";

import { usePacedText } from "./paced-text";

const getThinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming || duration === 0) {
    return (
      <Shimmer as="span" duration={1}>
        {m.session_status_thinking()}
      </Shimmer>
    );
  }
  if (duration === undefined) {
    return (
      <span className="font-medium">
        {m.session_reasoning_thought_few_seconds()}
      </span>
    );
  }
  return (
    <span className="font-medium">
      {duration === 1
        ? m.session_reasoning_thought_seconds_one({ count: duration })
        : m.session_reasoning_thought_seconds_other({ count: duration })}
    </span>
  );
};

export function ReasoningPart({
  part,
  streaming,
}: {
  part: ReasoningPartType;
  streaming?: boolean;
}) {
  const text = part.text?.trim() ?? "";
  const isStreaming = streaming === true && !part.time?.end;
  const paced = usePacedText(text, isStreaming);
  if (!paced) return null;
  return (
    <Reasoning className="mb-0" isStreaming={isStreaming}>
      <ReasoningTrigger
        className="w-fit"
        getThinkingMessage={getThinkingMessage}
      />
      <CollapsibleContent className="overflow-hidden text-sm text-muted-foreground outline-none data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="pt-4">
          <div className="border-l-2 border-muted pl-4">
            <Streamdown linkSafety={streamdownLinkSafety}>{paced}</Streamdown>
          </div>
        </div>
      </CollapsibleContent>
    </Reasoning>
  );
}
