// @opencode-ref: opencode/packages/app/e2e/utils/mock-server.ts
import { once } from "node:events";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

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

type PendingPrompt = {
  body: PromptRequest;
  accept: () => void;
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

function sendJson(response: ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "x-next-cursor",
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage) {
  const chunks: string[] = [];
  for await (const chunk of request as AsyncIterable<unknown>) {
    if (typeof chunk === "string") chunks.push(chunk);
    else if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk).toString("utf8"));
    } else {
      throw new Error("Unexpected request body chunk");
    }
  }
  return JSON.parse(chunks.join("")) as PromptRequest;
}

export async function mockOpenCode() {
  let resolvePrompt: ((prompt: PendingPrompt) => void) | undefined;
  const prompt = new Promise<PendingPrompt>((resolve) => {
    resolvePrompt = resolve;
  });

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1:4096");
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-headers": "content-type,x-opencode-directory",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-origin": "*",
      });
      response.end();
      return;
    }

    if (path === "/global/event") {
      response.writeHead(200, {
        "access-control-allow-origin": "*",
        "cache-control": "no-cache",
        "content-type": "text/event-stream",
      });
      response.end(": connected\n\n");
      return;
    }

    if (
      request.method === "POST" &&
      path === `/session/${sessionID}/prompt_async`
    ) {
      const body = await readJson(request);
      resolvePrompt?.({
        body,
        accept() {
          response.writeHead(204, { "access-control-allow-origin": "*" });
          response.end();
        },
      });
      return;
    }

    if (path === "/global/health") return sendJson(response, { healthy: true });
    if (path === "/provider") return sendJson(response, provider);
    if (path === "/path") {
      return sendJson(response, {
        state: directory,
        config: directory,
        worktree: directory,
        directory,
        home: "/tmp",
      });
    }
    if (path === "/project") return sendJson(response, [project]);
    if (path === "/project/current") return sendJson(response, project);
    if (path === "/experimental/session") return sendJson(response, [session]);
    if (path === "/session") return sendJson(response, [session]);
    if (path === `/session/${sessionID}`) return sendJson(response, session);
    if (path === `/session/${sessionID}/message`) {
      return sendJson(response, []);
    }
    if (/^\/session\/[^/]+\/(children|diff|todo)$/.test(path)) {
      return sendJson(response, []);
    }
    if (path === "/session/status") return sendJson(response, {});
    if (path === "/agent") {
      return sendJson(response, [{ name: "build", mode: "primary" }]);
    }
    if (path === "/vcs") {
      return sendJson(response, {
        branch: "browser-e2e-smoke",
        default_branch: "main",
      });
    }
    if (emptyLists.has(path)) return sendJson(response, []);
    if (emptyObjects.has(path)) return sendJson(response, {});

    return sendJson(
      response,
      { error: `Unhandled mock endpoint: ${path}` },
      404,
    );
  };

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      sendJson(
        response,
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    });
  });
  server.listen(4096, "127.0.0.1");
  await once(server, "listening");

  return {
    waitForPrompt: () => prompt,
    async close() {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}
