import { de, enUS, es, fr } from "date-fns/locale";

import { getLocale } from "@/paraglide/runtime";

const dateFnsLocales = {
  "en-US": enUS,
  "de-DE": de,
  "fr-FR": fr,
  "es-419": es,
  "es-ES": es,
} as const;

export function getDateLocale() {
  return dateFnsLocales[getLocale()];
}
