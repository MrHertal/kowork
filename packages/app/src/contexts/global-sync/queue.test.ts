// @opencode-ref: opencode/packages/app/src/context/global-sync/queue.test.ts
import { describe, expect, test } from "vitest";
import { createRefreshQueue } from "./queue";

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

const createQueue = (calls: string[]) =>
  createRefreshQueue({
    paused: () => false,
    bootstrap: () => Promise.resolve(),
    bootstrapInstance: (directory) => {
      calls.push(directory);
      return Promise.resolve();
    },
  });

describe("createRefreshQueue", () => {
  test("clears queued directories before they drain", async () => {
    const calls: string[] = [];
    const queue = createQueue(calls);

    queue.push("/tmp/demo");
    queue.clear("/tmp/demo");

    await tick();

    expect(calls).toEqual([]);
    queue.dispose();
  });

  test("passes the directory to bootstrapInstance", async () => {
    const calls: string[] = [];
    const queue = createQueue(calls);

    queue.push("/tmp/demo");

    await tick();

    expect(calls).toEqual(["/tmp/demo"]);
    queue.dispose();
  });
});
