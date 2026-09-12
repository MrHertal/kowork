// @opencode-ref: opencode/packages/app/e2e/utils/mock-server.ts
import type { Page, Route } from "@playwright/test";

import { installSseTransport } from "./sse-transport";

export const sessionID = "ses_browser_smoke";
export const createdSessionID = "ses_browser_created";
export const directory = "/tmp/kowork-browser-smoke";
export const providerID = "mock-provider";
export const modelID = "mock-small-model";

export type PromptRequest = {
  agent?: string;
  messageID?: string;
  model?: { providerID: string; modelID: string };
  parts?: Array<{ type: string; text?: string }>;
};

type SessionCreateRequest = {
  metadata?: Record<string, unknown>;
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
  sessionID: string;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
};

type PendingSessionCreate = {
  body: SessionCreateRequest;
  accept: () => Promise<void>;
};

type MockOpenCodeOptions = {
  deferSessionStatus?: boolean;
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

const createdSession = {
  ...session,
  id: createdSessionID,
  slug: "browser-created",
  title: "New task",
  metadata: { "kowork.directoryMode": "default" },
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
  let resolveSessionCreate:
    | ((sessionCreate: PendingSessionCreate) => void)
    | undefined;
  const sessionCreate = new Promise<PendingSessionCreate>((resolve) => {
    resolveSessionCreate = resolve;
  });
  let sessionCreated = false;
  let resolveAbort: (() => void) | undefined;
  const abort = new Promise<void>((resolve) => {
    resolveAbort = resolve;
  });
  let deferSessionStatus = options.deferSessionStatus ?? false;
  let resolveSessionStatus: ((status: PendingSessionStatus) => void) | undefined;
  const sessionStatus = new Promise<PendingSessionStatus>((resolve) => {
    resolveSessionStatus = resolve;
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

    if (request.method() === "POST" && path === "/session") {
      const body = request.postDataJSON() as SessionCreateRequest;
      resolveSessionCreate?.({
        body,
        async accept() {
          sessionCreated = true;
          await sendJson(route, createdSession);
        },
      });
      return;
    }

    const promptMatch = path.match(/^\/session\/([^/]+)\/prompt_async$/);
    if (
      request.method() === "POST" &&
      promptMatch &&
      [sessionID, createdSessionID].includes(promptMatch[1] ?? "")
    ) {
      const body = request.postDataJSON() as PromptRequest;
      resolvePrompt?.({
        body,
        sessionID: promptMatch[1]!,
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
    const sessions = sessionCreated ? [createdSession, session] : [session];
    if (path === "/experimental/session") return sendJson(route, sessions);
    if (path === "/session") return sendJson(route, sessions);
    if (path === `/session/${sessionID}`) return sendJson(route, session);
    if (sessionCreated && path === `/session/${createdSessionID}`) {
      return sendJson(route, createdSession);
    }
    if (
      path === `/session/${sessionID}/message` ||
      (sessionCreated && path === `/session/${createdSessionID}/message`)
    ) {
      return sendJson(route, []);
    }
    if (/^\/session\/[^/]+\/(children|diff|todo)$/.test(path)) {
      return sendJson(route, []);
    }
    if (path === "/session/status") {
      if (deferSessionStatus) {
        deferSessionStatus = false;
        resolveSessionStatus?.({
          respond(status = options.sessionStatus ?? {}) {
            return sendJson(route, status);
          },
        });
        return;
      }
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
    waitForSessionCreate: () => sessionCreate,
    waitForSessionStatus: () => sessionStatus,
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

type PendingSessionStatus = {
  respond: (status?: Record<string, unknown>) => Promise<void>;
};
