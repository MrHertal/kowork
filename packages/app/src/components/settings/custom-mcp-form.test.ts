import { describe, expect, it } from "vitest";

import { buildResult, initialValues } from "./custom-mcp-form";

describe("buildResult", () => {
  it("emits the oauth object for remote configs with a client ID", () => {
    const result = buildResult({
      ...initialValues,
      type: "remote",
      name: "google-calendar",
      url: "https://calendarmcp.googleapis.com/mcp/v1",
      oauthClientId: "client-id",
      oauthClientSecret: "client-secret",
      oauthScope: "scope1 scope2",
    });
    expect(result.config).toEqual({
      type: "remote",
      url: "https://calendarmcp.googleapis.com/mcp/v1",
      enabled: true,
      oauth: {
        clientId: "client-id",
        clientSecret: "client-secret",
        scope: "scope1 scope2",
      },
    });
  });

  it("omits empty oauth fields", () => {
    const result = buildResult({
      ...initialValues,
      type: "remote",
      name: "my-connector",
      url: "https://mcp.example.com",
      oauthClientId: "client-id",
    });
    expect(result.config).toEqual({
      type: "remote",
      url: "https://mcp.example.com",
      enabled: true,
      oauth: { clientId: "client-id" },
    });
  });

  it("omits oauth entirely when the client ID is empty or whitespace", () => {
    for (const oauthClientId of ["", "   "]) {
      const result = buildResult({
        ...initialValues,
        type: "remote",
        name: "my-connector",
        url: "https://mcp.example.com",
        oauthClientId,
        oauthClientSecret: "client-secret",
        oauthScope: "scope1",
      });
      expect(result.config).toEqual({
        type: "remote",
        url: "https://mcp.example.com",
        enabled: true,
      });
      expect(result.config).not.toHaveProperty("oauth");
    }
  });

  it("never emits oauth for local configs", () => {
    const result = buildResult({
      ...initialValues,
      type: "local",
      name: "my-connector",
      command: "npx server",
      oauthClientId: "client-id",
      oauthClientSecret: "client-secret",
      oauthScope: "scope1",
    });
    expect(result.config).toEqual({
      type: "local",
      command: ["npx", "server"],
      enabled: true,
    });
    expect(result.config).not.toHaveProperty("oauth");
  });
});
