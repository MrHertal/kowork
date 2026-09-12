import type { PromptAttachmentPart } from "@/contexts/prompt";
import { blobDataUrl } from "@/utils/blob";
import { planAttachmentDelivery } from "@/utils/attachment-delivery";
import { buildRequestParts } from "@/components/prompt-input/build-request-parts";

export async function preparePromptRequest(input: {
  text: string;
  attachments: PromptAttachmentPart[];
  pdfInput: boolean;
  serverKey: string;
  messageID: string;
  sessionID: string;
}) {
  const deliveries = planAttachmentDelivery(input.attachments, {
    pdfInput: input.pdfInput,
    serverKey: input.serverKey,
  });
  const encodedDeliveries = await Promise.all(
    deliveries.map(async (delivery) =>
      delivery.includeModelPayload && delivery.attachment.blob
        ? {
            ...delivery,
            dataUrl: await blobDataUrl(
              delivery.attachment.blob,
              delivery.attachment.mime,
            ),
          }
        : delivery,
    ),
  );
  return buildRequestParts({
    text: input.text,
    deliveries: encodedDeliveries,
    messageID: input.messageID,
    sessionID: input.sessionID,
  });
}
