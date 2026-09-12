// @opencode-ref: opencode/packages/app/src/components/prompt-input/build-request-parts.test.ts
import { describe, expect, test } from "vitest";
import type { LocalAttachmentFormat } from "@/constants/file-picker";
import {
  buildRequestParts,
  type EncodedAttachmentDelivery,
} from "./build-request-parts";

const image = (input: {
  id: string;
  filename: string;
  mime?: string;
  dataUrl?: string;
  position?: number;
}): EncodedAttachmentDelivery => ({
  attachment: {
    type: "attachment",
    id: input.id,
    filename: input.filename,
    mime: input.mime ?? "image/png",
  },
  position: input.position ?? 1,
  includeModelPayload: true,
  dataUrl: input.dataUrl ?? "data:image/png;base64,AAA",
});

const office = (input: {
  id: string;
  filename: string;
  path: string;
  format?: LocalAttachmentFormat;
  mime?: string;
  position?: number;
}): EncodedAttachmentDelivery => {
  const mime =
    input.mime ??
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const local = {
    id: input.id,
    filename: input.filename,
    path: input.path,
    mime,
    format: input.format ?? "docx",
    position: input.position ?? 1,
  } as const;
  return {
    attachment: {
      type: "attachment",
      id: input.id,
      filename: input.filename,
      mime,
      local: {
        path: input.path,
        format: input.format ?? "docx",
        serverKey: "sidecar",
      },
    },
    position: input.position ?? 1,
    includeModelPayload: false,
    local,
  };
};

