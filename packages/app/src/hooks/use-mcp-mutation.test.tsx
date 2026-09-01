// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  add: vi.fn(),
  authenticate: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  dispose: vi.fn(),
  patch: vi.fn(),
  status: vi.fn(),
  updateChild: vi.fn(),
}));

vi.mock("@/contexts/global-sdk", () => ({
  useGlobalSDK: () => ({
    client: { global: { dispose: doubles.dispose } },
    createClient: () => ({
      mcp: {
        add: doubles.add,
        auth: { authenticate: doubles.authenticate },
        connect: doubles.connect,
        disconnect: doubles.disconnect,
        status: doubles.status,
      },
    }),
  }),
}));

vi.mock("@/contexts/global-sync", () => ({
  useGlobalSync: () => ({ updateChild: doubles.updateChild }),
}));

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => ({ opencodeConfigPatch: doubles.patch }),
}));

import { useMcpMutation } from "./use-mcp-mutation";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { mutations: { retry: false } },
      })
    }
  >
    {children}
  </QueryClientProvider>
);

describe("useMcpMutation", () => {
  beforeEach(() => {
    Object.values(doubles).forEach((double) => double.mockReset());
    doubles.add.mockResolvedValue({
      data: { linear: { status: "needs_auth" } },
    });
    doubles.authenticate.mockResolvedValue(undefined);
    doubles.connect.mockResolvedValue(undefined);
    doubles.disconnect.mockResolvedValue(undefined);
    doubles.dispose.mockResolvedValue(undefined);
    doubles.patch.mockResolvedValue(undefined);
    doubles.status.mockResolvedValue({
      data: { linear: { status: "connected" } },
    });
  });

  test("reloads all directory runtimes after connector authentication", async () => {
    const hook = renderHook(() => useMcpMutation("/settings-project"), {
      wrapper,
    });

    await hook.result.current.mutateAsync({
      type: "add",
      name: "linear",
      config: {
        type: "remote",
        url: "https://mcp.linear.app/mcp",
        enabled: true,
      },
    });

    expect(doubles.patch).toHaveBeenCalledWith(
      ["mcp", "linear"],
      expect.objectContaining({ enabled: true }),
    );
    expect(doubles.authenticate).toHaveBeenCalledWith(
      { name: "linear" },
      expect.anything(),
    );
    expect(doubles.dispose).toHaveBeenCalledTimes(1);
    expect(doubles.status).toHaveBeenCalledTimes(1);
    expect(doubles.authenticate.mock.invocationCallOrder[0]).toBeLessThan(
      doubles.dispose.mock.invocationCallOrder[0]!,
    );
    expect(doubles.dispose.mock.invocationCallOrder[0]).toBeLessThan(
      doubles.status.mock.invocationCallOrder[0]!,
    );
  });

  test("reloads all directory runtimes after Google Calendar re-authentication", async () => {
    doubles.status.mockResolvedValue({
      data: { "google-calendar": { status: "connected" } },
    });
    const hook = renderHook(() => useMcpMutation("/settings-project"), {
      wrapper,
    });

    await hook.result.current.mutateAsync({
      type: "authenticate",
      name: "google-calendar",
    });

    expect(doubles.authenticate).toHaveBeenCalledWith(
      { name: "google-calendar" },
      expect.anything(),
    );
    expect(doubles.dispose).toHaveBeenCalledTimes(1);
    expect(doubles.status).toHaveBeenCalledTimes(1);
    expect(doubles.authenticate.mock.invocationCallOrder[0]).toBeLessThan(
      doubles.dispose.mock.invocationCallOrder[0]!,
    );
    expect(doubles.dispose.mock.invocationCallOrder[0]).toBeLessThan(
      doubles.status.mock.invocationCallOrder[0]!,
    );
  });

  test.each([
    ["enable", true],
    ["disable", false],
  ] as const)(
    "reloads all directory runtimes after %s",
    async (type, enabled) => {
      doubles.status.mockResolvedValue({
        data: { linear: { status: enabled ? "connected" : "disabled" } },
      });
      const hook = renderHook(() => useMcpMutation("/settings-project"), {
        wrapper,
      });

      await hook.result.current.mutateAsync({ type, name: "linear" });

      expect(doubles.patch).toHaveBeenCalledWith(
        ["mcp", "linear", "enabled"],
        enabled,
      );
      expect(doubles.dispose).toHaveBeenCalledTimes(1);
      expect(doubles.patch.mock.invocationCallOrder[0]).toBeLessThan(
        doubles.dispose.mock.invocationCallOrder[0]!,
      );
      expect(doubles.dispose.mock.invocationCallOrder[0]).toBeLessThan(
        doubles.status.mock.invocationCallOrder[0]!,
      );
    },
  );
});
