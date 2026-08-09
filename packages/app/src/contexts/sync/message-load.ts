// @opencode-ref: opencode/packages/app/src/context/sync.tsx
import type { OpencodeClient, Part } from "@opencode-ai/sdk/v2/client";
import { retry } from "@/utils/retry";
import { message as clean } from "@/utils/diffs";
import type { GlobalSyncContextValue } from "@/contexts/global-sync";
import { sortParts, merge, keyFor } from "./utils";
import { mergeOptimisticPage, type OptimisticItem } from "./optimistic";

const SKIP_PARTS = new Set(["step-start", "step-finish"]);

function preferDeltaExtension(cached: Part, fetched: Part): Part {
  if (cached.id !== fetched.id || cached.type !== fetched.type) return fetched;
  let merged: Record<string, unknown> | undefined;
  for (const key of Object.keys(cached)) {
    const cv = (cached as Record<string, unknown>)[key];
    const fv = (fetched as Record<string, unknown>)[key];
    if (
      typeof cv === "string" &&
      typeof fv === "string" &&
      cv.length > fv.length &&
      cv.startsWith(fv)
    ) {
      if (!merged) merged = { ...fetched };
      merged[key] = cv;
    }
  }
  return (merged as Part | undefined) ?? fetched;
}

function mergeParts(cached: Part[] | undefined, fetched: Part[]): Part[] {
  if (!cached || cached.length === 0) return fetched;
  const cachedByID = new Map(cached.map((p) => [p.id, p]));
  const fetchedIDs = new Set(fetched.map((p) => p.id));
  const reconciled = fetched.map((fp) => {
    const cp = cachedByID.get(fp.id);
    return cp ? preferDeltaExtension(cp, fp) : fp;
  });
  for (const cp of cached) {
    if (!fetchedIDs.has(cp.id)) reconciled.push(cp);
  }
  return sortParts(reconciled);
}

export const initialMessagePageSize = 80;
export const historyMessagePageSize = 200;

export type MetaState = {
  limit: Record<string, number>;
  cursor: Record<string, string | undefined>;
  complete: Record<string, boolean>;
};

export async function fetchMessages(input: {
  client: OpencodeClient;
  sessionID: string;
  limit: number;
  before?: string;
}) {
  const messages = await retry(() =>
    input.client.session.messages({
      sessionID: input.sessionID,
      limit: input.limit,
      before: input.before,
    }),
  );
  const items = (messages.data ?? []).filter((x) => !!x?.info?.id);
  const session = items
    .map((x) => clean(x.info))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const part = items.map((message) => ({
    id: message.info.id,
    part: sortParts(message.parts),
  }));
  const cursor = messages.response.headers.get("x-next-cursor") ?? undefined;
  return { session, part, cursor, complete: !cursor };
}

export async function loadMessages(input: {
  directory: string;
  client: OpencodeClient;
  sessionID: string;
  limit: number;
  before?: string;
  mode?: "replace" | "prepend";
  meta: MetaState;
  globalSync: GlobalSyncContextValue;
  getOptimistic: (directory: string, sessionID: string) => OptimisticItem[];
  clearOptimistic: (
    directory: string,
    sessionID: string,
    messageID?: string,
  ) => void;
}) {
  const key = keyFor(input.directory, input.sessionID);
  const gs = input.globalSync;
  const childStore = gs._child(input.directory);
  if (childStore.state.message_loading[key]) return;

  const trackedAtStart = childStore.state.session.some(
    (s) => s.id === input.sessionID,
  );

  gs.updateChild(input.directory, (draft) => {
    draft.message_loading[key] = true;
  });
  await fetchMessages({
    client: input.client,
    sessionID: input.sessionID,
    limit: input.limit,
    before: input.before,
  })
    .then((page) => {
      if (trackedAtStart) {
        const trackedAtApply = childStore.state.session.some(
          (s) => s.id === input.sessionID,
        );
        if (!trackedAtApply) return;
      }

      const next = mergeOptimisticPage(
        page,
        input.getOptimistic(input.directory, input.sessionID),
      );
      for (const messageID of next.confirmed) {
        input.clearOptimistic(input.directory, input.sessionID, messageID);
      }
      let messageCount = next.session.length;
      gs.updateChild(input.directory, (draft) => {
        const cachedMessages = draft.message[input.sessionID] ?? [];
        const message = merge(cachedMessages, next.session);
        draft.message[input.sessionID] = message;
        messageCount = message.length;
        for (const p of next.part) {
          const filtered = p.part.filter((x) => !SKIP_PARTS.has(x.type));
          if (!filtered.length) continue;
          draft.part[p.id] = mergeParts(draft.part[p.id], filtered);
        }
      });

      input.meta.limit[key] = messageCount;
      input.meta.cursor[key] = next.cursor;
      input.meta.complete[key] = next.complete;
    })
    .finally(() => {
      gs.updateChild(input.directory, (draft) => {
        delete draft.message_loading[key];
      });
    });
}
