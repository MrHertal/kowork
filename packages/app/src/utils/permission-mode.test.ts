import { describe, expect, it, vi } from "vitest";
import {
  applyPermissionMode,
  defaultPermissionMode,
  getPermissionMode,
} from "./permission-mode";

type Controller = Parameters<typeof applyPermissionMode>[0];

function createController() {
  return {
    enableAutoAccept: vi.fn<Controller["enableAutoAccept"]>(),
    disableAutoAccept: vi.fn<Controller["disableAutoAccept"]>(),
  };
}

describe("getPermissionMode", () => {
  it("maps auto-accept state to a mode", () => {
    expect(getPermissionMode(true)).toBe("auto");
    expect(getPermissionMode(false)).toBe("ask");
  });

  it("defaults to ask", () => {
    expect(defaultPermissionMode).toBe("ask");
  });
});

describe("applyPermissionMode", () => {
  it("enables auto-accept for auto mode", () => {
    const controller = createController();

    applyPermissionMode(controller, "auto", "ses_1", "/repo");

    expect(controller.enableAutoAccept).toHaveBeenCalledWith("ses_1", "/repo");
    expect(controller.disableAutoAccept).not.toHaveBeenCalled();
  });

  it("disables auto-accept for ask mode", () => {
    const controller = createController();

    applyPermissionMode(controller, "ask", "ses_1", "/repo");

    expect(controller.disableAutoAccept).toHaveBeenCalledWith("ses_1", "/repo");
    expect(controller.enableAutoAccept).not.toHaveBeenCalled();
  });
});
