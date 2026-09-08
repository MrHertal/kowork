import { describe, expect, it } from "vitest";

import { buildKoworkConfiguration } from "./kowork-configuration";

const settings = {
  language: "fr-FR",
  theme: "dark" as const,
  fontSize: 16,
  notifications: { agent: true, permissions: false, errors: false },
  sounds: {
    agentEnabled: true,
    agent: "staplebops-01",
    permissionsEnabled: false,
    permissions: "staplebops-02",
    errorsEnabled: true,
    errors: "nope-03",
  },
  updates: { startup: true },
};

describe("buildKoworkConfiguration", () => {
  it("returns an empty string when nothing is loaded", () => {
    expect(buildKoworkConfiguration({})).toBe("");
  });

  it("renders all subsections", () => {
    const result = buildKoworkConfiguration({
      settings,
      webSearch: false,
      connectors: {
        notion: { status: "connected" },
        linear: { status: "needs_auth" },
        slack: { status: "disabled" },
      },
      skills: [{ name: "skill-creator" }],
    });
    expect(result).toContain("### Settings");
    expect(result).toContain("### Connectors");
    expect(result).toContain("### Skills");
  });

  describe("settings", () => {
    it("maps values to user-facing labels", () => {
      const result = buildKoworkConfiguration({ settings, webSearch: false });
      expect(result).toContain("- Language: Français (France)");
      expect(result).toContain("- Color scheme: Dark");
      expect(result).toContain("- Display size: Normal");
      expect(result).toContain("- Web search: Off");
      expect(result).toContain("- Check for updates: On");
      expect(result).toContain("- Notifications:");
      expect(result).toContain("  - Responses: On");
      expect(result).toContain("  - Permissions: Off");
      expect(result).toContain("  - Errors: Off");
      expect(result).toContain("- Sounds:");
      expect(result).toContain("  - Responses: Staplebops 1");
      expect(result).toContain("  - Errors: Nope 1");
    });

    it("falls back to raw values for unknown language, theme size, and sound", () => {
      const result = buildKoworkConfiguration({
        settings: {
          ...settings,
          language: "xx-XX",
          fontSize: 20,
          sounds: { ...settings.sounds, agent: "custom-99" },
        },
      });
      expect(result).toContain("- Language: xx-XX");
      expect(result).toContain("- Display size: Normal");
      expect(result).toContain("Responses: custom-99");
    });

    it("omits the web search line when permission is not loaded", () => {
      const result = buildKoworkConfiguration({ settings });
      expect(result).not.toContain("Web search");
    });

    it("omits the settings section when not ready", () => {
      const result = buildKoworkConfiguration({ connectors: {} });
      expect(result).not.toContain("### Settings");
    });
  });

  describe("connectors", () => {
    it("maps every status to the documentation term", () => {
      const result = buildKoworkConfiguration({
        connectors: {
          a: { status: "connected" },
          b: { status: "disabled" },
          c: { status: "failed", error: "boom" },
          d: { status: "needs_auth" },
          e: { status: "needs_client_registration", error: "boom" },
        },
      });
      expect(result).toContain("- A: Connected");
      expect(result).toContain("- B: Off");
      expect(result).toContain("- C: Failed");
      expect(result).toContain("- D: Sign-in required");
      expect(result).toContain("- E: Client registration required");
    });

    it("sorts connectors by name and uses the humanized title", () => {
      const result = buildKoworkConfiguration({
        connectors: {
          zebra: { status: "connected" },
          alpha: { status: "connected" },
          linear: { status: "connected" },
          "my-service_name": { status: "connected" },
        },
      });
      expect(result.indexOf("- Alpha")).toBeLessThan(
        result.indexOf("- Linear"),
      );
      expect(result).toContain("- Linear: Connected");
      expect(result).toContain("- My service name: Connected");
    });

    it("says none are set up when empty", () => {
      expect(buildKoworkConfiguration({ connectors: {} })).toContain(
        "No connectors are set up.",
      );
    });

    it("omits the section while loading", () => {
      expect(buildKoworkConfiguration({})).not.toContain("### Connectors");
    });
  });

  describe("skills", () => {
    it("lists skills sorted by name", () => {
      const result = buildKoworkConfiguration({
        skills: [{ name: "beta" }, { name: "alpha" }],
      });
      const alpha = result.indexOf("- alpha");
      const beta = result.indexOf("- beta");
      expect(alpha).toBeGreaterThan(-1);
      expect(beta).toBeGreaterThan(alpha);
    });

    it("says none are added when empty", () => {
      expect(buildKoworkConfiguration({ skills: [] })).toContain(
        "No skills added.",
      );
    });

    it("omits the section while loading", () => {
      expect(buildKoworkConfiguration({})).not.toContain("### Skills");
    });
  });

  it("never exposes file system paths, commands, or secret fields", () => {
    const result = buildKoworkConfiguration({
      settings,
      connectors: { notion: { status: "connected" } },
      skills: [{ name: "skill-creator" }],
    });
    expect(result).not.toMatch(/\/|\bcommand\b|clientSecret|header/i);
  });
});