describe("buildRequestParts", () => {
  test("builds typed request and optimistic parts", () => {
    const result = buildRequestParts({
      text: "hello",
      deliveries: [image({ id: "img_1", filename: "a.png" })],
      messageID: "msg_1",
      sessionID: "ses_1",
    });

    expect(result.requestParts).toHaveLength(2);
    expect(result.requestParts[0]).toMatchObject({
      type: "text",
      text: "hello",
    });

    const file = result.requestParts[1];
    expect(file).toMatchObject({
      type: "file",
      mime: "image/png",
      filename: "a.png",
      url: "data:image/png;base64,AAA",
    });

    expect(result.optimisticParts).toHaveLength(result.requestParts.length);
    expect(
      result.optimisticParts.every(
        (part) => part.sessionID === "ses_1" && part.messageID === "msg_1",
      ),
    ).toBe(true);
  });

  test("assigns ascending part ids", () => {
    const result = buildRequestParts({
      text: "hi",
      deliveries: [
        image({ id: "img_1", filename: "a.png", position: 1 }),
        image({ id: "img_2", filename: "b.png", position: 2 }),
      ],
      messageID: "msg_1",
      sessionID: "ses_1",
    });

    const ids = result.requestParts.map((part) => part.id);
    expect(ids.every((id) => id.startsWith("prt_"))).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(result.optimisticParts.map((part) => part.id)).toEqual(ids);
  });

  test("keeps multiple uploaded attachments in order", () => {
    const result = buildRequestParts({
      text: "check these",
      deliveries: [
        image({ id: "img_1", filename: "a.png", position: 1 }),
        image({
          id: "img_2",
          filename: "b.pdf",
          mime: "application/pdf",
          dataUrl: "data:application/pdf;base64,BBB",
          position: 2,
        }),
      ],
      messageID: "msg_multi",
      sessionID: "ses_multi",
    });

    const files = result.requestParts.filter(
      (part) => part.type === "file" && part.url.startsWith("data:"),
    );

    expect(files).toHaveLength(2);
    expect(
      files.map((part) => (part.type === "file" ? part.filename : "")),
    ).toEqual(["a.png", "b.pdf"]);
  });

  test("mirrors text and file fields into the optimistic parts", () => {
    const result = buildRequestParts({
      text: "hello",
      deliveries: [image({ id: "img_1", filename: "a.png" })],
      messageID: "msg_1",
      sessionID: "ses_1",
    });

    const [text, file] = result.optimisticParts;
    expect(text).toMatchObject({ type: "text", text: "hello" });
    expect(file).toMatchObject({
      type: "file",
      mime: "image/png",
      filename: "a.png",
      url: "data:image/png;base64,AAA",
    });
  });

  test("omits the text part when only images are sent", () => {
    const result = buildRequestParts({
      text: "",
      deliveries: [image({ id: "img_1", filename: "a.png" })],
      messageID: "msg_1",
      sessionID: "ses_1",
    });

    expect(result.requestParts).toHaveLength(1);
    expect(result.requestParts[0]).toMatchObject({
      type: "file",
      filename: "a.png",
    });
    expect(result.optimisticParts).toHaveLength(1);
  });

  test("builds a synthetic text part for Office attachments", () => {
    const result = buildRequestParts({
      text: "summarize this",
      deliveries: [
        office({
          id: "office_1",
          filename: "contract.docx",
          path: "/Users/example/contract.docx",
        }),
      ],
      messageID: "msg_office",
      sessionID: "ses_office",
    });

    expect(result.requestParts).toHaveLength(2);
    const attachmentContext = result.requestParts[1];
    expect(attachmentContext?.type).toBe("text");
    if (attachmentContext?.type !== "text")
      throw new Error("Expected synthetic attachment context");
    expect(attachmentContext).toMatchObject({
      type: "text",
      synthetic: true,
      metadata: {
        koworkAttachments: {
          version: 2,
          items: [
            {
              id: "office_1",
              filename: "contract.docx",
              path: "/Users/example/contract.docx",
              format: "docx",
            },
          ],
        },
      },
    });
    expect(attachmentContext.text).toContain("<name>contract.docx</name>");
    expect(result.requestParts.some((part) => part.type === "file")).toBe(
      false,
    );
    expect(result.optimisticParts[1]).toMatchObject({
      type: "text",
      synthetic: true,
      metadata: attachmentContext.metadata,
    });
  });

  test("supports an Office-only prompt", () => {
    const result = buildRequestParts({
      text: "",
      deliveries: [
        office({
          id: "office_1",
          filename: "budget.xlsx",
          path: "/Users/example/budget.xlsx",
          format: "xlsx",
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      ],
      messageID: "msg_office",
      sessionID: "ses_office",
    });

    expect(result.requestParts).toHaveLength(1);
    expect(result.requestParts[0]).toMatchObject({
      type: "text",
      synthetic: true,
    });
  });

  test("places Office context before uploaded model attachments", () => {
    const result = buildRequestParts({
      text: "check these",
      deliveries: [
        image({ id: "img_1", filename: "a.png", position: 1 }),
        office({
          id: "office_1",
          filename: "contract.docx",
          path: "/Users/example/contract.docx",
          position: 2,
        }),
      ],
      messageID: "msg_mixed",
      sessionID: "ses_mixed",
    });

    expect(result.requestParts.map((part) => part.type)).toEqual([
      "text",
      "text",
      "file",
    ]);
    expect(result.requestParts[1]).toMatchObject({ synthetic: true });
    expect(result.requestParts[1]).toMatchObject({
      metadata: {
        koworkAttachments: { items: [{ position: 2 }] },
      },
    });
  });

  test("links native and local projections of the same PDF", () => {
    const native = image({
      id: "pdf_1",
      filename: "guide.pdf",
      mime: "application/pdf",
      dataUrl: "data:application/pdf;base64,BBB",
    });
    const result = buildRequestParts({
      text: "remove page 2",
      deliveries: [
        {
          ...native,
          local: {
            id: "pdf_1",
            filename: "guide.pdf",
            path: "/Users/example/guide.pdf",
            mime: "application/pdf",
            format: "pdf",
            position: 1,
          },
        },
      ],
      messageID: "msg_pdf",
      sessionID: "ses_pdf",
    });

    const modelPart = result.requestParts.find(
      (part) => part.type === "file" && part.filename === "guide.pdf",
    );
    const context = result.requestParts.find(
      (part) => part.type === "text" && part.synthetic,
    );
    expect(modelPart?.type).toBe("file");
    expect(context?.type).toBe("text");
    if (context?.type !== "text") throw new Error("Expected local context");
    expect(context.metadata).toMatchObject({
      koworkAttachments: {
        version: 2,
        items: [
          {
            id: "pdf_1",
            filename: "guide.pdf",
            position: 1,
            modelPartID: modelPart?.id,
          },
        ],
      },
    });
  });

  test("omits the text part when the text is only whitespace", () => {
    const result = buildRequestParts({
      text: "   \n",
      deliveries: [image({ id: "img_1", filename: "a.png" })],
      messageID: "msg_1",
      sessionID: "ses_1",
    });

    expect(result.requestParts).toHaveLength(1);
    expect(result.requestParts[0]).toMatchObject({
      type: "file",
      filename: "a.png",
    });
  });

  test("returns no parts when text and attachments are empty", () => {
    const result = buildRequestParts({
      text: "",
      deliveries: [],
      messageID: "msg_1",
      sessionID: "ses_1",
    });

    expect(result.requestParts).toHaveLength(0);
    expect(result.optimisticParts).toHaveLength(0);
  });
});
