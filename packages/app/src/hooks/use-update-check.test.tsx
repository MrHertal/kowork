// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  checkUpdate: vi.fn(() =>
    Promise.resolve({ updateAvailable: false, version: undefined }),
  ),
  settings: {
    ready: false,
    updates: { startup: true },
  },
}));

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => ({ checkUpdate: doubles.checkUpdate }),
}));

vi.mock("@/contexts/settings", () => ({
  useSettings: () => doubles.settings,
}));

import { useUpdateCheck } from "./use-update-check";

describe("useUpdateCheck", () => {
  beforeEach(() => {
    doubles.checkUpdate.mockClear();
    doubles.settings.ready = false;
    doubles.settings.updates.startup = true;
  });

  test("waits for persisted settings before checking", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => useUpdateCheck(), { wrapper });

    expect(doubles.checkUpdate).not.toHaveBeenCalled();

    doubles.settings.ready = true;
    hook.rerender();

    await waitFor(() => expect(doubles.checkUpdate).toHaveBeenCalledTimes(1));
  });

  test("respects a persisted opt-out", () => {
    doubles.settings.ready = true;
    doubles.settings.updates.startup = false;
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    renderHook(() => useUpdateCheck(), { wrapper });

    expect(doubles.checkUpdate).not.toHaveBeenCalled();
  });
});
