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
import {
  type ImageAttachmentPart,
  type OfficeAttachmentPart,
  usePrompt,
} from "@/contexts/prompt";
import { usePromptAttachments } from "./attachments";

interface ImageAttachmentItemProps {
  attachment: ImageAttachmentPart;
  onRemove: (id: string) => void;
}

const ImageAttachmentItem = memo(
  ({ attachment, onRemove }: ImageAttachmentItemProps) => {
    const data = useMemo<AttachmentData>(
      () => ({
        id: attachment.id,
        type: "file",
        filename: attachment.filename,
        mediaType: attachment.mime,
        url: attachment.dataUrl,
      }),
      [attachment.id, attachment.filename, attachment.mime, attachment.dataUrl],
    );
    const handleRemove = useCallback(
      () => onRemove(attachment.id),
      [onRemove, attachment.id],
    );
    const mediaCategory = getMediaCategory(data);
    const label = getAttachmentLabel(data);
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
                <AttachmentPreview />
              </div>
              <AttachmentRemove className="absolute inset-0" />
            </div>
            <AttachmentInfo />
          </Attachment>
        </AttachmentHoverCardTrigger>
        <AttachmentHoverCardContent className="rounded-md">
          <div className="space-y-3">
            {mediaCategory === "image" && data.type === "file" && data.url && (
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
ImageAttachmentItem.displayName = "ImageAttachmentItem";

interface OfficeAttachmentItemProps {
  attachment: OfficeAttachmentPart;
  onRemove: (id: string) => void;
}

const OfficeAttachmentItem = memo(
  ({ attachment, onRemove }: OfficeAttachmentItemProps) => {
    const data = useMemo<AttachmentData>(
      () => ({
        id: attachment.id,
        type: "file",
        filename: attachment.filename,
        mediaType: attachment.mime,
        url: "",
      }),
      [attachment.id, attachment.filename, attachment.mime],
    );
    const handleRemove = useCallback(
      () => onRemove(attachment.id),
      [onRemove, attachment.id],
    );
    const Icon =
      attachment.format === "xlsx"
        ? FileSpreadsheetIcon
        : attachment.format === "pptx"
          ? PresentationIcon
          : FileTextIcon;
    return (
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
    );
  },
);
OfficeAttachmentItem.displayName = "OfficeAttachmentItem";

export function PromptAttachments() {
  const { current } = usePrompt();
  const { removeAttachment } = usePromptAttachments();

  const images = useMemo(
    () =>
      current.filter(
        (part): part is ImageAttachmentPart => part.type === "image",
      ),
    [current],
  );
  const office = useMemo(
    () =>
      current.filter(
        (part): part is OfficeAttachmentPart => part.type === "office",
      ),
    [current],
  );

  if (images.length === 0 && office.length === 0) return null;

  return (
    <Attachments variant="inline" className="w-full px-3 pt-3">
      {images.map((attachment) => (
        <ImageAttachmentItem
          key={attachment.id}
          attachment={attachment}
          onRemove={removeAttachment}
        />
      ))}
      {office.map((attachment) => (
        <OfficeAttachmentItem
          key={attachment.id}
          attachment={attachment}
          onRemove={removeAttachment}
        />
      ))}
    </Attachments>
  );
}
