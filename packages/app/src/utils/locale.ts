import { de, enUS, fr } from "date-fns/locale";

import { getLocale } from "@/paraglide/runtime";

const dateFnsLocales = { en: enUS, de, fr } as const;

export function getDateLocale() {
  return dateFnsLocales[getLocale()];
}
