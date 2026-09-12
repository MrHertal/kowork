// @opencode-ref: opencode/packages/app/src/components/prompt-input/build-request-parts.ts (image attachments only)

import type {
  FilePartInput,
  Part,
  TextPartInput,
} from "@opencode-ai/sdk/v2/client";
import type {
  PromptAttachmentPart,
} from "@/contexts/prompt";
import { ascending } from "@/utils/id";
import { localAttachmentsPrompt } from "@/utils/local-attachments";

type PromptRequestPart = (TextPartInput | FilePartInput) & { id: string };

export type EncodedPromptAttachmentPart = Omit<PromptAttachmentPart, "blob"> & {
  dataUrl?: string;
};

type BuildRequestPartsInput = {
  text: string;
  attachments: EncodedPromptAttachmentPart[];
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
  const requestParts: PromptRequestPart[] = input.text.trim()
    ? [
        {
          id: ascending("part"),
          type: "text",
          text: input.text,
        },
      ]
    : [];

  const images = input.attachments.flatMap((attachment) =>
    attachment.dataUrl
      ? [
          {
            id: ascending("part"),
            type: "file" as const,
            mime: attachment.mime,
            url: attachment.dataUrl,
            filename: attachment.filename,
          } satisfies PromptRequestPart,
        ]
      : [],
  );

  const locals = input.attachments.flatMap((attachment, index) =>
    attachment.local
      ? [
          {
            id: attachment.id,
            filename: attachment.filename,
            mime: attachment.mime,
            ...attachment.local,
            position: index + 1,
          },
        ]
      : [],
  );
  if (locals.length > 0) {
    const attachmentContext = localAttachmentsPrompt(locals);
    requestParts.push({
      id: ascending("part"),
      type: "text",
      text: attachmentContext.text,
      synthetic: true,
      metadata: attachmentContext.metadata,
    });
  }

  requestParts.push(...images);

  return {
    requestParts,
    optimisticParts: requestParts.map((part) =>
      toOptimisticPart(part, input.sessionID, input.messageID),
    ),
  };
}
