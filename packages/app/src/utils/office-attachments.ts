import {
  OFFICE_FILE_MIMES,
  type OfficeAttachmentFormat,
} from "@/constants/file-picker";
import type {
  ImageAttachmentPart,
  OfficeAttachmentPart,
} from "@/contexts/prompt";

export const OFFICE_ATTACHMENTS_METADATA_KEY = "koworkAttachments";

export type OfficeAttachmentsMetadata = {
  version: 1;
  items: Array<{
    filename: string;
    path: string;
    mime: string;
    format: OfficeAttachmentFormat;
    position: number;
  }>;
};

export type OfficeAttachmentMetadataItem =
  OfficeAttachmentsMetadata["items"][number];

export function officeAttachmentMatchesServer(
  attachment: { serverKey: string },
  serverKey: string,
) {
  return attachment.serverKey === serverKey;
}

// Models without PDF input only get an error text for base64 PDF parts, so
// fall back to a path attachment when a local path was captured.
export function pdfFallbackOfficePart(
  part: ImageAttachmentPart,
  input: { pdfInput: boolean; serverKey: string },
): OfficeAttachmentPart | undefined {
  if (part.mime !== "application/pdf") return undefined;
  if (input.pdfInput) return undefined;
  if (!part.path || part.serverKey !== input.serverKey) return undefined;
  return {
    type: "office",
    id: part.id,
    filename: part.filename,
    mime: part.mime,
    path: part.path,
    format: "pdf",
    serverKey: part.serverKey,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function format(value: unknown): value is OfficeAttachmentFormat {
  return typeof value === "string" && value in OFFICE_FILE_MIMES;
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
      typeof item.position !== "number" ||
      !Number.isSafeInteger(item.position) ||
      item.position < 1 ||
      item.mime !== OFFICE_FILE_MIMES[item.format]
    )
      return [];
    return [
      {
        filename: item.filename,
        path: item.path,
        mime: item.mime,
        format: item.format,
        position: item.position,
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
    position: number;
  }>,
) {
  const items: OfficeAttachmentsMetadata["items"] = attachments.map(
    ({ filename, path, mime, format, position }) => ({
      filename,
      path,
      mime,
      format,
      position,
    }),
  );
  const text = [
    "<kowork_attachments>",
    ...items.flatMap((attachment) => [
      "  <attachment>",
      `    <name>${escapeXml(attachment.filename)}</name>`,
      `    <path>${escapeXml(attachment.path)}</path>`,
      `    <format>${attachment.format}</format>`,
      `    <position>${attachment.position}</position>`,
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
