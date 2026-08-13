// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  toastError: vi.fn(),
  update: vi.fn<() => Promise<void>>(),
}));

vi.mock("sonner", () => ({
  toast: { error: doubles.toastError },
}));

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => ({ update: doubles.update }),
}));

vi.mock("@/hooks/use-update-check", () => ({
  useUpdateCheck: () => ({
    data: { updateAvailable: true, version: "2.0.0" },
  }),
}));

import { UpdateCard } from "./update-card";

describe("UpdateCard", () => {
  beforeEach(() => {
    doubles.toastError.mockClear();
    doubles.update.mockReset();
  });

  test("reports installation failures", async () => {
    doubles.update.mockRejectedValue(new Error("install failed"));
    const user = userEvent.setup();
    render(<UpdateCard />);

    await user.click(
      screen.getByRole("button", { name: "Install & restart" }),
    );

    await waitFor(() =>
      expect(doubles.toastError).toHaveBeenCalledWith("Request failed", {
        description: "install failed",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Install & restart" }),
    ).toBeEnabled();
  });
});
