import type { OfficeAttachmentPart } from "@/contexts/prompt";

export const OFFICE_ATTACHMENTS_METADATA_KEY = "koworkAttachments";

export type OfficeAttachmentsMetadata = {
  version: 1;
  items: Array<{
    filename: string;
    path: string;
    mime: string;
    format: OfficeAttachmentPart["format"];
  }>;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function officeAttachmentsPrompt(attachments: OfficeAttachmentPart[]) {
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
