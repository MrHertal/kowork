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

  test("does not drain while paused", async () => {
    const calls: string[] = [];
    let paused = true;
    const queue = createRefreshQueue({
      paused: () => paused,
      bootstrap: () => Promise.resolve(),
      bootstrapInstance: (directory) => {
        calls.push(directory);
        return Promise.resolve();
      },
    });

    queue.push("/tmp/demo");
    await tick();
    expect(calls).toEqual([]);

    paused = false;
    queue.push("/tmp/demo2");
    await tick();
    expect(calls).toEqual(["/tmp/demo", "/tmp/demo2"]);
    queue.dispose();
  });

  test("refresh while paused defers bootstrap until unpause", async () => {
    const bootstraps: string[] = [];
    let paused = true;
    const queue = createRefreshQueue({
      paused: () => paused,
      bootstrap: () => {
        bootstraps.push("root");
        return Promise.resolve();
      },
      bootstrapInstance: () => Promise.resolve(),
    });

    queue.refresh();
    await tick();
    expect(bootstraps).toEqual([]);

    paused = false;
    queue.refresh();
    await tick();
    expect(bootstraps).toEqual(["root"]);
    queue.dispose();
  });

  test("dispose cancels the scheduled drain", async () => {
    const calls: string[] = [];
    const queue = createQueue(calls);

    queue.push("/tmp/demo");
    queue.dispose();

    await tick();

    expect(calls).toEqual([]);
  });
});
