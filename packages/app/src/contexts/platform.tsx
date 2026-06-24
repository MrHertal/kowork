// @opencode-ref: opencode/packages/app/src/context/platform.tsx
import { createContext, useContext, type ReactNode } from "react";
import type { ServerConnection } from "./server";

export type DisplayBackend = "auto" | "wayland";

export type Platform = {
  platform: "desktop" | "web";
  os?: "macos" | "windows" | "linux";
  version?: string;

  openDirectoryPickerDialog?: (opts?: {
    multiple?: boolean;
    title?: string;
    defaultPath?: string;
  }) => Promise<string | string[] | null>;
  openFilePickerDialog?: (opts?: {
    multiple?: boolean;
    title?: string;
    accept?: string[];
    extensions?: string[];
  }) => Promise<string | string[] | null>;
  saveFilePickerDialog?: (opts?: {
    title?: string;
    defaultPath?: string;
  }) => Promise<string | null>;

  openLink: (url: string) => void;
  openPath?: (path: string, app?: string) => Promise<void>;

  back: () => void;
  forward: () => void;

  storage?: (name?: string) => AsyncStorage;

  checkUpdate?: () => Promise<{ updateAvailable: boolean; version?: string }>;
  update?: () => Promise<void>;
  restart: () => Promise<void>;

  notify: (title: string, description?: string, href?: string) => Promise<void>;

  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  getWslEnabled?: () => Promise<boolean>;
  setWslEnabled?: (enabled: boolean) => Promise<void>;

  getDefaultServer?: () => Promise<ServerConnection.Key | null>;
  setDefaultServer?: (url: ServerConnection.Key | null) => Promise<void>;

  getDisplayBackend?: () => Promise<DisplayBackend | null>;
  setDisplayBackend?: (backend: DisplayBackend) => Promise<void>;

  parseMarkdown?: (markdown: string) => Promise<string>;

  webviewZoom?: number;

  checkAppExists?: (appName: string) => Promise<boolean>;
  readClipboardImage?: () => Promise<File | null>;

  opencodeConfigRead?: () => Promise<unknown>;
  opencodeConfigPatch?: (
    pointer: ReadonlyArray<string | number>,
    value: unknown,
  ) => Promise<void>;
  managedSkillsDir?: () => Promise<string>;
  installBundledSkill?: (id: string) => Promise<void>;
  uninstallBundledSkill?: (id: string) => Promise<void>;
};

export type AsyncStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  key: (index: number) => Promise<string | undefined>;
  getLength: () => Promise<number>;
};

const PlatformContext = createContext<Platform | null>(null);

export function PlatformProvider(props: {
  value: Platform;
  children: ReactNode;
}) {
  return (
    <PlatformContext.Provider value={props.value}>
      {props.children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): Platform {
  const ctx = useContext(PlatformContext);
  if (!ctx)
    throw new Error("usePlatform must be used within a PlatformProvider");
  return ctx;
}
