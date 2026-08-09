// @vitest-environment jsdom
import type { Event, OpencodeClient } from "@opencode-ai/sdk/v2/client";
import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { toast } from "sonner";

import {
  PlatformProvider,
  type AsyncStorage,
  type Platform,
} from "@/contexts/platform";
import { PromptProvider, usePrompt } from "@/contexts/prompt";
import { SDKProvider } from "@/contexts/sdk";
import { createEmitter } from "@/utils/emitter";
import { usePromptAttachments } from "./attachments";

const directory = "/tmp/project";

type EventMap = { [key: string]: Event };

const client = {} as unknown as OpencodeClient;
const emitter = createEmitter<EventMap>();

vi.mock("@/contexts/global-sdk", () => ({
  useGlobalSDK: () => ({
    url: "http://localhost:4096",
    client,
    event: emitter,
    createClient: () => client,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

function createStorage(memory: Map<string, string>): AsyncStorage {
  return {
    getItem: (key) => Promise.resolve(memory.get(key) ?? null),
    setItem: (key, value) => {
      memory.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      memory.delete(key);
      return Promise.resolve();
    },
    clear: () => {
      memory.clear();
      return Promise.resolve();
    },
    key: (index) => Promise.resolve([...memory.keys()][index]),
    getLength: () => Promise.resolve(memory.size),
  };
}

const png = (name = "a.png") => new File(["abc"], name, { type: "image/png" });

const binary = () =>
  new File([Uint8Array.of(0, 255, 1, 2)], "blob.bin", {
    type: "application/octet-stream",
  });

class BrokenFileReader {
  addEventListener(event: string, cb: () => void) {
    if (event === "error") queueMicrotask(cb);
  }
  readAsDataURL() {}
}

const pasteEvent = (input: {
  items: Array<{ kind: string; getAsFile: () => File | null }>;
  text?: string;
}) => {
  const preventDefault = vi.fn();
  const event = {
    clipboardData: {
      items: input.items,
      getData: () => input.text ?? "",
    },
    preventDefault,
  } as unknown as React.ClipboardEvent<HTMLTextAreaElement>;
  return { event, preventDefault };
};

let prompt: ReturnType<typeof usePrompt>;
let attachments: ReturnType<typeof usePromptAttachments>;
let platform: Platform;

function Capture() {
  const ctx = usePrompt();
  const api = usePromptAttachments();
  useEffect(() => {
    prompt = ctx;
    attachments = api;
  });
  return null;
}

const images = () => prompt.current.filter((part) => part.type === "image");

async function setup() {
  render(
    <PlatformProvider value={platform}>
      <SDKProvider directory={directory}>
        <PromptProvider sessionId="ses_1">
          <Capture />
        </PromptProvider>
      </SDKProvider>
    </PlatformProvider>,
  );
  await waitFor(() => expect(prompt.ready).toBe(true));
}

beforeEach(() => {
  vi.clearAllMocks();
  const memory = new Map<string, string>();
  platform = {
    platform: "web",
    openLink: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    restart: () => Promise.resolve(),
    notify: () => Promise.resolve(),
    storage: () => createStorage(memory),
    readClipboardImage: () => Promise.resolve(null),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePromptAttachments", () => {
  test("adds an image attachment", async () => {
    await setup();

    const added = await attachments.addAttachment(png());

    expect(added).toBe(true);
    await waitFor(() => expect(images()).toHaveLength(1));
    expect(images()[0]).toMatchObject({
      type: "image",
      filename: "a.png",
      mime: "image/png",
      dataUrl: "data:image/png;base64,YWJj",
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("rejects unsupported files and warns", async () => {
    await setup();

    const added = await attachments.addAttachment(binary());

    expect(added).toBe(false);
    expect(images()).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith("Can't attach file", {
      description: "This file type isn't supported as an attachment.",
    });
  });

  test("warns when the file cannot be read", async () => {
    vi.stubGlobal("FileReader", BrokenFileReader);
    await setup();

    const added = await attachments.addAttachment(png());

    expect(added).toBe(false);
    expect(images()).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith("Can't attach file", {
      description: "The file couldn't be read.",
    });
  });

  test("warns only when no attachment could be added", async () => {
    await setup();

    const partial = await attachments.addAttachments([binary(), png()]);
    expect(partial).toBe(true);
    await waitFor(() => expect(images()).toHaveLength(1));
    expect(toast.error).not.toHaveBeenCalled();

    const none = await attachments.addAttachments([binary()]);
    expect(none).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  test("removes attachments by id and keeps text parts", async () => {
    await setup();
    prompt.set([{ type: "text", content: "hi", start: 0, end: 2 }]);
    await attachments.addAttachment(png());
    await attachments.addAttachment(png("b.png"));
    await waitFor(() => expect(images()).toHaveLength(2));

    const [first] = images();
    attachments.removeAttachment(first!.id);

    await waitFor(() => expect(images()).toHaveLength(1));
    expect(images()[0]).toMatchObject({ filename: "b.png" });
    expect(prompt.current.some((part) => part.type === "text")).toBe(true);
  });

  test("pastes clipboard files as attachments", async () => {
    await setup();
    const { event, preventDefault } = pasteEvent({
      items: [{ kind: "file", getAsFile: () => png() }],
    });

    await attachments.handlePaste(event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(images()).toHaveLength(1));
  });

  test("falls back to the native clipboard image when the browser paste is empty", async () => {
    platform.readClipboardImage = () => Promise.resolve(png("native.png"));
    await setup();
    const { event, preventDefault } = pasteEvent({
      items: [{ kind: "string", getAsFile: () => null }],
    });

    await attachments.handlePaste(event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(images()).toHaveLength(1));
    expect(images()[0]).toMatchObject({ filename: "native.png" });
  });

  test("leaves plain-text pastes to the editor", async () => {
    const readClipboardImage = vi.fn(() => Promise.resolve(null));
    platform.readClipboardImage = readClipboardImage;
    await setup();
    const { event, preventDefault } = pasteEvent({
      items: [{ kind: "string", getAsFile: () => null }],
      text: "hello",
    });

    await attachments.handlePaste(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(readClipboardImage).not.toHaveBeenCalled();
    expect(images()).toHaveLength(0);
  });
});
