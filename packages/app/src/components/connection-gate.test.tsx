// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  checkHealth: vi.fn(() => Promise.resolve({ healthy: false })),
  installUpdate: vi.fn(() => Promise.resolve()),
  refetchUpdate: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/contexts/server", () => ({
  useServer: () => ({
    current: { type: "http", http: "http://localhost:4096" },
    isLocal: true,
    key: "sidecar",
    name: "Kowork",
  }),
}));

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => ({
    checkUpdate: vi.fn(),
    update: doubles.installUpdate,
  }),
}));

vi.mock("@/hooks/use-update-check", () => ({
  useUpdateCheck: () => ({
    data: { updateAvailable: true, version: "2.0.0" },
    isFetching: false,
    refetch: doubles.refetchUpdate,
  }),
}));

vi.mock("@/utils/server-health", () => ({
  useCheckServerHealth: () => doubles.checkHealth,
}));

import { ConnectionGate } from "./connection-gate";

describe("ConnectionGate", () => {
  beforeEach(() => {
    doubles.checkHealth.mockClear();
    doubles.installUpdate.mockClear();
    doubles.refetchUpdate.mockClear();
  });

  test("offers a downloaded update when the server is unreachable", async () => {
    const user = userEvent.setup();
    render(
      <ConnectionGate>
        <div>Connected</div>
      </ConnectionGate>,
    );

    const install = await screen.findByRole("button", {
      name: "Install & restart",
    });
    expect(screen.getByText("Kowork can't connect right now.")).toBeVisible();

    await user.click(install);

    await waitFor(() => expect(doubles.installUpdate).toHaveBeenCalledTimes(1));
  });

  test("reports installation failures", async () => {
    doubles.installUpdate.mockRejectedValueOnce(new Error("install failed"));
    const user = userEvent.setup();
    render(
      <ConnectionGate>
        <div>Connected</div>
      </ConnectionGate>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Install & restart" }),
    );

    expect(await screen.findByText("install failed")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Install & restart" }),
    ).toBeEnabled();
  });
});
