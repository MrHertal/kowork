// @vitest-environment jsdom
import type { Part, TextPart } from "@opencode-ai/sdk/v2/client";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { UserMessage } from "./session-turn";

const synthetic = (metadata: Record<string, unknown>): TextPart => ({
  id: "prt_office",
  type: "text",
  text: `<kowork_attachments><path>/secret/contract.docx</path></kowork_attachments>`,
  synthetic: true,
  metadata,
  sessionID: "ses_1",
  messageID: "msg_1",
});

const metadata = {
  koworkAttachments: {
    version: 1,
    items: [
      {
        filename: "contract.docx",
        path: "/secret/contract.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        format: "docx",
        position: 1,
      },
    ],
  },
};

describe("UserMessage", () => {
  test("renders submitted document tiles without exposing metadata text", () => {
    render(
      <UserMessage
        parts={[
          {
            id: "prt_text",
            type: "text",
            text: "Summarize this",
            sessionID: "ses_1",
            messageID: "msg_1",
          },
          synthetic(metadata),
        ]}
      />,
    );

    expect(screen.getByText("Summarize this")).toBeInTheDocument();
    expect(screen.getByTitle("contract.docx")).toBeInTheDocument();
    expect(screen.queryByText(/kowork_attachments/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/\/secret\/contract\.docx/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("...")).not.toBeInTheDocument();
  });

  test("ignores malformed and unrelated synthetic metadata", () => {
    const parts: Part[] = [
      synthetic({
        koworkAttachments: {
          version: 2,
          items: metadata.koworkAttachments.items,
        },
      }),
      synthetic({ other: "value" }),
    ];

    render(<UserMessage parts={parts} />);

    expect(screen.queryByTitle("contract.docx")).not.toBeInTheDocument();
    expect(screen.queryByText(/kowork_attachments/)).not.toBeInTheDocument();
  });

  test("preserves mixed attachment order", () => {
    render(
      <UserMessage
        parts={[
          synthetic({
            koworkAttachments: {
              version: 1,
              items: [{ ...metadata.koworkAttachments.items[0], position: 2 }],
            },
          }),
          {
            id: "prt_image",
            type: "file",
            filename: "photo.png",
            mime: "image/png",
            url: "data:image/png;base64,AAA",
            sessionID: "ses_1",
            messageID: "msg_1",
          },
        ]}
      />,
    );

    expect(
      screen
        .getAllByTitle(/photo\.png|contract\.docx/)
        .map((item) => item.title),
    ).toEqual(["photo.png", "contract.docx"]);
  });

  test("merges native and local projections into one PDF tile", () => {
    render(
      <UserMessage
        parts={[
          synthetic({
            koworkAttachments: {
              version: 2,
              items: [
                {
                  id: "pdf_1",
                  filename: "guide.pdf",
                  path: "/secret/guide.pdf",
                  mime: "application/pdf",
                  format: "pdf",
                  position: 1,
                  modelPartID: "prt_pdf",
                },
              ],
            },
          }),
          {
            id: "prt_pdf",
            type: "file",
            filename: "guide.pdf",
            mime: "application/pdf",
            url: "data:application/pdf;base64,BBB",
            sessionID: "ses_1",
            messageID: "msg_1",
          },
        ]}
      />,
    );

    expect(screen.getAllByTitle("guide.pdf")).toHaveLength(1);
    expect(screen.queryByText(/\/secret\/guide\.pdf/)).not.toBeInTheDocument();
  });

  test("preserves order across native, dual, and local attachments", () => {
    render(
      <UserMessage
        parts={[
          synthetic({
            koworkAttachments: {
              version: 2,
              items: [
                {
                  id: "pdf_1",
                  filename: "guide.pdf",
                  path: "/secret/guide.pdf",
                  mime: "application/pdf",
                  format: "pdf",
                  position: 2,
                  modelPartID: "prt_pdf",
                },
                {
                  id: "doc_1",
                  filename: "contract.docx",
                  path: "/secret/contract.docx",
                  mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  format: "docx",
                  position: 3,
                },
              ],
            },
          }),
          {
            id: "prt_image",
            type: "file",
            filename: "photo.png",
            mime: "image/png",
            url: "data:image/png;base64,AAA",
            sessionID: "ses_1",
            messageID: "msg_1",
          },
          {
            id: "prt_pdf",
            type: "file",
            filename: "guide.pdf",
            mime: "application/pdf",
            url: "data:application/pdf;base64,BBB",
            sessionID: "ses_1",
            messageID: "msg_1",
          },
        ]}
      />,
    );

    expect(
      screen
        .getAllByTitle(/photo\.png|guide\.pdf|contract\.docx/)
        .map((item) => item.title),
    ).toEqual(["photo.png", "guide.pdf", "contract.docx"]);
  });
});
