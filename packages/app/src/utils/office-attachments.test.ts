import { describe, expect, test } from "vitest";
import type { OfficeAttachmentPart } from "@/contexts/prompt";
import {
  OFFICE_ATTACHMENTS_METADATA_KEY,
  officeAttachmentMatchesServer,
  officeAttachmentsFromMetadata,
  officeAttachmentsPrompt,
} from "./office-attachments";

describe("officeAttachmentMatchesServer", () => {
  test("matches only the sidecar where the document was attached", () => {
    expect(
      officeAttachmentMatchesServer({ serverKey: "sidecar" }, "sidecar"),
    ).toBe(true);
    expect(
      officeAttachmentMatchesServer({ serverKey: "sidecar" }, "wsl:Ubuntu"),
    ).toBe(false);
    expect(
      officeAttachmentMatchesServer({ serverKey: "wsl:Ubuntu" }, "wsl:Debian"),
    ).toBe(false);
  });
});

const attachment = (
  input: Partial<OfficeAttachmentPart> = {},
): OfficeAttachmentPart => ({
  type: "office",
  id: "office_1",
  filename: "contract.docx",
  path: "/Users/example/contract.docx",
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  format: "docx",
  serverKey: "sidecar",
  ...input,
});

describe("officeAttachmentsPrompt", () => {
  test("builds model context and versioned metadata", () => {
    const result = officeAttachmentsPrompt([
      { ...attachment(), position: 1 },
      {
        ...attachment({
          id: "office_2",
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
    expect(result.metadata[OFFICE_ATTACHMENTS_METADATA_KEY]).toEqual({
      version: 1,
      items: [
        {
          filename: "contract.docx",
          path: "/Users/example/contract.docx",
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          format: "docx",
          position: 1,
        },
        {
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
    const result = officeAttachmentsPrompt([
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

describe("officeAttachmentsFromMetadata", () => {
  test("returns validated version 1 attachment metadata", () => {
    const prompt = officeAttachmentsPrompt([{ ...attachment(), position: 1 }]);

    expect(officeAttachmentsFromMetadata(prompt.metadata)).toEqual([
      {
        filename: "contract.docx",
        path: "/Users/example/contract.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        format: "docx",
        position: 1,
      },
    ]);
  });

  test.each([
    undefined,
    {},
    { koworkAttachments: null },
    { koworkAttachments: { version: 2, items: [] } },
    { koworkAttachments: { version: 1, items: "invalid" } },
  ])("ignores malformed metadata %#", (metadata) => {
    expect(officeAttachmentsFromMetadata(metadata)).toEqual([]);
  });

  test("keeps valid items and ignores malformed entries", () => {
    const valid = officeAttachmentsPrompt([{ ...attachment(), position: 1 }])
      .metadata[OFFICE_ATTACHMENTS_METADATA_KEY].items[0];

    expect(
      officeAttachmentsFromMetadata({
        [OFFICE_ATTACHMENTS_METADATA_KEY]: {
          version: 1,
          items: [
            valid,
            { ...valid, format: "pdf" },
            { ...valid, mime: "application/octet-stream" },
            { ...valid, path: 42 },
          ],
        },
      }),
    ).toEqual([{ ...valid, position: 1 }]);
  });
});
