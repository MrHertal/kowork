import { useSyncExternalStore } from "react";

import type { AsyncStorage } from "@/contexts/platform";
import {
  baseLocale,
  defineCustomClientStrategy,
  extractLocaleFromCookie,
  getLocale,
  locales,
  setLocale,
} from "@/paraglide/runtime";

type Locale = (typeof locales)[number];

let cachedLocale: Locale | undefined;

const listeners = new Set<() => void>();

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

function getPreferredLocale(): Locale | undefined {
  if (typeof navigator === "undefined") return;

  const languages = navigator.languages.length
    ? navigator.languages
    : [navigator.language];

  for (const language of languages) {
    try {
      const preferred = new Intl.Locale(language);
      if (preferred.language === "es")
        return preferred.region === "ES" ? "es-ES" : "es-419";
      if (preferred.language === "de") return "de-DE";
      if (preferred.language === "fr") return "fr-FR";

      const supported = locales.some((locale) => {
        const candidate = new Intl.Locale(locale);
        return (
          candidate.baseName === preferred.baseName ||
          candidate.language === preferred.language
        );
      });
      if (supported) return;
    } catch {
      continue;
    }
  }
}

function applyLocale(locale: Locale) {
  cachedLocale = locale;
  document.documentElement.lang = locale;
}

export async function setupI18n(storage?: AsyncStorage): Promise<void> {
  if (!storage) {
    applyLocale(getLocale() as Locale);
    return;
  }

  const saved = await storage.getItem("locale");
  if (saved && isLocale(saved)) {
    cachedLocale = saved;
    setLocale(saved, { reload: false });
    applyLocale(saved);
  } else {
    const cookieLocale = extractLocaleFromCookie();
    if (cookieLocale) {
      applyLocale(cookieLocale);
    } else {
      const preferred = getPreferredLocale();
      if (preferred) setLocale(preferred, { reload: false });
      applyLocale(preferred ?? (getLocale() as Locale));
    }
  }
}

export function initI18nStrategy(storage?: AsyncStorage): void {
  defineCustomClientStrategy("custom-platform-storage", {
    getLocale: () => cachedLocale,
    setLocale: (newLocale: string) => {
      if (!isLocale(newLocale)) return;
      applyLocale(newLocale);
      listeners.forEach((fn) => fn());
      storage?.setItem("locale", newLocale);
    },
  });
}

export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => baseLocale);
}
