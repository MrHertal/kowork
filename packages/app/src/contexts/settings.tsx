// @opencode-ref: opencode/packages/app/src/context/settings.tsx
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useTheme } from "next-themes";

import { getLocale, locales, setLocale } from "@/paraglide/runtime";
import { Persist } from "@/utils/persist";
import { usePersistedState } from "@/hooks/use-persisted-state";

export interface NotificationSettings {
  agent: boolean;
  permissions: boolean;
  errors: boolean;
}

export interface SoundSettings {
  agentEnabled: boolean;
  agent: string;
  permissionsEnabled: boolean;
  permissions: string;
  errorsEnabled: boolean;
  errors: string;
}

export interface Settings {
  appearance: {
    fontSize: number;
  };
  general: {
    theme: "light" | "dark" | "system";
    language: string;
  };
  notifications: NotificationSettings;
  sounds: SoundSettings;
}

const PERSIST_TARGET = Persist.global("settings.v3");

const createDefaultSettings = (): Settings => ({
  appearance: {
    fontSize: 16,
  },
  general: {
    theme: "system",
    language: "en",
  },
  notifications: {
    agent: true,
    permissions: true,
    errors: false,
  },
  sounds: {
    agentEnabled: true,
    agent: "staplebops-01",
    permissionsEnabled: true,
    permissions: "staplebops-02",
    errorsEnabled: true,
    errors: "nope-03",
  },
});

type Locale = (typeof locales)[number];

function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export interface SettingsContextValue {
  ready: boolean;
  appearance: {
    fontSize: number;
    setFontSize: (value: number) => void;
  };
  general: {
    theme: "light" | "dark" | "system";
    setTheme: (value: "light" | "dark" | "system") => void;
    language: string;
    setLanguage: (value: string) => void;
  };
  notifications: {
    agent: boolean;
    setAgent: (value: boolean) => void;
    permissions: boolean;
    setPermissions: (value: boolean) => void;
    errors: boolean;
    setErrors: (value: boolean) => void;
  };
  sounds: {
    agentEnabled: boolean;
    setAgentEnabled: (value: boolean) => void;
    agent: string;
    setAgent: (value: string) => void;
    permissionsEnabled: boolean;
    setPermissionsEnabled: (value: boolean) => void;
    permissions: string;
    setPermissions: (value: string) => void;
    errorsEnabled: boolean;
    setErrorsEnabled: (value: boolean) => void;
    errors: string;
    setErrors: (value: string) => void;
  };
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const { setTheme: setNextTheme } = useTheme();
  const setNextThemeRef = useRef(setNextTheme);
  useEffect(() => {
    setNextThemeRef.current = setNextTheme;
  });
  const {
    state: settings,
    setState: setSettings,
    ready,
  } = usePersistedState<Settings>({
    target: PERSIST_TARGET,
    createDefault: createDefaultSettings,
    loadDefault: () => ({
      ...createDefaultSettings(),
      general: { ...createDefaultSettings().general, language: getLocale() },
    }),
    logName: "settings",
  });

  const update = useCallback(
    <K extends keyof Settings>(category: K, patch: Partial<Settings[K]>) => {
      setSettings(
        (prev) =>
          ({
            ...prev,
            [category]: { ...prev[category], ...patch },
          }) as Settings,
      );
    },
    [setSettings],
  );

  const setFontSize = useCallback(
    (value: number) => update("appearance", { fontSize: value }),
    [update],
  );
  const setTheme = useCallback(
    (value: "light" | "dark" | "system") => update("general", { theme: value }),
    [update],
  );
  const setLanguage = useCallback(
    (value: string) => {
      if (isLocale(value)) {
        setLocale(value, { reload: false });
      }
      update("general", { language: value });
    },
    [update],
  );
  const setNotifAgent = useCallback(
    (value: boolean) => update("notifications", { agent: value }),
    [update],
  );
  const setNotifPermissions = useCallback(
    (value: boolean) => update("notifications", { permissions: value }),
    [update],
  );
  const setNotifErrors = useCallback(
    (value: boolean) => update("notifications", { errors: value }),
    [update],
  );
  const setSoundAgentEnabled = useCallback(
    (value: boolean) => update("sounds", { agentEnabled: value }),
    [update],
  );
  const setSoundAgent = useCallback(
    (value: string) => update("sounds", { agent: value }),
    [update],
  );
  const setSoundPermissionsEnabled = useCallback(
    (value: boolean) => update("sounds", { permissionsEnabled: value }),
    [update],
  );
  const setSoundPermissions = useCallback(
    (value: string) => update("sounds", { permissions: value }),
    [update],
  );
  const setSoundErrorsEnabled = useCallback(
    (value: boolean) => update("sounds", { errorsEnabled: value }),
    [update],
  );
  const setSoundErrors = useCallback(
    (value: string) => update("sounds", { errors: value }),
    [update],
  );

  useEffect(() => {
    if (!ready || typeof document === "undefined") return;
    document.documentElement.style.setProperty(
      "--font-size",
      `${settings.appearance.fontSize}px`,
    );
  }, [ready, settings.appearance.fontSize]);

  useEffect(() => {
    if (!ready) return;
    setNextThemeRef.current(settings.general.theme);
  }, [ready, settings.general.theme]);

  useEffect(() => {
    if (!ready) return;
    const lang = settings.general.language;
    if (isLocale(lang)) {
      setLocale(lang, { reload: false });
    }
  }, [ready, settings.general.language]);

  const ctxValue = useMemo<SettingsContextValue>(
    () => ({
      ready,
      appearance: {
        fontSize: settings.appearance.fontSize,
        setFontSize,
      },
      general: {
        theme: settings.general.theme,
        setTheme,
        language: settings.general.language,
        setLanguage,
      },
      notifications: {
        agent: settings.notifications.agent,
        setAgent: setNotifAgent,
        permissions: settings.notifications.permissions,
        setPermissions: setNotifPermissions,
        errors: settings.notifications.errors,
        setErrors: setNotifErrors,
      },
      sounds: {
        agentEnabled: settings.sounds.agentEnabled,
        setAgentEnabled: setSoundAgentEnabled,
        agent: settings.sounds.agent,
        setAgent: setSoundAgent,
        permissionsEnabled: settings.sounds.permissionsEnabled,
        setPermissionsEnabled: setSoundPermissionsEnabled,
        permissions: settings.sounds.permissions,
        setPermissions: setSoundPermissions,
        errorsEnabled: settings.sounds.errorsEnabled,
        setErrorsEnabled: setSoundErrorsEnabled,
        errors: settings.sounds.errors,
        setErrors: setSoundErrors,
      },
    }),
    [
      ready,
      settings,
      setFontSize,
      setTheme,
      setLanguage,
      setNotifAgent,
      setNotifPermissions,
      setNotifErrors,
      setSoundAgentEnabled,
      setSoundAgent,
      setSoundPermissionsEnabled,
      setSoundPermissions,
      setSoundErrorsEnabled,
      setSoundErrors,
    ],
  );

  return (
    <SettingsContext.Provider value={ctxValue}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
