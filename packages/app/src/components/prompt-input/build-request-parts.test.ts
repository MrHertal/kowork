// @opencode-ref: opencode/packages/app/src/components/prompt-input/build-request-parts.test.ts
import { describe, expect, test } from "vitest";
import type {
  ImageAttachmentPart,
  OfficeAttachmentPart,
} from "@/contexts/prompt";
import { buildRequestParts } from "./build-request-parts";

const image = (input: {
  id: string;
  filename: string;
  mime?: string;
  dataUrl?: string;
}): ImageAttachmentPart => ({
  type: "image",
  id: input.id,
  filename: input.filename,
  mime: input.mime ?? "image/png",
  dataUrl: input.dataUrl ?? "data:image/png;base64,AAA",
});

const office = (input: {
  id: string;
  filename: string;
  path: string;
  format?: OfficeAttachmentPart["format"];
  mime?: string;
}): OfficeAttachmentPart => ({
  type: "office",
  id: input.id,
  filename: input.filename,
  path: input.path,
  format: input.format ?? "docx",
  mime:
    input.mime ??
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  serverKey: "sidecar",
});

describe("buildRequestParts", () => {
  test("builds typed request and optimistic parts", () => {
    const result = buildRequestParts({
      text: "hello",
      attachments: [image({ id: "img_1", filename: "a.png" })],
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
      attachments: [
        image({ id: "img_1", filename: "a.png" }),
        image({ id: "img_2", filename: "b.png" }),
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
      attachments: [
        image({ id: "img_1", filename: "a.png" }),
        image({
          id: "img_2",
          filename: "b.pdf",
          mime: "application/pdf",
          dataUrl: "data:application/pdf;base64,BBB",
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
      attachments: [image({ id: "img_1", filename: "a.png" })],
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
      attachments: [image({ id: "img_1", filename: "a.png" })],
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
      attachments: [
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
          version: 1,
          items: [
            {
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
      attachments: [
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
      attachments: [
        image({ id: "img_1", filename: "a.png" }),
        office({
          id: "office_1",
          filename: "contract.docx",
          path: "/Users/example/contract.docx",
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

  test("returns no parts when text and attachments are empty", () => {
    const result = buildRequestParts({
      text: "",
      attachments: [],
      messageID: "msg_1",
      sessionID: "ses_1",
    });

    expect(result.requestParts).toHaveLength(0);
    expect(result.optimisticParts).toHaveLength(0);
  });
});
