import { describe, expect, it, vi } from "vitest";
import { createEmitter } from "./emitter";

type Events = {
  loaded: { count: number };
  saved: string;
};

describe("createEmitter", () => {
  it("delivers events to handlers subscribed to the same name", () => {
    const emitter = createEmitter<Events>();
    const handler = vi.fn<(event: Events["loaded"]) => void>();

    emitter.on("loaded", handler);
    emitter.emit("loaded", { count: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ count: 2 });
  });

  it("does not call handlers subscribed to a different name", () => {
    const emitter = createEmitter<Events>();
    const handler = vi.fn<(event: Events["saved"]) => void>();

    emitter.on("saved", handler);
    emitter.emit("loaded", { count: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple handlers on the same channel", () => {
    const emitter = createEmitter<Events>();
    const first = vi.fn<(event: Events["saved"]) => void>();
    const second = vi.fn<(event: Events["saved"]) => void>();

    emitter.on("saved", first);
    emitter.on("saved", second);
    emitter.emit("saved", "a");

    expect(first).toHaveBeenCalledWith("a");
    expect(second).toHaveBeenCalledWith("a");
  });

  it("registers the same handler only once per channel", () => {
    const emitter = createEmitter<Events>();
    const handler = vi.fn<(event: Events["saved"]) => void>();

    emitter.on("saved", handler);
    emitter.on("saved", handler);
    emitter.emit("saved", "a");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("stops delivering after unsubscribe", () => {
    const emitter = createEmitter<Events>();
    const handler = vi.fn<(event: Events["loaded"]) => void>();

    const unsubscribe = emitter.on("loaded", handler);
    emitter.emit("loaded", { count: 1 });
    unsubscribe();
    emitter.emit("loaded", { count: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("tolerates unsubscribing twice", () => {
    const emitter = createEmitter<Events>();
    const handler = vi.fn<(event: Events["saved"]) => void>();

    const unsubscribe = emitter.on("saved", handler);
    unsubscribe();
    unsubscribe();
    emitter.emit("saved", "a");

    expect(handler).not.toHaveBeenCalled();
  });

  it("allows resubscribing after the last handler of a channel leaves", () => {
    const emitter = createEmitter<Events>();
    const handler = vi.fn<(event: Events["saved"]) => void>();

    emitter.on("saved", handler)();
    emitter.on("saved", handler);
    emitter.emit("saved", "a");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("emits without listeners without throwing", () => {
    const emitter = createEmitter<Events>();

    expect(() => emitter.emit("loaded", { count: 0 })).not.toThrow();
  });

  it("delivers every event to global listeners with name and details", () => {
    const emitter = createEmitter<Events>();
    const handler = vi.fn();

    emitter.listen(handler);
    emitter.emit("loaded", { count: 3 });
    emitter.emit("saved", "x");

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, {
      name: "loaded",
      details: { count: 3 },
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      name: "saved",
      details: "x",
    });
  });

  it("calls global listeners before channel handlers", () => {
    const emitter = createEmitter<Events>();
    const calls: string[] = [];

    emitter.on("saved", () => calls.push("channel"));
    emitter.listen(() => calls.push("global"));
    emitter.emit("saved", "a");

    expect(calls).toEqual(["global", "channel"]);
  });

  it("stops delivering to global listeners after unsubscribe", () => {
    const emitter = createEmitter<Events>();
    const handler = vi.fn();

    const unsubscribe = emitter.listen(handler);
    emitter.emit("saved", "a");
    unsubscribe();
    emitter.emit("saved", "b");

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
