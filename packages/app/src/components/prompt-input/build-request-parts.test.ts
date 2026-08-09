// @opencode-ref: opencode/packages/app/src/components/prompt-input/build-request-parts.test.ts
import { describe, expect, test } from "vitest";
import type { ImageAttachmentPart } from "@/contexts/prompt";
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

describe("buildRequestParts", () => {
  test("builds typed request and optimistic parts", () => {
    const result = buildRequestParts({
      text: "hello",
      images: [image({ id: "img_1", filename: "a.png" })],
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
      images: [
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
      images: [
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
      images: [image({ id: "img_1", filename: "a.png" })],
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
      images: [image({ id: "img_1", filename: "a.png" })],
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

  test("returns no parts when text and images are both empty", () => {
    const result = buildRequestParts({
      text: "",
      images: [],
      messageID: "msg_1",
      sessionID: "ses_1",
    });

    expect(result.requestParts).toHaveLength(0);
    expect(result.optimisticParts).toHaveLength(0);
  });
});
