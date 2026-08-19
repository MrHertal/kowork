// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  toastError: vi.fn(),
  update: vi.fn<() => Promise<void>>(),
  updateData: vi.fn<
    () => { updateAvailable: boolean; version?: string } | undefined
  >(() => ({ updateAvailable: true, version: "2.0.0" })),
}));

vi.mock("sonner", () => ({
  toast: { error: doubles.toastError },
}));

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => ({ update: doubles.update }),
}));

vi.mock("@/hooks/use-update-check", () => ({
  useUpdateCheck: () => ({
    data: doubles.updateData(),
  }),
}));

import { UpdateCard } from "./update-card";

describe("UpdateCard", () => {
  beforeEach(() => {
    doubles.toastError.mockClear();
    doubles.update.mockReset();
    doubles.updateData.mockReturnValue({
      updateAvailable: true,
      version: "2.0.0",
    });
  });

  test("stays hidden until an update is ready", () => {
    doubles.updateData.mockReturnValue({ updateAvailable: true });

    render(<UpdateCard />);

    expect(screen.queryByText("Update available")).not.toBeInTheDocument();
  });

  test("reports installation failures", async () => {
    doubles.update.mockRejectedValue(new Error("install failed"));
    const user = userEvent.setup();
    render(<UpdateCard />);

    await user.click(screen.getByRole("button", { name: "Update now" }));

    await waitFor(() =>
      expect(doubles.toastError).toHaveBeenCalledWith("Request failed", {
        description: "install failed",
      }),
    );
    expect(screen.getByRole("button", { name: "Update now" })).toBeEnabled();
  });
});
