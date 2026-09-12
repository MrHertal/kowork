import { describe, expect, test } from "vitest";
import type { PromptAttachmentPart } from "@/contexts/prompt";
import { planAttachmentDelivery } from "./attachment-delivery";

const pdf = (
  input: Partial<PromptAttachmentPart> = {},
): PromptAttachmentPart => ({
  type: "attachment",
  id: "pdf_1",
  filename: "guide.pdf",
  mime: "application/pdf",
  blob: { id: "blob_1", url: "blob:guide" },
  local: {
    path: "/tmp/guide.pdf",
    format: "pdf",
    serverKey: "sidecar",
  },
  ...input,
});

const image = (
  input: Partial<PromptAttachmentPart> = {},
): PromptAttachmentPart => ({
  type: "attachment",
  id: "image_1",
  filename: "photo.png",
  mime: "image/png",
  blob: { id: "blob_2", url: "blob:photo" },
  local: {
    path: "/tmp/photo.png",
    format: "png",
    serverKey: "sidecar",
  },
  ...input,
});

describe("planAttachmentDelivery", () => {
  test("plans native and local delivery for a PDF-capable model", () => {
    expect(
      planAttachmentDelivery([pdf()], {
        pdfInput: true,
        imageInput: false,
        serverKey: "sidecar",
      }),
    ).toEqual([
      {
        attachment: pdf(),
        position: 1,
        includeModelPayload: true,
        local: {
          id: "pdf_1",
          filename: "guide.pdf",
          path: "/tmp/guide.pdf",
          mime: "application/pdf",
          format: "pdf",
          position: 1,
        },
      },
    ]);
  });

  test("plans local-only delivery when the model cannot read PDFs", () => {
    const [delivery] = planAttachmentDelivery([pdf()], {
      pdfInput: false,
      imageInput: false,
      serverKey: "sidecar",
    });

    expect(delivery?.includeModelPayload).toBe(false);
    expect(delivery?.local?.path).toBe("/tmp/guide.pdf");
  });

  test("keeps the blob fallback when no local PDF path is available", () => {
    const [delivery] = planAttachmentDelivery([pdf({ local: undefined })], {
      pdfInput: false,
      imageInput: false,
      serverKey: "sidecar",
    });

    expect(delivery?.includeModelPayload).toBe(true);
    expect(delivery?.local).toBeUndefined();
  });

  test("plans native and local delivery for an image-capable model", () => {
    const [delivery] = planAttachmentDelivery([image()], {
      pdfInput: false,
      imageInput: true,
      serverKey: "sidecar",
    });

    expect(delivery).toMatchObject({
      includeModelPayload: true,
      local: { path: "/tmp/photo.png", format: "png" },
    });
  });

  test("plans local-only delivery when the model cannot read images", () => {
    const [delivery] = planAttachmentDelivery([image()], {
      pdfInput: false,
      imageInput: false,
      serverKey: "sidecar",
    });

    expect(delivery).toMatchObject({
      includeModelPayload: false,
      local: { path: "/tmp/photo.png", format: "png" },
    });
  });

  test("keeps the blob fallback when no local image path is available", () => {
    const [delivery] = planAttachmentDelivery(
      [image({ local: undefined })],
      {
        pdfInput: false,
        imageInput: false,
        serverKey: "sidecar",
      },
    );

    expect(delivery?.includeModelPayload).toBe(true);
    expect(delivery?.local).toBeUndefined();
  });

  test("does not expose a PDF path captured for another server", () => {
    const [delivery] = planAttachmentDelivery([pdf()], {
      pdfInput: true,
      imageInput: false,
      serverKey: "wsl:Ubuntu",
    });

    expect(delivery?.includeModelPayload).toBe(true);
    expect(delivery?.local).toBeUndefined();
  });

  test("plans local-only attachments and preserves original positions", () => {
    const localAttachment: PromptAttachmentPart = {
      type: "attachment",
      id: "doc_1",
      filename: "contract.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      local: {
        path: "/tmp/contract.docx",
        format: "docx",
        serverKey: "sidecar",
      },
    };

    const deliveries = planAttachmentDelivery(
      [pdf({ local: undefined }), localAttachment],
      { pdfInput: true, imageInput: false, serverKey: "sidecar" },
    );

    expect(deliveries.map((delivery) => delivery.position)).toEqual([1, 2]);
    expect(deliveries[1]).toMatchObject({
      includeModelPayload: false,
      local: { id: "doc_1", position: 2 },
    });
  });
});
