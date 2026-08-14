// @opencode-ref: opencode/packages/desktop/src/preload/types.ts

export type ServerReadyData = {
  url: string;
  username: string | null;
  password: string | null;
};

export type WslConfig = { enabled: boolean };

export type LinuxDisplayBackend = "wayland" | "auto";
export type TitlebarTheme = {
  mode: "light" | "dark";
};

export type ElectronAPI = {
  killSidecar: () => Promise<void>;
  installCli: () => Promise<string>;
  awaitInitialization: () => Promise<ServerReadyData>;
  getDefaultServerUrl: () => Promise<string | null>;
  setDefaultServerUrl: (url: string | null) => Promise<void>;
  getWslConfig: () => Promise<WslConfig>;
  setWslConfig: (config: WslConfig) => Promise<void>;
  getDisplayBackend: () => Promise<LinuxDisplayBackend | null>;
  setDisplayBackend: (backend: LinuxDisplayBackend | null) => Promise<void>;
  parseMarkdownCommand: (markdown: string) => Promise<string>;
  checkAppExists: (appName: string) => Promise<boolean>;
  wslPath: (path: string, mode: "windows" | "linux" | null) => Promise<string>;
  resolveAppPath: (appName: string) => Promise<string | null>;
  storeGet: (name: string, key: string) => Promise<string | null>;
  storeSet: (name: string, key: string, value: string) => Promise<void>;
  storeDelete: (name: string, key: string) => Promise<void>;
  storeClear: (name: string) => Promise<void>;
  storeKeys: (name: string) => Promise<string[]>;
  storeLength: (name: string) => Promise<number>;

  getWindowCount: () => Promise<number>;
  onMenuCommand: (cb: (id: string) => void) => () => void;
  onDeepLink: (cb: (urls: string[]) => void) => () => void;

  openDirectoryPicker: (opts?: {
    multiple?: boolean;
    title?: string;
    defaultPath?: string;
  }) => Promise<string | string[] | null>;
  openFilePicker: (opts?: {
    multiple?: boolean;
    title?: string;
    defaultPath?: string;
    accept?: string[];
    extensions?: string[];
  }) => Promise<string | string[] | null>;
  getPathForFile: (file: File) => string;
  saveFilePicker: (opts?: {
    title?: string;
    defaultPath?: string;
  }) => Promise<string | null>;
  openLink: (url: string) => void;
  openPath: (path: string, app?: string) => Promise<void>;
  showItemInFolder: (path: string) => Promise<void>;
  readClipboardImage: () => Promise<{
    buffer: ArrayBuffer;
    width: number;
    height: number;
  } | null>;
  showNotification: (title: string, body?: string) => void;
  getWindowFocused: () => Promise<boolean>;
  setWindowFocus: () => Promise<void>;
  showWindow: () => Promise<void>;
  relaunch: () => void;
  getZoomFactor: () => Promise<number>;
  setZoomFactor: (factor: number) => Promise<void>;
  setTitlebar: (theme: TitlebarTheme) => Promise<void>;
  runUpdater: (alertOnFail: boolean) => Promise<void>;
  checkUpdate: () => Promise<{ updateAvailable: boolean; version?: string }>;
  installUpdate: () => Promise<void>;
  setBackgroundColor: (color: string) => Promise<void>;
  opencodeConfigRead: () => Promise<unknown>;
  opencodeConfigPatch: (
    pointer: ReadonlyArray<string | number>,
    value: unknown,
  ) => Promise<void>;
  managedSkillsDir: () => Promise<string>;
  installBundledSkill: (id: string) => Promise<void>;
  uninstallBundledSkill: (id: string) => Promise<void>;
};
