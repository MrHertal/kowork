// @opencode-ref: opencode/packages/app/src/pages/session/session-model-helpers.ts
import type { UserMessage } from "@opencode-ai/sdk/v2/client";
import type { useLocal } from "@/contexts/local";

type Local = Pick<ReturnType<typeof useLocal>, "session">;

export const resetSessionModel = (local: Local) => {
  local.session.reset();
};

export const syncSessionModel = (local: Local, msg: UserMessage) => {
  local.session.restore(msg);
};
