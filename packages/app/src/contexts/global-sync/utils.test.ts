// @opencode-ref: opencode/packages/app/src/context/global-sync/utils.test.ts
import { describe, expect, test } from "vitest";
import type {
  Agent,
  Model,
  Project,
  ProviderListResponse,
} from "@opencode-ai/sdk/v2/client";
import {
  normalizeAgentList,
  normalizeProviderList,
  sanitizeProject,
} from "./utils";

const agent = (name = "build") =>
  ({
    name,
    mode: "primary",
    permission: {},
    options: {},
  }) as Agent;

describe("normalizeAgentList", () => {
  test("keeps array payloads", () => {
    expect(normalizeAgentList([agent("build"), agent("docs")])).toEqual([
      agent("build"),
      agent("docs"),
    ]);
  });

  test("wraps a single agent payload", () => {
    expect(normalizeAgentList(agent("docs"))).toEqual([agent("docs")]);
  });

  test("extracts agents from keyed objects", () => {
    expect(
      normalizeAgentList({
        build: agent("build"),
        docs: agent("docs"),
      }),
    ).toEqual([agent("build"), agent("docs")]);
  });

  test("drops invalid payloads", () => {
    expect(normalizeAgentList({ name: "AbortError" })).toEqual([]);
    expect(normalizeAgentList([{ name: "build" }, agent("docs")])).toEqual([
      agent("docs"),
    ]);
  });
});

describe("normalizeProviderList", () => {
  const model = (status?: "active" | "deprecated") =>
    (status ? { status } : {}) as Model;

  const response = {
    all: [
      {
        id: "openai",
        name: "OpenAI",
        source: "config",
        env: [],
        options: {},
        models: {
          current: model("active"),
          statusless: model(),
          legacy: model("deprecated"),
        },
      },
    ],
    default: {},
    connected: ["openai"],
  } as ProviderListResponse;

  test("drops deprecated models but keeps active and statusless ones", () => {
    const result = normalizeProviderList(response);
    expect(Object.keys(result.all[0]?.models ?? {})).toEqual([
      "current",
      "statusless",
    ]);
  });

  test("preserves other provider fields", () => {
    const result = normalizeProviderList(response);
    expect(result.all[0]?.id).toBe("openai");
    expect(result.default).toEqual({});
    expect(result.connected).toEqual(["openai"]);
  });
});

describe("sanitizeProject", () => {
  const project = (icon?: {
    url?: string;
    override?: string;
    color?: string;
  }) => ({ id: "project-1", worktree: "/tmp/project", icon }) as Project;

  test("strips icon url and override but keeps other icon fields", () => {
    const result = sanitizeProject(
      project({
        url: "https://example.com/icon.png",
        override: "#fff",
        color: "red",
      }),
    );
    expect(result.icon?.url).toBeUndefined();
    expect(result.icon?.override).toBeUndefined();
    expect(result.icon?.color).toBe("red");
  });

  test("returns the same project when nothing needs stripping", () => {
    const input = project({ color: "red" });
    expect(sanitizeProject(input)).toBe(input);
  });
});
