// @opencode-ref: opencode/packages/app/src/components/prompt-input/image-attachments.tsx

import { memo, useCallback, useMemo } from "react";
import {
  FileSpreadsheetIcon,
  FileTextIcon,
  PresentationIcon,
} from "lucide-react";
import {
  Attachment,
  type AttachmentData,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
  getAttachmentLabel,
  getMediaCategory,
} from "@/components/ai-elements/attachments";
import { type PromptAttachmentPart, usePrompt } from "@/contexts/prompt";
import { usePromptAttachments } from "./attachments";

interface PromptAttachmentItemProps {
  attachment: PromptAttachmentPart;
  onRemove: (id: string) => void;
}

const PromptAttachmentItem = memo(
  ({ attachment, onRemove }: PromptAttachmentItemProps) => {
    const data = useMemo<AttachmentData>(
      () => ({
        id: attachment.id,
        type: "file",
        filename: attachment.filename,
        mediaType: attachment.mime,
        url: attachment.blob?.url ?? "",
      }),
      [attachment],
    );
    const handleRemove = useCallback(
      () => onRemove(attachment.id),
      [onRemove, attachment.id],
    );
    const mediaCategory = getMediaCategory(data);
    const label = getAttachmentLabel(data);
    const format = attachment.local?.format;
    const Icon =
      format === "xlsx"
        ? FileSpreadsheetIcon
        : format === "pptx"
          ? PresentationIcon
          : FileTextIcon;
    return (
      <AttachmentHoverCard openDelay={200} closeDelay={300}>
        <AttachmentHoverCardTrigger asChild>
          <Attachment
            data={data}
            onRemove={handleRemove}
            className="cursor-default"
          >
            <div className="relative size-5 shrink-0">
              <div className="absolute inset-0 transition-opacity group-hover:opacity-0">
                <AttachmentPreview fallbackIcon={<Icon className="size-3" />} />
              </div>
              <AttachmentRemove className="absolute inset-0" />
            </div>
            <AttachmentInfo />
          </Attachment>
        </AttachmentHoverCardTrigger>
        <AttachmentHoverCardContent className="rounded-md">
          <div className="space-y-3">
            {attachment.blob &&
              mediaCategory === "image" &&
              data.type === "file" &&
              data.url && (
                <div className="flex max-h-96 w-80 items-center justify-center overflow-hidden rounded-md border">
                  <img
                    alt={label}
                    className="max-h-full max-w-full object-contain"
                    height={384}
                    src={data.url}
                    width={320}
                  />
                </div>
              )}
            <div className="space-y-1 px-0.5">
              <h4 className="text-sm leading-none font-semibold">{label}</h4>
              {data.mediaType && (
                <p className="font-mono text-xs text-muted-foreground">
                  {data.mediaType}
                </p>
              )}
            </div>
          </div>
        </AttachmentHoverCardContent>
      </AttachmentHoverCard>
    );
  },
);
PromptAttachmentItem.displayName = "PromptAttachmentItem";

export function PromptAttachments() {
  const { current } = usePrompt();
  const { removeAttachment } = usePromptAttachments();

  const attachments = useMemo(
    () =>
      current.filter(
        (part): part is PromptAttachmentPart => part.type === "attachment",
      ),
    [current],
  );

  if (attachments.length === 0) return null;

  return (
    <Attachments variant="inline" className="w-full px-3 pt-3">
      {attachments.map((attachment) => (
        <PromptAttachmentItem
          key={attachment.id}
          attachment={attachment}
          onRemove={removeAttachment}
        />
      ))}
    </Attachments>
  );
}
