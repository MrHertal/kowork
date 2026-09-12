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

describe("planAttachmentDelivery", () => {
  test("plans native and local delivery for a PDF-capable model", () => {
    expect(
      planAttachmentDelivery([pdf()], {
        pdfInput: true,
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
      serverKey: "sidecar",
    });

    expect(delivery?.includeModelPayload).toBe(false);
    expect(delivery?.local?.path).toBe("/tmp/guide.pdf");
  });

  test("keeps the blob fallback when no local PDF path is available", () => {
    const [delivery] = planAttachmentDelivery([pdf({ local: undefined })], {
      pdfInput: false,
      serverKey: "sidecar",
    });

    expect(delivery?.includeModelPayload).toBe(true);
    expect(delivery?.local).toBeUndefined();
  });

  test("does not expose a PDF path captured for another server", () => {
    const [delivery] = planAttachmentDelivery([pdf()], {
      pdfInput: true,
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
      { pdfInput: true, serverKey: "sidecar" },
    );

    expect(deliveries.map((delivery) => delivery.position)).toEqual([1, 2]);
    expect(deliveries[1]).toMatchObject({
      includeModelPayload: false,
      local: { id: "doc_1", position: 2 },
    });
  });
});
