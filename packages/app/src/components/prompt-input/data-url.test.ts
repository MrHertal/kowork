// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { dataUrl } from "./data-url";

describe("dataUrl", () => {
  it("prefixes the base64 payload with the detected mime", async () => {
    // "abc" in base64
    const file = new File(["abc"], "a.png", { type: "image/png" });

    expect(await dataUrl(file, "image/png")).toBe("data:image/png;base64,YWJj");
  });

  it("rewrites the browser-reported mime with the detected one", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });

    expect(await dataUrl(file, "text/plain")).toBe(
      "data:text/plain;base64,aGVsbG8=",
    );
  });
});
