// @opencode-ref: opencode/packages/app/src/components/prompt-input/attachments.test.ts
import { describe, expect, test } from "vitest";
import { attachmentMime } from "./files";

describe("attachmentMime", () => {
  test("keeps PDFs when the browser reports the mime", async () => {
    const file = new File(["%PDF-1.7"], "guide.pdf", {
      type: "application/pdf",
    });
    expect(await attachmentMime(file)).toBe("application/pdf");
  });

  test("normalizes structured text types to text/plain", async () => {
    const file = new File(['{"ok":true}\n'], "data.json", {
      type: "application/json",
    });
    expect(await attachmentMime(file)).toBe("text/plain");
  });

  test("accepts text files even with a misleading browser mime", async () => {
    const file = new File(["export const x = 1\n"], "main.ts", {
      type: "video/mp2t",
    });
    expect(await attachmentMime(file)).toBe("text/plain");
  });

  test("rejects binary files", async () => {
    const file = new File([Uint8Array.of(0, 255, 1, 2)], "blob.bin", {
      type: "application/octet-stream",
    });
    expect(await attachmentMime(file)).toBeUndefined();
  });

  test("keeps accepted image types reported by the browser", async () => {
    const file = new File([Uint8Array.of(137, 80)], "photo.webp", {
      type: "image/webp",
    });
    expect(await attachmentMime(file)).toBe("image/webp");
  });

  test("falls back to the extension when the mime is missing", async () => {
    expect(
      await attachmentMime(new File(["x"], "photo.png", { type: "" })),
    ).toBe("image/png");
    expect(
      await attachmentMime(new File(["x"], "guide.pdf", { type: "" })),
    ).toBe("application/pdf");
  });

  test("falls back to the extension for octet-stream mimes", async () => {
    const file = new File([Uint8Array.of(0, 1)], "photo.jpg", {
      type: "application/octet-stream",
    });
    expect(await attachmentMime(file)).toBe("image/jpeg");
  });

  test("prefers the reported image mime over the extension", async () => {
    const file = new File([Uint8Array.of(0, 1)], "photo.png", {
      type: "image/jpeg",
    });
    expect(await attachmentMime(file)).toBe("image/jpeg");
  });

  test("normalizes +json and +xml suffix types to text/plain", async () => {
    expect(
      await attachmentMime(
        new File(["{}\n"], "data.hal", { type: "application/hal+json" }),
      ),
    ).toBe("text/plain");
    expect(
      await attachmentMime(
        new File(["<feed/>\n"], "feed.atom", {
          type: "application/atom+xml",
        }),
      ),
    ).toBe("text/plain");
  });

  test("accepts empty files as text", async () => {
    const file = new File([], "notes", { type: "" });
    expect(await attachmentMime(file)).toBe("text/plain");
  });

  test("rejects content over the control-byte threshold", async () => {
    const file = new File([Uint8Array.of(1, 2, 3, 65)], "blob.dat", {
      type: "application/octet-stream",
    });
    expect(await attachmentMime(file)).toBeUndefined();
  });

  test("accepts content under the control-byte threshold", async () => {
    const file = new File([Uint8Array.of(1, 65, 66, 67)], "main.c", {
      type: "application/octet-stream",
    });
    expect(await attachmentMime(file)).toBe("text/plain");
  });
});
