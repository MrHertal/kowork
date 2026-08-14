import {
  OFFICE_FILE_MIMES,
  type OfficeAttachmentFormat,
} from "@/constants/file-picker";

export const OFFICE_ATTACHMENTS_METADATA_KEY = "koworkAttachments";

export type OfficeAttachmentsMetadata = {
  version: 1;
  items: Array<{
    filename: string;
    path: string;
    mime: string;
    format: OfficeAttachmentFormat;
  }>;
};

export type OfficeAttachmentMetadataItem =
  OfficeAttachmentsMetadata["items"][number];

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function format(value: unknown): value is OfficeAttachmentFormat {
  return value === "docx" || value === "xlsx" || value === "pptx";
}

export function officeAttachmentsFromMetadata(
  metadata: unknown,
): OfficeAttachmentMetadataItem[] {
  if (!record(metadata)) return [];
  const value = metadata[OFFICE_ATTACHMENTS_METADATA_KEY];
  if (!record(value) || value.version !== 1 || !Array.isArray(value.items))
    return [];
  return value.items.flatMap((item) => {
    if (!record(item)) return [];
    if (
      typeof item.filename !== "string" ||
      typeof item.path !== "string" ||
      typeof item.mime !== "string" ||
      !format(item.format) ||
      item.mime !== OFFICE_FILE_MIMES[item.format]
    )
      return [];
    return [
      {
        filename: item.filename,
        path: item.path,
        mime: item.mime,
        format: item.format,
      },
    ];
  });
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function officeAttachmentsPrompt(
  attachments: Array<{
    filename: string;
    path: string;
    mime: string;
    format: OfficeAttachmentFormat;
  }>,
) {
  const items: OfficeAttachmentsMetadata["items"] = attachments.map(
    ({ filename, path, mime, format }) => ({ filename, path, mime, format }),
  );
  const text = [
    "<kowork_attachments>",
    ...items.flatMap((attachment) => [
      "  <attachment>",
      `    <name>${escapeXml(attachment.filename)}</name>`,
      `    <path>${escapeXml(attachment.path)}</path>`,
      `    <format>${attachment.format}</format>`,
      "  </attachment>",
    ]),
    "</kowork_attachments>",
  ].join("\n");

  return {
    text,
    metadata: {
      [OFFICE_ATTACHMENTS_METADATA_KEY]: {
        version: 1,
        items,
      } satisfies OfficeAttachmentsMetadata,
    },
  };
}
