import {
  LOCAL_ATTACHMENT_MIMES,
  type LocalAttachmentFormat,
} from "@/constants/file-picker";
import type {
  ImageAttachmentPart,
  LocalAttachmentPart,
} from "@/contexts/prompt";

export const LOCAL_ATTACHMENTS_METADATA_KEY = "koworkAttachments";

export type LocalAttachmentsMetadata = {
  version: 1;
  items: Array<{
    filename: string;
    path: string;
    mime: string;
    format: LocalAttachmentFormat;
    position: number;
  }>;
};

export type LocalAttachmentMetadataItem =
  LocalAttachmentsMetadata["items"][number];

export function localAttachmentMatchesServer(
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
): LocalAttachmentPart | undefined {
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

function format(value: unknown): value is LocalAttachmentFormat {
  return typeof value === "string" && value in LOCAL_ATTACHMENT_MIMES;
}

export function localAttachmentsFromMetadata(
  metadata: unknown,
): LocalAttachmentMetadataItem[] {
  if (!record(metadata)) return [];
  const value = metadata[LOCAL_ATTACHMENTS_METADATA_KEY];
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
      item.mime !== LOCAL_ATTACHMENT_MIMES[item.format]
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

export function localAttachmentsPrompt(
  attachments: Array<{
    filename: string;
    path: string;
    mime: string;
    format: LocalAttachmentFormat;
    position: number;
  }>,
) {
  const items: LocalAttachmentsMetadata["items"] = attachments.map(
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
      [LOCAL_ATTACHMENTS_METADATA_KEY]: {
        version: 1,
        items,
      } satisfies LocalAttachmentsMetadata,
    },
  };
}
