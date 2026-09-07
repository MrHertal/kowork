import { describe, expect, test } from "vitest";

import { dedupeAvailable } from "./models";

const baseStore = { user: [], recent: [], variant: {} };

function model(
  providerID: string,
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name: "gpt-oss-120b",
    family: "gpt-oss",
    release_date: "2025-08-05",
    provider: { id: providerID, models: {} },
    ...overrides,
  } as unknown as Parameters<typeof dedupeAvailable>[0][number];
}

describe("dedupeAvailable", () => {
  test("keeps distinct models untouched", () => {
    const a = model("amazon-bedrock", "openai.gpt-oss-120b");
    const b = model("amazon-bedrock", "openai.gpt-oss-20b", {
      name: "gpt-oss-20b",
    });
    expect(dedupeAvailable([a, b], baseStore)).toHaveLength(2);
  });

  test("collapses versioned and unversioned duplicates, preferring unversioned", () => {
    const versioned = model("amazon-bedrock", "openai.gpt-oss-120b-1:0");
    const plain = model("amazon-bedrock", "openai.gpt-oss-120b");
    const result = dedupeAvailable([versioned, plain], baseStore);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("openai.gpt-oss-120b");
  });

  test("collapses dated and (latest) aliases, preferring the (latest) alias", () => {
    const dated = model("anthropic", "claude-haiku-4-5-20251001", {
      name: "Claude Haiku 4.5",
      family: "claude-haiku",
    });
    const latest = model("anthropic", "claude-haiku-4-5", {
      name: "Claude Haiku 4.5 (latest)",
      family: "claude-haiku",
    });
    const result = dedupeAvailable([dated, latest], baseStore);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("claude-haiku-4-5");
  });

  test("does not collapse same name across different providers", () => {
    const bedrock = model("amazon-bedrock", "openai.gpt-oss-120b");
    const openrouter = model("openrouter", "openai/gpt-oss-120b");
    expect(dedupeAvailable([bedrock, openrouter], baseStore)).toHaveLength(2);
  });

  test("does not collapse same name with different family", () => {
    const a = model("amazon-bedrock", "openai.gpt-oss-120b");
    const b = model("amazon-bedrock", "openai.gpt-oss-120b-1:0", {
      family: "other",
    });
    expect(dedupeAvailable([a, b], baseStore)).toHaveLength(2);
  });

  test("prefers the entry the user toggled", () => {
    const versioned = model("amazon-bedrock", "openai.gpt-oss-120b-1:0");
    const plain = model("amazon-bedrock", "openai.gpt-oss-120b");
    const store = {
      ...baseStore,
      user: [
        {
          providerID: "amazon-bedrock",
          modelID: "openai.gpt-oss-120b-1:0",
          visibility: "show" as const,
        },
      ],
    };
    const result = dedupeAvailable([plain, versioned], store);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("openai.gpt-oss-120b-1:0");
  });

  test("prefers the entry in recents", () => {
    const versioned = model("amazon-bedrock", "openai.gpt-oss-120b-1:0");
    const plain = model("amazon-bedrock", "openai.gpt-oss-120b");
    const store = {
      ...baseStore,
      recent: [
        { providerID: "amazon-bedrock", modelID: "openai.gpt-oss-120b-1:0" },
      ],
    };
    const result = dedupeAvailable([plain, versioned], store);
    expect(result[0]!.id).toBe("openai.gpt-oss-120b-1:0");
  });

  test("falls back to newest release date when neither is preferred", () => {
    const older = model("amazon-bedrock", "openai.gpt-oss-120b-1:0", {
      release_date: "2025-08-05",
    });
    const newer = model("amazon-bedrock", "openai.gpt-oss-120b-2:0", {
      release_date: "2025-09-01",
    });
    const result = dedupeAvailable([older, newer], baseStore);
    expect(result[0]!.id).toBe("openai.gpt-oss-120b-2:0");
  });
});
