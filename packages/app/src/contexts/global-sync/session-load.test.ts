// @opencode-ref: opencode/packages/app/src/context/server-sync.test.ts
import { describe, expect, test } from "vitest";
import type { Session } from "@opencode-ai/sdk/v2/client";
import {
  estimateRootSessionTotal,
  loadRootSessionsWithFallback,
} from "./session-load";
import type { RootLoadArgs } from "./types";

type Query = Parameters<RootLoadArgs["list"]>[0];

const ok = (data: Session[] = []) => ({
  data,
  response: new Response(null, { status: 200 }),
});

describe("loadRootSessionsWithFallback", () => {
  test("uses limited roots query when supported", async () => {
    const calls: Query[] = [];

    const result = await loadRootSessionsWithFallback({
      directory: "dir",
      limit: 10,
      list: (query) => {
        calls.push(query);
        return Promise.resolve(ok());
      },
    });

    expect(result.data).toEqual([]);
    expect(result.limited).toBe(true);
    expect(calls).toEqual([{ directory: "dir", roots: true, limit: 10 }]);
  });

  test("falls back to full roots query on limited-query failure", async () => {
    const calls: Query[] = [];

    const result = await loadRootSessionsWithFallback({
      directory: "dir",
      limit: 25,
      list: (query) => {
        calls.push(query);
        if (query.limit) {
          return Promise.resolve({
            response: new Response(null, { status: 400 }),
          });
        }
        return Promise.resolve(ok());
      },
    });

    expect(result.data).toEqual([]);
    expect(result.limited).toBe(false);
    expect(calls).toEqual([
      { directory: "dir", roots: true, limit: 25 },
      { directory: "dir", roots: true },
    ]);
  });

  test("throws the server error for non-400 failures", async () => {
    const failure = new Error("boom");

    await expect(
      loadRootSessionsWithFallback({
        directory: "dir",
        limit: 10,
        list: () =>
          Promise.resolve({
            error: failure,
            response: new Response(null, { status: 500 }),
          }),
      }),
    ).rejects.toBe(failure);
  });

  test("throws a status error when the response has no error payload", async () => {
    await expect(
      loadRootSessionsWithFallback({
        directory: "dir",
        limit: 10,
        list: () =>
          Promise.resolve({
            response: new Response(null, {
              status: 500,
              statusText: "Internal Server Error",
            }),
          }),
      }),
    ).rejects.toThrow("Session list failed (500 Internal Server Error)");
  });

  test("throws when the fallback query also fails", async () => {
    await expect(
      loadRootSessionsWithFallback({
        directory: "dir",
        limit: 10,
        list: (query) =>
          Promise.resolve({
            response: new Response(null, {
              status: query.limit ? 400 : 500,
              statusText: "err",
            }),
          }),
      }),
    ).rejects.toThrow("Session list failed (500 err)");
  });
});

describe("estimateRootSessionTotal", () => {
  test("keeps exact total for full fetches", () => {
    expect(
      estimateRootSessionTotal({ count: 42, limit: 10, limited: false }),
    ).toBe(42);
  });

  test("marks has-more for full-limit limited fetches", () => {
    expect(
      estimateRootSessionTotal({ count: 10, limit: 10, limited: true }),
    ).toBe(11);
  });

  test("keeps exact total when limited fetch is under limit", () => {
    expect(
      estimateRootSessionTotal({ count: 9, limit: 10, limited: true }),
    ).toBe(9);
  });
});
