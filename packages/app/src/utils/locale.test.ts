import { de, enUS, es, fr, hi, ptBR, zhCN } from "date-fns/locale";
import { afterEach, describe, expect, it } from "vitest";
import { getLocale, locales, overwriteGetLocale } from "@/paraglide/runtime";
import { getDateLocale } from "./locale";

const original = getLocale;

afterEach(() => {
  overwriteGetLocale(original);
});

describe("getDateLocale", () => {
  it("returns the english locale by default", () => {
    expect(getDateLocale()).toBe(enUS);
  });

  it("maps every app locale to a date-fns locale", () => {
    const expected = {
      "en-US": enUS,
      "de-DE": de,
      "fr-FR": fr,
      "es-419": es,
      "es-ES": es,
      "zh-CN": zhCN,
      "hi-IN": hi,
      "pt-BR": ptBR,
    } as const;

    for (const locale of locales) {
      overwriteGetLocale(() => locale);
      expect(getDateLocale()).toBe(expected[locale]);
    }
  });
});
