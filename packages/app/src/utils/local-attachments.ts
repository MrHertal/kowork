import {
  LOCAL_ATTACHMENT_MIMES,
  type LocalAttachmentFormat,
} from "@/constants/file-picker";
import type {
  PromptAttachmentPart,
} from "@/contexts/prompt";

export const LOCAL_ATTACHMENTS_METADATA_KEY = "koworkAttachments";

type LocalAttachmentMetadataBase = {
  filename: string;
  path: string;
  mime: string;
  format: LocalAttachmentFormat;
  position: number;
};

export type LocalAttachmentsMetadata = {
  version: 2;
  items: Array<
    LocalAttachmentMetadataBase & {
      id: string;
      modelPartID?: string;
    }
  >;
};

export type LocalAttachmentMetadataItem =
  LocalAttachmentMetadataBase & {
    id?: string;
    modelPartID?: string;
  };

export function localAttachmentMatchesServer(
  attachment: { serverKey: string },
  serverKey: string,
) {
  return attachment.serverKey === serverKey;
}

// Models without PDF input only get an error text for base64 PDF parts, so
// fall back to a path attachment when a local path was captured.
export function pdfFallbackLocalPart(
  part: PromptAttachmentPart,
  input: { pdfInput: boolean; serverKey: string },
): PromptAttachmentPart | undefined {
  if (part.mime !== "application/pdf") return undefined;
  if (input.pdfInput) return undefined;
  if (!part.local || part.local.serverKey !== input.serverKey) return undefined;
  return {
    ...part,
    blob: undefined,
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
  if (
    !record(value) ||
    (value.version !== 1 && value.version !== 2) ||
    !Array.isArray(value.items)
  )
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
      item.mime !== LOCAL_ATTACHMENT_MIMES[item.format] ||
      (value.version === 2 && typeof item.id !== "string") ||
      (item.modelPartID !== undefined && typeof item.modelPartID !== "string")
    )
      return [];
    return [
      {
        filename: item.filename,
        path: item.path,
        mime: item.mime,
        format: item.format,
        position: item.position,
        ...(typeof item.id === "string" ? { id: item.id } : {}),
        ...(typeof item.modelPartID === "string"
          ? { modelPartID: item.modelPartID }
          : {}),
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
    id: string;
    filename: string;
    path: string;
    mime: string;
    format: LocalAttachmentFormat;
    position: number;
    modelPartID?: string;
  }>,
) {
  const items: LocalAttachmentsMetadata["items"] = attachments.map(
    ({ id, filename, path, mime, format, position, modelPartID }) => ({
      id,
      filename,
      path,
      mime,
      format,
      position,
      ...(modelPartID ? { modelPartID } : {}),
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
        version: 2,
        items,
      } satisfies LocalAttachmentsMetadata,
    },
  };
}
