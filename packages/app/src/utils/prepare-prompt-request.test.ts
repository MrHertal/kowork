import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PromptAttachmentPart } from "@/contexts/prompt";
import { blobDataUrl } from "@/utils/blob";
import { localAttachmentsFromMetadata } from "@/utils/local-attachments";
import { preparePromptRequest } from "./prepare-prompt-request";

vi.mock("@/utils/blob", () => ({
  blobDataUrl: vi.fn(() =>
    Promise.resolve("data:application/pdf;base64,PDF"),
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

const prepare = (attachment: PromptAttachmentPart, pdfInput: boolean) =>
  preparePromptRequest({
    text: "summarize this",
    attachments: [attachment],
    pdfInput,
    serverKey: "sidecar",
    messageID: "msg_1",
    sessionID: "ses_1",
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("preparePromptRequest", () => {
  test("submits local context and a native PDF to a PDF-capable model", async () => {
    const result = await prepare(pdf(), true);

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
    const result = await prepare(pdf(), false);

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
    const result = await prepare(pdf(false), false);

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
});
