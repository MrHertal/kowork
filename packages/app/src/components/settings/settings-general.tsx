// @opencode-ref: opencode/packages/app/src/components/settings-general.tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePlatform } from "@/contexts/platform";
import { useSettings } from "@/contexts/settings";
import { m } from "@/paraglide/messages";
import { locales } from "@/paraglide/runtime";

import { SettingsRow, SettingsSection } from "./settings-row";

const DISPLAY_SIZES = [
  { value: 14, label: () => m.settings_appearance_displaySize_small() },
  { value: 16, label: () => m.settings_appearance_displaySize_normal() },
  { value: 18, label: () => m.settings_appearance_displaySize_large() },
] as const;

const DEFAULT_DISPLAY_SIZE = 16;

const localeLabel: Record<(typeof locales)[number], string> = {
  "en-US": "English (United States)",
  "de-DE": "Deutsch (Deutschland)",
  "fr-FR": "Français (France)",
  "es-419": "Español (Latinoamérica)",
  "es-ES": "Español (España)",
  "zh-CN": "简体中文（中国大陆）",
  "hi-IN": "हिन्दी (भारत)",
  "pt-BR": "Português (Brasil)",
};

const localeCollator = new Intl.Collator("en");
const sortedLocales = [...locales].sort((a, b) => {
  if (a === "en-US") return -1;
  if (b === "en-US") return 1;
  return localeCollator.compare(localeLabel[a], localeLabel[b]);
});

export function SettingsGeneral() {
  const platform = usePlatform();
  const settings = useSettings();

  const currentSize = DISPLAY_SIZES.find(
    (s) => s.value === settings.appearance.fontSize,
  )
    ? settings.appearance.fontSize
    : DEFAULT_DISPLAY_SIZE;

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection>
        <SettingsRow
          title={m.settings_general_language_title()}
          description={m.settings_general_language_description()}
        >
          <Select
            value={settings.general.language}
            onValueChange={settings.general.setLanguage}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortedLocales.map((locale) => (
                <SelectItem key={locale} value={locale}>
                  {localeLabel[locale]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          title={m.settings_general_theme_title()}
          description={m.settings_general_theme_description()}
        >
          <Select
            value={settings.general.theme}
            onValueChange={(value) =>
              settings.general.setTheme(value as "light" | "dark" | "system")
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">
                {m.settings_general_theme_system()}
              </SelectItem>
              <SelectItem value="light">
                {m.settings_general_theme_light()}
              </SelectItem>
              <SelectItem value="dark">
                {m.settings_general_theme_dark()}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          title={m.settings_appearance_displaySize_title()}
          description={m.settings_appearance_displaySize_description()}
        >
          <Select
            value={String(currentSize)}
            onValueChange={(value) =>
              settings.appearance.setFontSize(Number(value))
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISPLAY_SIZES.map((size) => (
                <SelectItem key={size.value} value={String(size.value)}>
                  {size.label()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          title={m.settings_updates_startup_title()}
          description={m.settings_updates_startup_description()}
        >
          <Switch
            checked={settings.updates.startup}
            disabled={!platform.checkUpdate}
            onCheckedChange={settings.updates.setStartup}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
