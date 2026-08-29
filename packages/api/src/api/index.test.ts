import { describe, expect, it } from "vitest";

import worker from "./index";

describe("api worker", () => {
  it("responds 200 on /health", async () => {
    const response = await worker.fetch(
      new Request("https://kowork-api.workers.dev/health"),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("responds 404 on unknown paths", async () => {
    const response = await worker.fetch(
      new Request("https://kowork-api.workers.dev/"),
    );
    expect(response.status).toBe(404);
  });
});

describe("oauth callback relay", () => {
  it("redirects to the local callback with the query string preserved", async () => {
    const response = await worker.fetch(
      new Request(
        "https://api.kowork.dev/mcp/oauth/callback?code=abc123&state=xyz",
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:19876/mcp/oauth/callback?code=abc123&state=xyz",
    );
  });

  it("preserves encoded characters verbatim", async () => {
    const response = await worker.fetch(
      new Request(
        "https://api.kowork.dev/mcp/oauth/callback?code=a%2Bb%2Fc&state=x%3Dy",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:19876/mcp/oauth/callback?code=a%2Bb%2Fc&state=x%3Dy",
    );
  });

  it("passes through OAuth errors", async () => {
    const response = await worker.fetch(
      new Request(
        "https://api.kowork.dev/mcp/oauth/callback?error=access_denied&state=xyz",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:19876/mcp/oauth/callback?error=access_denied&state=xyz",
    );
  });

  it("omits the query string when absent", async () => {
    const response = await worker.fetch(
      new Request("https://api.kowork.dev/mcp/oauth/callback"),
    );
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:19876/mcp/oauth/callback",
    );
  });

  it("sets a no-store cache policy", async () => {
    const response = await worker.fetch(
      new Request("https://api.kowork.dev/mcp/oauth/callback?code=abc123"),
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
