// @opencode-ref: opencode/packages/app/src/context/global-sync/session-cache.ts
import type {
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  SessionStatus,
  SnapshotFileDiff,
  Todo,
} from "@opencode-ai/sdk/v2/client";

export const SESSION_CACHE_LIMIT = 40;

type SessionCache = {
  session_status: Record<string, SessionStatus | undefined>;
  session_diff: Record<string, SnapshotFileDiff[] | undefined>;
  todo: Record<string, Todo[] | undefined>;
  message: Record<string, Message[] | undefined>;
  part: Record<string, Part[] | undefined>;
  permission: Record<string, PermissionRequest[] | undefined>;
  question: Record<string, QuestionRequest[] | undefined>;
};

export function dropSessionCaches(
  store: SessionCache,
  sessionIDs: Iterable<string>,
) {
  const stale = new Set(Array.from(sessionIDs).filter(Boolean));
  if (stale.size === 0) return;

  for (const key of Object.keys(store.part)) {
    const parts = store.part[key];
    if (!parts?.some((part) => stale.has(part?.sessionID ?? ""))) continue;
    delete store.part[key];
  }

  for (const sessionID of stale) {
    delete store.message[sessionID];
    delete store.todo[sessionID];
    delete store.session_diff[sessionID];
    delete store.session_status[sessionID];
    delete store.permission[sessionID];
    delete store.question[sessionID];
  }
}
