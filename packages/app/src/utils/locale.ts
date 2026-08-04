import { de, enUS, es, fr } from "date-fns/locale";

import { getLocale } from "@/paraglide/runtime";

const dateFnsLocales = {
  en: enUS,
  de,
  fr,
  "es-419": es,
  "es-ES": es,
} as const;

export function getDateLocale() {
  return dateFnsLocales[getLocale()];
}
