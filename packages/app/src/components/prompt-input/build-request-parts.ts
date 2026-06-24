// @opencode-ref: opencode/packages/app/src/components/prompt-input/build-request-parts.ts (image attachments only)

import type {
  FilePartInput,
  Part,
  TextPartInput,
} from "@opencode-ai/sdk/v2/client";
import type { ImageAttachmentPart } from "@/contexts/prompt";
import { ascending } from "@/utils/id";

type PromptRequestPart = (TextPartInput | FilePartInput) & { id: string };

type BuildRequestPartsInput = {
  text: string;
  images: ImageAttachmentPart[];
  messageID: string;
  sessionID: string;
};

function toOptimisticPart(
  part: PromptRequestPart,
  sessionID: string,
  messageID: string,
): Part {
  if (part.type === "text") {
    return {
      id: part.id,
      type: "text",
      text: part.text,
      synthetic: part.synthetic,
      ignored: part.ignored,
      time: part.time,
      metadata: part.metadata,
      sessionID,
      messageID,
    };
  }
  return {
    id: part.id,
    type: "file",
    mime: part.mime,
    filename: part.filename,
    url: part.url,
    source: part.source,
    sessionID,
    messageID,
  };
}

export function buildRequestParts(input: BuildRequestPartsInput) {
  const requestParts: PromptRequestPart[] = [
    {
      id: ascending("part"),
      type: "text",
      text: input.text,
    },
  ];

  const images = input.images.map(
    (attachment) =>
      ({
        id: ascending("part"),
        type: "file",
        mime: attachment.mime,
        url: attachment.dataUrl,
        filename: attachment.filename,
      }) satisfies PromptRequestPart,
  );

  requestParts.push(...images);

  return {
    requestParts,
    optimisticParts: requestParts.map((part) =>
      toOptimisticPart(part, input.sessionID, input.messageID),
    ),
  };
}
