import { describe, expect, it } from "vitest";
import {
  applyPermissionMode,
  defaultPermissionMode,
  getPermissionMode,
} from "./permission-mode";

type Controller = Parameters<typeof applyPermissionMode>[0];

function createController() {
  const calls: Array<{
    fn: "enableAutoAccept" | "disableAutoAccept";
    sessionID: string;
    directory: string | undefined;
  }> = [];
  const controller: Controller = {
    enableAutoAccept: (sessionID, directory) => {
      calls.push({ fn: "enableAutoAccept", sessionID, directory });
    },
    disableAutoAccept: (sessionID, directory) => {
      calls.push({ fn: "disableAutoAccept", sessionID, directory });
    },
  };
  return { calls, controller };
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
    const { calls, controller } = createController();

    applyPermissionMode(controller, "auto", "ses_1", "/repo");

    expect(calls).toEqual([
      { fn: "enableAutoAccept", sessionID: "ses_1", directory: "/repo" },
    ]);
  });

  it("disables auto-accept for ask mode", () => {
    const { calls, controller } = createController();

    applyPermissionMode(controller, "ask", "ses_1", "/repo");

    expect(calls).toEqual([
      { fn: "disableAutoAccept", sessionID: "ses_1", directory: "/repo" },
    ]);
  });
});
