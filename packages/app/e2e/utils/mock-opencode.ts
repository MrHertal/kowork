// @opencode-ref: opencode/packages/app/e2e/utils/mock-server.ts
import type { Page, Route } from "@playwright/test";

import { installSseTransport } from "./sse-transport";

export const sessionID = "ses_browser_smoke";
export const directory = "/tmp/kowork-browser-smoke";
export const providerID = "mock-provider";
export const modelID = "mock-small-model";

export type PromptRequest = {
  agent?: string;
  messageID?: string;
  model?: { providerID: string; modelID: string };
  parts?: Array<{ type: string; text?: string }>;
};

export type OpenCodeEvent = {
  directory: string;
  payload: {
    type: string;
    properties: Record<string, unknown>;
  };
};

type PendingPrompt = {
  body: PromptRequest;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
};

type MockOpenCodeOptions = {
  sessionStatus?: Record<string, unknown>;
};

const session = {
  id: sessionID,
  slug: "browser-smoke",
  projectID: "project_browser_smoke",
  directory,
  title: "Browser smoke test",
  version: "1.0.0",
  agent: "build",
  model: { providerID, id: modelID },
  time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
};

const project = {
  id: "project_browser_smoke",
  worktree: directory,
  vcs: "git",
  name: "kowork-browser-smoke",
  time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
  sandboxes: [],
};

const provider = {
  all: [
    {
      id: providerID,
      name: "Mock provider",
      models: {
        [modelID]: {
          id: modelID,
          providerID,
          name: "Mock small model",
          api: { id: modelID, url: "", npm: "@ai-sdk/openai-compatible" },
          capabilities: {
            temperature: true,
            reasoning: false,
            attachment: false,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            interleaved: false,
          },
          cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
          limit: { context: 32_000, output: 4_096 },
          status: "active",
          options: {},
          headers: {},
          release_date: "2026-01-01",
        },
      },
    },
  ],
  connected: [providerID],
  default: { providerID, modelID },
};

const emptyLists = new Set([
  "/skill",
  "/command",
  "/permission",
  "/question",
  "/lsp",
]);

const emptyObjects = new Set(["/global/config", "/config", "/mcp"]);

function sendJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-next-cursor",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function mockOpenCode(
  page: Page,
  options: MockOpenCodeOptions = {},
) {
  const serverHost = process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1";
  const serverPort = process.env.PLAYWRIGHT_SERVER_PORT ?? "4096";
  const events = await installSseTransport<OpenCodeEvent>(
    page,
    `http://${serverHost}:${serverPort}`,
  );
  let resolvePrompt: ((prompt: PendingPrompt) => void) | undefined;
  const prompt = new Promise<PendingPrompt>((resolve) => {
    resolvePrompt = resolve;
  });
  let resolveAbort: (() => void) | undefined;
  const abort = new Promise<void>((resolve) => {
    resolveAbort = resolve;
  });
  const unhandledRequests: string[] = [];

  const handle = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-headers": "content-type,x-opencode-directory",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-origin": "*",
        },
      });
    }

    if (
      request.method() === "POST" &&
      path === `/session/${sessionID}/prompt_async`
    ) {
      const body = request.postDataJSON() as PromptRequest;
      resolvePrompt?.({
        body,
        accept() {
          return route.fulfill({
            status: 204,
            headers: { "access-control-allow-origin": "*" },
          });
        },
        reject() {
          return sendJson(
            route,
            { error: { message: "Mock prompt failure" } },
            500,
          );
        },
      });
      return;
    }

    if (
      request.method() === "POST" &&
      path === `/session/${sessionID}/abort`
    ) {
      await sendJson(route, true);
      resolveAbort?.();
      return;
    }

    if (path === "/global/health") return sendJson(route, { healthy: true });
    if (path === "/provider") return sendJson(route, provider);
    if (path === "/path") {
      return sendJson(route, {
        state: directory,
        config: directory,
        worktree: directory,
        directory,
        home: "/tmp",
      });
    }
    if (path === "/project") return sendJson(route, [project]);
    if (path === "/project/current") return sendJson(route, project);
    if (path === "/experimental/session") return sendJson(route, [session]);
    if (path === "/session") return sendJson(route, [session]);
    if (path === `/session/${sessionID}`) return sendJson(route, session);
    if (path === `/session/${sessionID}/message`) {
      return sendJson(route, []);
    }
    if (/^\/session\/[^/]+\/(children|diff|todo)$/.test(path)) {
      return sendJson(route, []);
    }
    if (path === "/session/status") {
      return sendJson(route, options.sessionStatus ?? {});
    }
    if (path === "/agent") {
      return sendJson(route, [{ name: "build", mode: "primary" }]);
    }
    if (path === "/vcs") {
      return sendJson(route, {
        branch: "browser-e2e-smoke",
        default_branch: "main",
      });
    }
    if (emptyLists.has(path)) return sendJson(route, []);
    if (emptyObjects.has(path)) return sendJson(route, {});

    unhandledRequests.push(`${request.method()} ${path}`);
    return sendJson(route, { error: `Unhandled mock endpoint: ${path}` }, 404);
  };

  await page.route(`http://${serverHost}:${serverPort}/**`, handle);

  return {
    events,
    waitForAbort: () => abort,
    waitForPrompt: () => prompt,
    close() {
      if (unhandledRequests.length > 0) {
        return Promise.reject(
          new Error(
            `Unhandled OpenCode mock requests:\n${unhandledRequests.join("\n")}`,
          ),
        );
      }
      return Promise.resolve();
    },
  };
}
