// @opencode-ref: opencode/packages/app/src/components/prompt-input/files.ts

import {
  ACCEPTED_FILE_TYPES,
  ACCEPTED_IMAGE_TYPES,
  type OfficeAttachmentFormat,
} from "@/constants/file-picker";

export { ACCEPTED_FILE_TYPES };

const IMAGE_MIMES = new Set(ACCEPTED_IMAGE_TYPES);
const IMAGE_EXTS = new Map([
  ["gif", "image/gif"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);
const TEXT_MIMES = new Set([
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
]);
const OFFICE_MIMES: Record<OfficeAttachmentFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const SAMPLE = 4096;

function kind(type: string) {
  return type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function ext(name: string) {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase();
}

export function officeAttachmentInfo(
  file: Pick<File, "name">,
): { format: OfficeAttachmentFormat; mime: string } | undefined {
  const format = ext(file.name);
  if (!(format in OFFICE_MIMES)) return;
  return {
    format: format as OfficeAttachmentFormat,
    mime: OFFICE_MIMES[format as OfficeAttachmentFormat],
  };
}

function textMime(type: string) {
  if (!type) return false;
  if (type.startsWith("text/")) return true;
  if (TEXT_MIMES.has(type)) return true;
  if (type.endsWith("+json")) return true;
  return type.endsWith("+xml");
}

function textBytes(bytes: Uint8Array) {
  if (bytes.length === 0) return true;
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) count += 1;
  }
  return count / bytes.length <= 0.3;
}

export async function attachmentMime(file: File) {
  const type = kind(file.type);
  if (IMAGE_MIMES.has(type)) return type;
  if (type === "application/pdf") return type;

  const suffix = ext(file.name);
  const fallback =
    IMAGE_EXTS.get(suffix) ??
    (suffix === "pdf" ? "application/pdf" : undefined);
  if ((!type || type === "application/octet-stream") && fallback)
    return fallback;

  if (textMime(type)) return "text/plain";
  // file.slice().arrayBuffer() throws for folders and other unreadable Files.
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.slice(0, SAMPLE).arrayBuffer());
  } catch {
    return;
  }
  if (!textBytes(bytes)) return;
  return "text/plain";
}
