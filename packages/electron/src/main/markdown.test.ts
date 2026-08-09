import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  it("renders links that open externally in a new tab", async () => {
    const html = await parseMarkdown("[example](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('class="external-link"');
  });

  it("renders GFM without converting single newlines to breaks", async () => {
    const html = await parseMarkdown("first\nsecond");
    expect(html).not.toContain("<br>");
  });
});
