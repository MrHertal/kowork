import { de, enUS, es, fr, hi, ptBR, zhCN } from "date-fns/locale";

import { getLocale, locales } from "@/paraglide/runtime";

const dateFnsLocales = {
  "en-US": enUS,
  "de-DE": de,
  "fr-FR": fr,
  "es-419": es,
  "es-ES": es,
  "zh-CN": zhCN,
  "hi-IN": hi,
  "pt-BR": ptBR,
} as const;

export function getDateLocale() {
  return dateFnsLocales[getLocale()];
}

export const localeLabel: Record<(typeof locales)[number], string> = {
  "en-US": "English (United States)",
  "de-DE": "Deutsch (Deutschland)",
  "fr-FR": "Français (France)",
  "es-419": "Español (Latinoamérica)",
  "es-ES": "Español (España)",
  "zh-CN": "简体中文（中国大陆）",
  "hi-IN": "हिन्दी (भारत)",
  "pt-BR": "Português (Brasil)",
};
