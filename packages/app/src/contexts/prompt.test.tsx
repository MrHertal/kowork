// @vitest-environment jsdom
import type { Event, OpencodeClient } from "@opencode-ai/sdk/v2/client";
import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  PlatformProvider,
  type AsyncStorage,
  type Platform,
} from "@/contexts/platform";
import { type Prompt, PromptProvider, usePrompt } from "@/contexts/prompt";
import { SDKProvider } from "@/contexts/sdk";
import { createBlobReference } from "@/utils/blob";
import { createEmitter } from "@/utils/emitter";

const directory = "/tmp/project";

const client = {} as unknown as OpencodeClient;
const emitter = createEmitter<{ [key: string]: Event }>();

vi.mock("@/contexts/global-sdk", () => ({
  useGlobalSDK: () => ({
    url: "http://localhost:4096",
    client,
    event: emitter,
    createClient: () => client,
  }),
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

const textPart = {
  type: "text",
  content: "hi",
  start: 0,
  end: 2,
} as const;

let prompt: ReturnType<typeof usePrompt>;
let memory: Map<string, string>;
let platform: Platform;

function Capture() {
  const ctx = usePrompt();
  useEffect(() => {
    prompt = ctx;
  });
  return null;
}

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

function seed(parts: unknown[]) {
  memory.set(
    "session:ses_1:prompt",
    JSON.stringify({ prompt: parts, cursor: 2 }),
  );
}

beforeEach(() => {
  memory = new Map<string, string>();
  platform = {
    platform: "web",
    openLink: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    restart: () => Promise.resolve(),
    notify: () => Promise.resolve(),
    storage: () => createStorage(memory),
  };
});

describe("PromptProvider persistence", () => {
  test("keeps text parts and drops image attachments with dead blobs", async () => {
    seed([
      textPart,
      {
        type: "image",
        id: "img_dead",
        filename: "a.png",
        mime: "image/png",
        blob: { id: "dead", url: "blob:dead" },
      },
    ]);
    await setup();

    expect(prompt.current).toEqual([textPart]);
  });

  test("drops legacy image attachments that predate blob references", async () => {
    seed([
      textPart,
      {
        type: "image",
        id: "img_legacy",
        filename: "a.png",
        mime: "image/png",
        dataUrl: "data:image/png;base64,AAA",
      },
    ]);
    await setup();

    expect(prompt.current).toEqual([textPart]);
  });

  test("keeps image attachments whose blob is still live", async () => {
    const blob = await createBlobReference(
      new File(["abc"], "a.png", { type: "image/png" }),
    );
    const imagePart = {
      type: "image",
      id: "img_live",
      filename: "a.png",
      mime: "image/png",
      blob,
    };
    seed([textPart, imagePart]);
    await setup();

    const current: Prompt = prompt.current;
    expect(current).toHaveLength(2);
    expect(current[1]).toMatchObject({ type: "image", id: "img_live", blob });
  });

  test("starts empty when nothing is persisted", async () => {
    await setup();

    expect(prompt.current).toEqual([
      { type: "text", content: "", start: 0, end: 0 },
    ]);
  });
});
