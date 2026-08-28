// @opencode-ref: opencode/packages/session-ui/src/components/message-part.tsx
import type { TextPart as TextPartType } from "@opencode-ai/sdk/v2/client";

import { MessageResponse } from "@/components/ai-elements/message";
import { streamdownLinkSafety } from "@/components/session/external-link-dialog";

import { usePacedText } from "./paced-text";

export function TextPart({
  part,
  streaming,
}: {
  part: TextPartType;
  streaming?: boolean;
}) {
  const text = (part.text ?? "").trim();
  const paced = usePacedText(text, !!streaming);
  if (!paced) return null;
  return (
    <MessageResponse linkSafety={streamdownLinkSafety}>{paced}</MessageResponse>
  );
}
