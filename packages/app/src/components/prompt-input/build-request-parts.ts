// @opencode-ref: opencode/packages/app/src/components/prompt-input/build-request-parts.ts (image attachments only)

import type {
  FilePartInput,
  Part,
  TextPartInput,
} from "@opencode-ai/sdk/v2/client";
import type { AttachmentDeliveryPlan } from "@/utils/attachment-delivery";
import { ascending } from "@/utils/id";
import { localAttachmentsPrompt } from "@/utils/local-attachments";

type PromptRequestPart = (TextPartInput | FilePartInput) & { id: string };

export type EncodedAttachmentDelivery = AttachmentDeliveryPlan & {
  dataUrl?: string;
};

type BuildRequestPartsInput = {
  text: string;
  deliveries: EncodedAttachmentDelivery[];
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

  const modelAttachments = input.deliveries.flatMap((delivery) =>
    delivery.dataUrl
      ? [
          {
            attachmentID: delivery.attachment.id,
            part: {
              id: ascending("part"),
              type: "file" as const,
              mime: delivery.attachment.mime,
              url: delivery.dataUrl,
              filename: delivery.attachment.filename,
            } satisfies PromptRequestPart,
          },
        ]
      : [],
  );
  const modelPartIDs = new Map(
    modelAttachments.map(({ attachmentID, part }) => [attachmentID, part.id]),
  );

  const locals = input.deliveries.flatMap((delivery) => {
    if (!delivery.local) return [];
    const modelPartID = modelPartIDs.get(delivery.attachment.id);
    return [
      {
        ...delivery.local,
        ...(modelPartID ? { modelPartID } : {}),
      },
    ];
  });
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

  requestParts.push(...modelAttachments.map(({ part }) => part));

  return {
    requestParts,
    optimisticParts: requestParts.map((part) =>
      toOptimisticPart(part, input.sessionID, input.messageID),
    ),
  };
}
