import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PromptAttachmentPart } from "@/contexts/prompt";
import { blobDataUrl } from "@/utils/blob";
import { localAttachmentsFromMetadata } from "@/utils/local-attachments";
import { preparePromptRequest } from "./prepare-prompt-request";

vi.mock("@/utils/blob", () => ({
  blobDataUrl: vi.fn((_blob: unknown, mime: string) =>
    Promise.resolve(
      mime === "application/pdf"
        ? "data:application/pdf;base64,PDF"
        : `data:${mime};base64,IMAGE`,
    ),
  ),
}));

const pdf = (local = true): PromptAttachmentPart => ({
  type: "attachment",
  id: "pdf_1",
  filename: "guide.pdf",
  mime: "application/pdf",
  blob: { id: "blob_1", url: "blob:guide" },
  ...(local
    ? {
        local: {
          path: "/tmp/guide.pdf",
          format: "pdf" as const,
          serverKey: "sidecar",
        },
      }
    : {}),
});

const image = (local = true): PromptAttachmentPart => ({
  type: "attachment",
  id: "image_1",
  filename: "photo.png",
  mime: "image/png",
  blob: { id: "blob_2", url: "blob:photo" },
  ...(local
    ? {
        local: {
          path: "/tmp/photo.png",
          format: "png" as const,
          serverKey: "sidecar",
        },
      }
    : {}),
});

const prepare = (
  attachment: PromptAttachmentPart,
  input: { pdfInput: boolean; imageInput: boolean },
) =>
  preparePromptRequest({
    text: "summarize this",
    attachments: [attachment],
    ...input,
    serverKey: "sidecar",
    messageID: "msg_1",
    sessionID: "ses_1",
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("preparePromptRequest", () => {
  test("submits local context and a native PDF to a PDF-capable model", async () => {
    const result = await prepare(pdf(), { pdfInput: true, imageInput: false });

    expect(result.requestParts).toHaveLength(3);
    const context = result.requestParts[1];
    const native = result.requestParts[2];
    expect(context).toMatchObject({
      type: "text",
      synthetic: true,
    });
    expect(native).toMatchObject({
      type: "file",
      filename: "guide.pdf",
      url: "data:application/pdf;base64,PDF",
    });
    if (context?.type !== "text" || native?.type !== "file")
      throw new Error("Expected local context and native PDF parts");
    expect(localAttachmentsFromMetadata(context.metadata)).toMatchObject([
      {
        path: "/tmp/guide.pdf",
        modelPartID: native.id,
      },
    ]);
    expect(blobDataUrl).toHaveBeenCalledOnce();
  });

  test("submits only local context to a model without PDF input", async () => {
    const result = await prepare(pdf(), {
      pdfInput: false,
      imageInput: false,
    });

    expect(result.requestParts).toHaveLength(2);
    expect(result.requestParts[1]).toMatchObject({
      type: "text",
      synthetic: true,
      metadata: {
        koworkAttachments: {
          items: [{ path: "/tmp/guide.pdf" }],
        },
      },
    });
    expect(result.requestParts.some((part) => part.type === "file")).toBe(
      false,
    );
    expect(blobDataUrl).not.toHaveBeenCalled();
  });

  test("submits the native PDF when no local path is available", async () => {
    const result = await prepare(pdf(false), {
      pdfInput: false,
      imageInput: false,
    });

    expect(result.requestParts).toHaveLength(2);
    expect(result.requestParts[1]).toMatchObject({
      type: "file",
      filename: "guide.pdf",
      url: "data:application/pdf;base64,PDF",
    });
    expect(
      result.requestParts.some(
        (part) => part.type === "text" && part.synthetic,
      ),
    ).toBe(false);
    expect(blobDataUrl).toHaveBeenCalledOnce();
  });

  test("submits local context and a native image to a vision-capable model", async () => {
    const result = await prepare(image(), {
      pdfInput: false,
      imageInput: true,
    });

    expect(result.requestParts).toHaveLength(3);
    const context = result.requestParts[1];
    const native = result.requestParts[2];
    expect(native).toMatchObject({
      type: "file",
      filename: "photo.png",
      url: "data:image/png;base64,IMAGE",
    });
    if (context?.type !== "text" || native?.type !== "file")
      throw new Error("Expected local context and native image parts");
    expect(localAttachmentsFromMetadata(context.metadata)).toMatchObject([
      {
        path: "/tmp/photo.png",
        modelPartID: native.id,
      },
    ]);
    expect(blobDataUrl).toHaveBeenCalledOnce();
  });

  test("submits only local context to a model without image input", async () => {
    const result = await prepare(image(), {
      pdfInput: false,
      imageInput: false,
    });

    expect(result.requestParts).toHaveLength(2);
    expect(result.requestParts[1]).toMatchObject({
      type: "text",
      synthetic: true,
      metadata: {
        koworkAttachments: {
          items: [{ path: "/tmp/photo.png", format: "png" }],
        },
      },
    });
    expect(result.requestParts.some((part) => part.type === "file")).toBe(
      false,
    );
    expect(blobDataUrl).not.toHaveBeenCalled();
  });

  test("submits the native image when no local path is available", async () => {
    const result = await prepare(image(false), {
      pdfInput: false,
      imageInput: false,
    });

    expect(result.requestParts).toHaveLength(2);
    expect(result.requestParts[1]).toMatchObject({
      type: "file",
      filename: "photo.png",
      url: "data:image/png;base64,IMAGE",
    });
    expect(
      result.requestParts.some(
        (part) => part.type === "text" && part.synthetic,
      ),
    ).toBe(false);
    expect(blobDataUrl).toHaveBeenCalledOnce();
  });
});
