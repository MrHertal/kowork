import { describe, expect, test } from "vitest";
import {
  LOCAL_ATTACHMENTS_METADATA_KEY,
  localAttachmentMatchesServer,
  localAttachmentsFromMetadata,
  localAttachmentsPrompt,
} from "./local-attachments";

describe("localAttachmentMatchesServer", () => {
  test("matches only the sidecar where the document was attached", () => {
    expect(
      localAttachmentMatchesServer({ serverKey: "sidecar" }, "sidecar"),
    ).toBe(true);
    expect(
      localAttachmentMatchesServer({ serverKey: "sidecar" }, "wsl:Ubuntu"),
    ).toBe(false);
    expect(
      localAttachmentMatchesServer({ serverKey: "wsl:Ubuntu" }, "wsl:Debian"),
    ).toBe(false);
  });
});

type LocalAttachmentInput = Parameters<typeof localAttachmentsPrompt>[0][number];

const attachment = (
  input: Partial<LocalAttachmentInput> = {},
): LocalAttachmentInput => ({
  id: "office_1",
  filename: "contract.docx",
  path: "/Users/example/contract.docx",
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  format: "docx",
  position: 1,
  ...input,
});

describe("localAttachmentsPrompt", () => {
  test("builds model context and versioned metadata", () => {
    const result = localAttachmentsPrompt([
      { ...attachment(), position: 1 },
      {
        ...attachment({
          filename: "budget.xlsx",
          path: "/Users/example/budget.xlsx",
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          format: "xlsx",
        }),
        position: 2,
      },
    ]);

    expect(result.text).toBe(`<kowork_attachments>
  <attachment>
    <name>contract.docx</name>
    <path>/Users/example/contract.docx</path>
    <format>docx</format>
    <position>1</position>
  </attachment>
  <attachment>
    <name>budget.xlsx</name>
    <path>/Users/example/budget.xlsx</path>
    <format>xlsx</format>
    <position>2</position>
  </attachment>
</kowork_attachments>`);
    expect(result.metadata[LOCAL_ATTACHMENTS_METADATA_KEY]).toEqual({
      version: 2,
      items: [
        {
          id: "office_1",
          filename: "contract.docx",
          path: "/Users/example/contract.docx",
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          format: "docx",
          position: 1,
        },
        {
          id: "office_1",
          filename: "budget.xlsx",
          path: "/Users/example/budget.xlsx",
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          format: "xlsx",
          position: 2,
        },
      ],
    });
  });

  test("escapes filenames and paths as untrusted XML values", () => {
    const result = localAttachmentsPrompt([
      {
        ...attachment({
          filename: `terms<&>"'.docx`,
          path: `/tmp/<folder>&"'/terms.docx`,
        }),
        position: 1,
      },
    ]);

    expect(result.text).toContain(
      "<name>terms&lt;&amp;&gt;&quot;&apos;.docx</name>",
    );
    expect(result.text).toContain(
      "<path>/tmp/&lt;folder&gt;&amp;&quot;&apos;/terms.docx</path>",
    );
  });
});

describe("localAttachmentsFromMetadata", () => {
  test("returns validated version 2 attachment metadata", () => {
    const prompt = localAttachmentsPrompt([{ ...attachment(), position: 1 }]);

    expect(localAttachmentsFromMetadata(prompt.metadata)).toEqual([
      {
        id: "office_1",
        filename: "contract.docx",
        path: "/Users/example/contract.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        format: "docx",
        position: 1,
      },
    ]);
  });

  test("continues to read version 1 attachment metadata", () => {
    expect(
      localAttachmentsFromMetadata({
        koworkAttachments: {
          version: 1,
          items: [
            {
              filename: "contract.docx",
              path: "/Users/example/contract.docx",
              mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              format: "docx",
              position: 1,
            },
          ],
        },
      }),
    ).toEqual([
      {
        filename: "contract.docx",
        path: "/Users/example/contract.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        format: "docx",
        position: 1,
      },
    ]);
  });

  test("requires identity fields in version 2 metadata", () => {
    const valid = localAttachmentsPrompt([attachment()]).metadata[
      LOCAL_ATTACHMENTS_METADATA_KEY
    ].items[0];

    expect(
      localAttachmentsFromMetadata({
        koworkAttachments: {
          version: 2,
          items: [
            { ...valid, id: undefined },
            { ...valid, modelPartID: 42 },
          ],
        },
      }),
    ).toEqual([]);
  });

  test.each([
    undefined,
    {},
    { koworkAttachments: null },
    { koworkAttachments: { version: 3, items: [] } },
    { koworkAttachments: { version: 1, items: "invalid" } },
  ])("ignores malformed metadata %#", (metadata) => {
    expect(localAttachmentsFromMetadata(metadata)).toEqual([]);
  });

  test("keeps valid items and ignores malformed entries", () => {
    const valid = localAttachmentsPrompt([{ ...attachment(), position: 1 }])
      .metadata[LOCAL_ATTACHMENTS_METADATA_KEY].items[0];

    expect(
      localAttachmentsFromMetadata({
        [LOCAL_ATTACHMENTS_METADATA_KEY]: {
          version: 1,
          items: [
            valid,
            { ...valid, format: "odt" },
            { ...valid, format: "pdf" },
            { ...valid, mime: "application/octet-stream" },
            { ...valid, path: 42 },
          ],
        },
      }),
    ).toEqual([{ ...valid, position: 1 }]);
  });

  test("round-trips a local PDF attachment", () => {
    const prompt = localAttachmentsPrompt([
      {
        ...attachment({
          filename: "guide.pdf",
          path: "/Users/example/guide.pdf",
          mime: "application/pdf",
          format: "pdf",
        }),
        position: 1,
      },
    ]);

    expect(prompt.text).toContain("<format>pdf</format>");
    expect(localAttachmentsFromMetadata(prompt.metadata)).toEqual([
      {
        id: "office_1",
        filename: "guide.pdf",
        path: "/Users/example/guide.pdf",
        mime: "application/pdf",
        format: "pdf",
        position: 1,
      },
    ]);
  });
});
