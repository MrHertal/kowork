import { useSyncExternalStore } from "react";

import type { AsyncStorage } from "@/contexts/platform";
import {
  baseLocale,
  defineCustomClientStrategy,
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
    applyLocale(getLocale() as Locale);
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
