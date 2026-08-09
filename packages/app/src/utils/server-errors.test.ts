// @opencode-ref: opencode/packages/app/src/utils/server-errors.test.ts
import { describe, expect, test } from "vitest";
import type {
  ConfigInvalidError,
  ProviderModelNotFoundError,
} from "./server-errors";
import {
  formatServerError,
  parseReadableConfigInvalidError,
  translate,
} from "./server-errors";

describe("parseReadableConfigInvalidError", () => {
  test("formats issues with file path", () => {
    const error = {
      name: "ConfigInvalidError",
      data: {
        path: "opencode.config.ts",
        issues: [
          { path: ["settings", "host"], message: "Required" },
          { path: ["mode"], message: "Invalid" },
        ],
      },
    } satisfies ConfigInvalidError;

    const result = parseReadableConfigInvalidError(error, translate);

    expect(result).toBe(
      [
        "Config file at opencode.config.ts is invalid: settings.host: Required",
        "mode: Invalid",
      ].join("\n"),
    );
  });

  test("uses trimmed message when issues are missing", () => {
    const error = {
      name: "ConfigInvalidError",
      data: {
        path: "config",
        message: "  Bad value  ",
      },
    } satisfies ConfigInvalidError;

    const result = parseReadableConfigInvalidError(error, translate);

    expect(result).toBe("Config file at config is invalid: Bad value");
  });
});

describe("formatServerError", () => {
  test("formats config invalid errors", () => {
    const error = {
      name: "ConfigInvalidError",
      data: {
        message: "Missing host",
      },
    } satisfies ConfigInvalidError;

    const result = formatServerError(error, translate);

    expect(result).toBe("Config file at config is invalid: Missing host");
  });

  test("returns error messages", () => {
    expect(
      formatServerError(new Error("Request failed with status 503"), translate),
    ).toBe("Request failed with status 503");
  });

  test("returns provided string errors", () => {
    expect(formatServerError("Failed to connect to server", translate)).toBe(
      "Failed to connect to server",
    );
  });

  test("uses translated unknown fallback", () => {
    expect(formatServerError(0, translate)).toBe("Unknown error");
  });

  test("falls back for unknown error objects and names", () => {
    expect(
      formatServerError(
        { name: "ServerTimeoutError", data: { seconds: 30 } },
        translate,
      ),
    ).toBe("Unknown error");
  });

  test("formats provider model errors using provider/model", () => {
    const error = {
      name: "ProviderModelNotFoundError",
      data: {
        providerID: "openai",
        modelID: "gpt-4.1",
      },
    } satisfies ProviderModelNotFoundError;

    expect(formatServerError(error, translate)).toBe(
      [
        "Model not found: openai/gpt-4.1",
        "Check the provider and model names in your config (opencode.json)",
      ].join("\n"),
    );
  });

  test("formats provider model suggestions", () => {
    const error = {
      name: "ProviderModelNotFoundError",
      data: {
        providerID: "x",
        modelID: "y",
        suggestions: ["x/y2", "x/y3"],
      },
    } satisfies ProviderModelNotFoundError;

    expect(formatServerError(error, translate)).toBe(
      [
        "Model not found: x/y",
        "Did you mean x/y2, x/y3?",
        "Check the provider and model names in your config (opencode.json)",
      ].join("\n"),
    );
  });
});
