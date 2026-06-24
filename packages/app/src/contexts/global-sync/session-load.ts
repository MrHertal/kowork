// @opencode-ref: opencode/packages/app/src/context/global-sync/session-load.ts
import type { RootLoadArgs } from "./types";

function failure(result: { error?: unknown; response: Response }): unknown {
  if (result.error !== undefined) return result.error;
  return new Error(
    `Session list failed (${result.response.status} ${result.response.statusText})`,
  );
}

export async function loadRootSessionsWithFallback(input: RootLoadArgs) {
  const result = await input.list({
    directory: input.directory,
    roots: true,
    limit: input.limit,
  });
  if (result.response.ok) {
    return {
      data: result.data,
      limit: input.limit,
      limited: true,
    };
  }
  if (result.response.status !== 400) {
    throw failure(result);
  }
  const fallback = await input.list({
    directory: input.directory,
    roots: true,
  });
  if (!fallback.response.ok) {
    throw failure(fallback);
  }
  return {
    data: fallback.data,
    limit: input.limit,
    limited: false,
  };
}

export function estimateRootSessionTotal(input: {
  count: number;
  limit: number;
  limited: boolean;
}) {
  if (!input.limited) return input.count;
  if (input.count < input.limit) return input.count;
  return input.count + 1;
}
