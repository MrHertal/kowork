import type { McpStatus } from "@opencode-ai/sdk/v2/client";

import { localeLabel } from "@/utils/locale";
import { mcpServerTitle } from "@/utils/mcp";
import { SOUND_LABEL, type SoundID } from "@/utils/sound";

export interface KoworkConfigurationSettings {
  language: string;
  theme: "light" | "dark" | "system";
  fontSize: number;
  notifications: { agent: boolean; permissions: boolean; errors: boolean };
  sounds: {
    agentEnabled: boolean;
    agent: string;
    permissionsEnabled: boolean;
    permissions: string;
    errorsEnabled: boolean;
    errors: string;
  };
  updates: { startup: boolean };
}

export interface KoworkConfigurationInput {
  settings?: KoworkConfigurationSettings;
  webSearch?: boolean;
  connectors?: Record<string, McpStatus>;
  skills?: { name: string }[];
}

const CONNECTOR_STATUS_LABEL: Record<McpStatus["status"], string> = {
  connected: "Connected",
  disabled: "Off",
  failed: "Failed",
  needs_auth: "Sign-in required",
  needs_client_registration: "Client registration required",
};

const THEME_LABEL: Record<KoworkConfigurationSettings["theme"], string> = {
  system: "Follow system",
  light: "Light",
  dark: "Dark",
};

const FONT_SIZE_LABEL: Record<number, string> = {
  14: "Small",
  16: "Normal",
  18: "Large",
};

function languageLabel(language: string) {
  return language in localeLabel
    ? localeLabel[language as keyof typeof localeLabel]
    : language;
}

function soundLabel(enabled: boolean, id: string) {
  if (!enabled) return "Off";
  return id in SOUND_LABEL ? SOUND_LABEL[id as SoundID] : id;
}

function onOff(value: boolean) {
  return value ? "On" : "Off";
}

function buildSettings(input: KoworkConfigurationInput): string[] {
  if (!input.settings) return [];
  const { settings, webSearch } = input;
  const lines = [
    "### Settings",
    "",
    `- Language: ${languageLabel(settings.language)}`,
    `- Color scheme: ${THEME_LABEL[settings.theme]}`,
    `- Display size: ${FONT_SIZE_LABEL[settings.fontSize] ?? "Normal"}`,
  ];
  if (webSearch !== undefined) {
    lines.push(`- Web search: ${onOff(webSearch)}`);
  }
  lines.push(
    `- Check for updates: ${onOff(settings.updates.startup)}`,
    "- Notifications:",
    `  - Responses: ${onOff(settings.notifications.agent)}`,
    `  - Permissions: ${onOff(settings.notifications.permissions)}`,
    `  - Errors: ${onOff(settings.notifications.errors)}`,
    "- Sounds:",
    `  - Responses: ${soundLabel(settings.sounds.agentEnabled, settings.sounds.agent)}`,
    `  - Permissions: ${soundLabel(settings.sounds.permissionsEnabled, settings.sounds.permissions)}`,
    `  - Errors: ${soundLabel(settings.sounds.errorsEnabled, settings.sounds.errors)}`,
  );
  return lines;
}

function buildConnectors(input: KoworkConfigurationInput): string[] {
  if (!input.connectors) return [];
  const entries = Object.entries(input.connectors).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (entries.length === 0) {
    return ["### Connectors", "", "No connectors are set up."];
  }
  return [
    "### Connectors",
    "",
    ...entries.map(
      ([name, status]) =>
        `- ${mcpServerTitle(name)}: ${CONNECTOR_STATUS_LABEL[status.status]}`,
    ),
  ];
}

function buildSkills(input: KoworkConfigurationInput): string[] {
  if (!input.skills) return [];
  if (input.skills.length === 0) {
    return ["### Skills", "", "No skills added."];
  }
  return [
    "### Skills",
    "",
    ...input.skills
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((skill) => `- ${skill.name}`),
  ];
}

export function buildKoworkConfiguration(
  input: KoworkConfigurationInput,
): string {
  return [buildSettings(input), buildConnectors(input), buildSkills(input)]
    .filter((section) => section.length > 0)
    .map((section) => section.join("\n"))
    .join("\n\n");
}
