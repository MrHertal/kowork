// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  Model,
  Provider,
  ProviderListResponse,
} from "@opencode-ai/sdk/v2/client";

const doubles = vi.hoisted(() => {
  const providers: ProviderListResponse = {
    all: [],
    connected: [],
    default: {},
  };
  return { providers };
});

vi.mock("@/contexts/global-sync", async () => {
  const { Store } = await import("@tanstack/react-store");
  return {
    shallowArrayEqual: <T,>(a: T[], b: T[]) =>
      a.length === b.length && a.every((item, i) => item === b[i]),
    useGlobalSync: () => ({
      _globalStore: new Store({}),
      _child: () => undefined,
    }),
    useGlobalData: () => doubles.providers,
  };
});

import { useProviders } from "./use-providers";

function model(id: string, cost?: { input: number }): Model {
  return { id, cost } as Model;
}

function provider(id: string, models: Record<string, Model>): Provider {
  return { id, name: id, models } as Provider;
}

function wrapper() {
  return ({ children }: { children: ReactNode }) => <>{children}</>;
}

describe("useProviders", () => {
  beforeEach(() => {
    doubles.providers = { all: [], connected: [], default: {} };
  });

  test("classifies credential-less opencode with only free models as free tier", () => {
    const opencode = provider("opencode", {
      "big-pickle": model("big-pickle", { input: 0 }),
    });
    doubles.providers = {
      all: [opencode],
      connected: ["opencode"],
      default: {},
    };

    const { result } = renderHook(() => useProviders(), {
      wrapper: wrapper(),
    });

    expect(result.current.free.map((p) => p.id)).toEqual(["opencode"]);
    expect(result.current.paid).toEqual([]);
    expect(result.current.connected.map((p) => p.id)).toEqual(["opencode"]);
  });

  test("classifies opencode with paid models as paid", () => {
    const opencode = provider("opencode", {
      "big-pickle": model("big-pickle", { input: 0 }),
      "claude-sonnet": model("claude-sonnet", { input: 3 }),
    });
    doubles.providers = {
      all: [opencode],
      connected: ["opencode"],
      default: {},
    };

    const { result } = renderHook(() => useProviders(), {
      wrapper: wrapper(),
    });

    expect(result.current.paid.map((p) => p.id)).toEqual(["opencode"]);
    expect(result.current.free).toEqual([]);
  });

  test("never classifies other providers as free tier", () => {
    const anthropic = provider("anthropic", {
      haiku: model("haiku", { input: 0 }),
    });
    doubles.providers = {
      all: [anthropic],
      connected: ["anthropic"],
      default: {},
    };

    const { result } = renderHook(() => useProviders(), {
      wrapper: wrapper(),
    });

    expect(result.current.paid.map((p) => p.id)).toEqual(["anthropic"]);
    expect(result.current.free).toEqual([]);
  });

  test("excludes unconnected providers from free and paid", () => {
    const opencode = provider("opencode", {
      "big-pickle": model("big-pickle", { input: 0 }),
    });
    doubles.providers = { all: [opencode], connected: [], default: {} };

    const { result } = renderHook(() => useProviders(), {
      wrapper: wrapper(),
    });

    expect(result.current.free).toEqual([]);
    expect(result.current.paid).toEqual([]);
    expect(result.current.connected).toEqual([]);
  });
});
