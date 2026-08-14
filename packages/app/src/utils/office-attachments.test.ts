import { describe, expect, test } from "vitest";
import type { OfficeAttachmentPart } from "@/contexts/prompt";
import {
  OFFICE_ATTACHMENTS_METADATA_KEY,
  officeAttachmentsPrompt,
} from "./office-attachments";

const attachment = (
  input: Partial<OfficeAttachmentPart> = {},
): OfficeAttachmentPart => ({
  type: "office",
  id: "office_1",
  filename: "contract.docx",
  path: "/Users/example/contract.docx",
  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  format: "docx",
  ...input,
});

describe("officeAttachmentsPrompt", () => {
  test("builds model context and versioned metadata", () => {
    const result = officeAttachmentsPrompt([
      attachment(),
      attachment({
        id: "office_2",
        filename: "budget.xlsx",
        path: "/Users/example/budget.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        format: "xlsx",
      }),
    ]);

    expect(result.text).toBe(`<kowork_attachments>
  <attachment>
    <name>contract.docx</name>
    <path>/Users/example/contract.docx</path>
    <format>docx</format>
  </attachment>
  <attachment>
    <name>budget.xlsx</name>
    <path>/Users/example/budget.xlsx</path>
    <format>xlsx</format>
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
        },
        {
          filename: "budget.xlsx",
          path: "/Users/example/budget.xlsx",
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          format: "xlsx",
        },
      ],
    });
  });

  test("escapes filenames and paths as untrusted XML values", () => {
    const result = officeAttachmentsPrompt([
      attachment({
        filename: `terms<&>"'.docx`,
        path: `/tmp/<folder>&"'/terms.docx`,
      }),
    ]);

    expect(result.text).toContain(
      "<name>terms&lt;&amp;&gt;&quot;&apos;.docx</name>",
    );
    expect(result.text).toContain(
      "<path>/tmp/&lt;folder&gt;&amp;&quot;&apos;/terms.docx</path>",
    );
  });
});
