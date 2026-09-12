import type { PromptAttachmentPart } from "@/contexts/prompt";
import {
  localAttachmentMatchesServer,
  type LocalAttachmentPromptItem,
} from "@/utils/local-attachments";

export type AttachmentDeliveryPlan = {
  attachment: PromptAttachmentPart;
  position: number;
  includeModelPayload: boolean;
  local?: LocalAttachmentPromptItem;
};

export function planAttachmentDelivery(
  attachments: PromptAttachmentPart[],
  input: { pdfInput: boolean; serverKey: string },
): AttachmentDeliveryPlan[] {
  return attachments.map((attachment, index) => {
    const position = index + 1;
    const local =
      attachment.local &&
      localAttachmentMatchesServer(attachment.local, input.serverKey)
        ? {
            id: attachment.id,
            filename: attachment.filename,
            path: attachment.local.path,
            mime: attachment.mime,
            format: attachment.local.format,
            position,
          }
        : undefined;
    const pdf = attachment.mime === "application/pdf";
    return {
      attachment,
      position,
      includeModelPayload:
        !!attachment.blob && (!pdf || input.pdfInput || !local),
      ...(local ? { local } : {}),
    };
  });
}
