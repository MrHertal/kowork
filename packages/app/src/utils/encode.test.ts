import { describe, expect, it } from "vitest";
import { base64Encode } from "./encode";

describe("base64Encode", () => {
  it("encodes ascii strings", () => {
    expect(base64Encode("hello")).toBe("aGVsbG8");
  });

  it("encodes the empty string", () => {
    expect(base64Encode("")).toBe("");
  });

  it("encodes multi-byte utf-8 strings", () => {
    expect(base64Encode("héllo")).toBe("aMOpbGxv");
  });

  it("produces url-safe output without padding", () => {
    // Standard base64 of these is 7oC+ and 76O/
    expect(base64Encode("")).toBe("7oC-");
    expect(base64Encode("")).toBe("76O_");
  });

  it("never emits +, /, or = for any input", () => {
    for (let code = 0xe000; code < 0xe100; code++) {
      expect(base64Encode(String.fromCharCode(code))).toMatch(
        /^[A-Za-z0-9_-]*$/,
      );
    }
  });
});
