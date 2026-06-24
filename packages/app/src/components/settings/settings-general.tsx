import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const localeLabel: Record<(typeof locales)[number], () => string> = {
  en: m.locale_en,
  de: m.locale_de,
  fr: m.locale_fr,
};

export function SettingsGeneral() {
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
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locales.map((locale) => (
                <SelectItem key={locale} value={locale}>
                  {localeLabel[locale]()}
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
      </SettingsSection>
    </div>
  );
}
