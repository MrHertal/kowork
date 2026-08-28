// @opencode-ref: opencode/packages/app/src/utils/draft-store.ts (blob references only)

export type BlobReference = { id: string; url: string };

const urls = new Map<string, string>();

function blobUrl(id: string, blob: Blob) {
  const existing = urls.get(id);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

async function blobID(blob: Blob) {
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createBlobReference(
  blob: Blob,
): Promise<BlobReference> {
  const id = await blobID(blob);
  return { id, url: blobUrl(id, blob) };
}

export async function blobDataUrl(blob: BlobReference, mime: string) {
  const data = await fetch(blob.url).then((response) => response.blob());
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () =>
      reject(new Error("Failed to read attachment", { cause: reader.error })),
    );
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      resolve(`data:${mime};base64,${value.slice(value.indexOf(",") + 1)}`);
    });
    reader.readAsDataURL(data);
  });
}
