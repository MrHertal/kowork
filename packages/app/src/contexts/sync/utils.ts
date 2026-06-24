// @opencode-ref: opencode/packages/app/src/context/sync.tsx
import type { Part } from "@opencode-ai/sdk/v2/client";

export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function sortParts(parts: Part[]) {
  return parts.filter((part) => !!part?.id).sort((a, b) => cmp(a.id, b.id));
}

export function merge<T extends { id: string }>(
  a: readonly T[],
  b: readonly T[],
) {
  const map = new Map(a.map((item) => [item.id, item] as const));
  for (const item of b) map.set(item.id, item);
  return [...map.values()].sort((x, y) => cmp(x.id, y.id));
}

export function runInflight(
  map: Map<string, Promise<void>>,
  key: string,
  task: () => Promise<void>,
) {
  const pending = map.get(key);
  if (pending) return pending;
  const promise = task().finally(() => {
    map.delete(key);
  });
  map.set(key, promise);
  return promise;
}

export const keyFor = (directory: string, id: string) => `${directory}\n${id}`;
