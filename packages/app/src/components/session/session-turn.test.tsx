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
});
