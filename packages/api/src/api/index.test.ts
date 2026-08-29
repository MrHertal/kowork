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
