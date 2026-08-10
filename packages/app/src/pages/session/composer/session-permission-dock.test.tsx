// @vitest-environment jsdom
import type { PermissionRequest } from "@opencode-ai/sdk/v2/client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { SessionPermissionDock } from "./session-permission-dock";

const request = (input: { permission: string; patterns?: string[] }) =>
  ({
    id: "perm_1",
    sessionID: "ses_1",
    permission: input.permission,
    patterns: input.patterns ?? [],
    metadata: {},
    always: [],
  }) as PermissionRequest;

type OnDecide = Parameters<typeof SessionPermissionDock>[0]["onDecide"];

function setup(
  input: { request?: PermissionRequest; responding?: boolean } = {},
) {
  const onDecide = vi.fn<OnDecide>();
  const view = render(
    <SessionPermissionDock
      request={input.request ?? request({ permission: "bash" })}
      responding={input.responding ?? false}
      onDecide={onDecide}
    />,
  );
  return { onDecide, ...view };
}

describe("SessionPermissionDock", () => {
  test("renders the header, tool description, and patterns", () => {
    setup({
      request: request({ permission: "bash", patterns: ["*", "src/**"] }),
    });

    expect(screen.getByText("Permission required")).toBeInTheDocument();
    expect(
      screen.getByText("Run commands on your computer"),
    ).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.getByText("src/**")).toBeInTheDocument();
  });

  test("renders no description for an unknown permission", () => {
    const { container } = setup({
      request: request({ permission: "mcp_custom" }),
    });

    expect(screen.getByText("Permission required")).toBeInTheDocument();
    expect(container.querySelector("p")).toBeNull();
  });

  test("calls onDecide with reject, always, and once", async () => {
    const user = userEvent.setup();
    const { onDecide } = setup();

    await user.click(screen.getByRole("button", { name: "Deny" }));
    expect(onDecide).toHaveBeenCalledWith("perm_1", "ses_1", "reject");

    await user.click(screen.getByRole("button", { name: "Always allow" }));
    expect(onDecide).toHaveBeenCalledWith("perm_1", "ses_1", "always");

    await user.click(screen.getByRole("button", { name: "Allow once" }));
    expect(onDecide).toHaveBeenCalledWith("perm_1", "ses_1", "once");
    expect(onDecide).toHaveBeenCalledTimes(3);
  });

  test("disables all buttons while responding", async () => {
    const user = userEvent.setup();
    const { onDecide } = setup({ responding: true });

    for (const name of ["Deny", "Always allow", "Allow once"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }

    await user.click(screen.getByRole("button", { name: "Allow once" }));
    expect(onDecide).not.toHaveBeenCalled();
  });

  test("activates buttons from the keyboard in tab order", async () => {
    const user = userEvent.setup();
    const { onDecide } = setup();

    await user.tab();
    expect(screen.getByRole("button", { name: "Deny" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Always allow" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Allow once" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onDecide).toHaveBeenCalledWith("perm_1", "ses_1", "once");
  });
});
