import { beforeEach, describe, expect, test, vi } from "vitest";

type CheckResult = {
  isUpdateAvailable?: boolean;
  updateInfo?: {
    version?: string;
    releaseDate?: string;
    releaseName?: string;
    files?: Array<{ url: string }>;
  };
} | null;

const doubles = vi.hoisted(() => ({
  autoUpdater: {
    logger: undefined as unknown,
    channel: "",
    allowPrerelease: true,
    allowDowngrade: false,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn<() => Promise<CheckResult>>(),
    downloadUpdate: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    quitAndInstall: vi.fn<() => void>(),
  },
  showMessageBox: vi.fn<(options: unknown) => Promise<{ response: number }>>(),
  log: {
    log: vi.fn<(message: string, meta?: unknown) => void>(),
    error: vi.fn<(message: string, error?: unknown) => void>(),
  },
}));

vi.mock("electron", () => ({
  app: { getVersion: () => "1.2.3", isPackaged: true },
  dialog: { showMessageBox: doubles.showMessageBox },
}));

vi.mock("electron-updater", () => ({
  default: { autoUpdater: doubles.autoUpdater },
}));

vi.mock("electron-log/main.js", () => ({
  default: doubles.log,
}));

vi.mock("./constants", () => ({
  UPDATER_ENABLED: true,
  SETTINGS_STORE: "kowork.settings",
  DEFAULT_SERVER_URL_KEY: "defaultServerUrl",
  WSL_ENABLED_KEY: "wslEnabled",
}));

const available: CheckResult = {
  isUpdateAvailable: true,
  updateInfo: {
    version: "2.0.0",
    releaseDate: "2026-08-01",
    files: [{ url: "kowork-2.0.0.zip" }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  doubles.autoUpdater.checkForUpdates.mockImplementation(() =>
    Promise.resolve(available),
  );
  doubles.autoUpdater.downloadUpdate.mockImplementation(() =>
    Promise.resolve(),
  );
  doubles.showMessageBox.mockImplementation(() =>
    Promise.resolve({ response: 0 }),
  );
});

const load = () => import("./updater");

describe("setupAutoUpdater", () => {
  test("configures a stable, manually-downloaded channel", async () => {
    const { setupAutoUpdater } = await load();

    setupAutoUpdater();

    expect(doubles.autoUpdater.channel).toBe("latest");
    expect(doubles.autoUpdater.allowPrerelease).toBe(false);
    expect(doubles.autoUpdater.allowDowngrade).toBe(true);
    expect(doubles.autoUpdater.autoDownload).toBe(false);
    expect(doubles.autoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(doubles.autoUpdater.logger).toBe(doubles.log);
  });
});

describe("checkUpdate", () => {
  test("downloads and reports an available update", async () => {
    const { checkUpdate } = await load();

    const result = await checkUpdate();

    expect(result).toEqual({ updateAvailable: true, version: "2.0.0" });
    expect(doubles.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  test("reuses an already downloaded update", async () => {
    const { checkUpdate } = await load();

    await checkUpdate();
    const result = await checkUpdate();

    expect(result).toEqual({ updateAvailable: true, version: "2.0.0" });
    expect(doubles.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(doubles.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  test("shares a check that is already in progress", async () => {
    let resolveCheck: ((result: CheckResult) => void) | undefined;
    doubles.autoUpdater.checkForUpdates.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const { checkUpdate } = await load();

    const first = checkUpdate();
    const second = checkUpdate();
    resolveCheck?.(available);

    await expect(first).resolves.toEqual({
      updateAvailable: true,
      version: "2.0.0",
    });
    await expect(second).resolves.toEqual({
      updateAvailable: true,
      version: "2.0.0",
    });
    expect(doubles.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(doubles.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  test("reports no update when none is available", async () => {
    doubles.autoUpdater.checkForUpdates.mockImplementation(() =>
      Promise.resolve({ isUpdateAvailable: false, updateInfo: undefined }),
    );
    const { checkUpdate } = await load();

    const result = await checkUpdate();

    expect(result).toEqual({ updateAvailable: false });
    expect(doubles.autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  test("reports no update when the metadata lacks a version", async () => {
    doubles.autoUpdater.checkForUpdates.mockImplementation(() =>
      Promise.resolve({ isUpdateAvailable: true, updateInfo: {} }),
    );
    const { checkUpdate } = await load();

    const result = await checkUpdate();

    expect(result).toEqual({ updateAvailable: false });
    expect(doubles.autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  test("reports a failure when the check rejects", async () => {
    doubles.autoUpdater.checkForUpdates.mockImplementation(() =>
      Promise.reject(new Error("offline")),
    );
    const { checkUpdate } = await load();

    const result = await checkUpdate();

    expect(result).toEqual({ updateAvailable: false, failed: true });
    expect(doubles.log.error).toHaveBeenCalledWith(
      "update check failed",
      expect.any(Error),
    );
  });
});

describe("installUpdate", () => {
  test("checks for an update before installing when needed", async () => {
    const { installUpdate } = await load();
    const killSidecar = vi.fn<() => Promise<void>>(() => Promise.resolve());

    await installUpdate(killSidecar);

    expect(doubles.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(killSidecar).toHaveBeenCalledTimes(1);
    expect(doubles.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  test("kills the sidecar before quitting once an update is ready", async () => {
    const { checkUpdate, installUpdate } = await load();
    const killSidecar = vi.fn<() => Promise<void>>(() => Promise.resolve());

    await checkUpdate();
    await installUpdate(killSidecar);

    expect(killSidecar).toHaveBeenCalledTimes(1);
    expect(doubles.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(killSidecar.mock.invocationCallOrder[0]).toBeLessThan(
      doubles.autoUpdater.quitAndInstall.mock.invocationCallOrder[0]!,
    );
  });

  test("shares an install that is already in progress", async () => {
    let finishShutdown: (() => void) | undefined;
    const killSidecar = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishShutdown = resolve;
        }),
    );
    const { checkUpdate, installUpdate } = await load();
    await checkUpdate();

    const first = installUpdate(killSidecar);
    const second = installUpdate(killSidecar);

    expect(killSidecar).toHaveBeenCalledTimes(1);
    expect(doubles.autoUpdater.quitAndInstall).not.toHaveBeenCalled();

    finishShutdown?.();
    await Promise.all([first, second]);

    expect(doubles.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});

describe("checkForUpdates", () => {
  test("stays silent on failure unless asked to alert", async () => {
    doubles.autoUpdater.checkForUpdates.mockImplementation(() =>
      Promise.reject(new Error("offline")),
    );
    const { checkForUpdates } = await load();
    const killSidecar = vi.fn<() => Promise<void>>(() => Promise.resolve());

    await checkForUpdates(false, killSidecar);
    expect(doubles.showMessageBox).not.toHaveBeenCalled();

    await checkForUpdates(true, killSidecar);
    expect(doubles.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  test("reports when already up to date", async () => {
    doubles.autoUpdater.checkForUpdates.mockImplementation(() =>
      Promise.resolve({ isUpdateAvailable: false, updateInfo: undefined }),
    );
    const { checkForUpdates } = await load();

    await checkForUpdates(true, vi.fn<() => Promise<void>>());

    expect(doubles.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ message: "You're up to date." }),
    );
  });

  test("installs after the user confirms the restart", async () => {
    const { checkForUpdates } = await load();
    const killSidecar = vi.fn<() => Promise<void>>(() => Promise.resolve());

    await checkForUpdates(true, killSidecar);

    expect(doubles.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Update 2.0.0 downloaded. Restart now?",
      }),
    );
    expect(killSidecar).toHaveBeenCalledTimes(1);
    expect(doubles.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  test("does nothing when the user chooses later", async () => {
    doubles.showMessageBox.mockImplementation(() =>
      Promise.resolve({ response: 1 }),
    );
    const { checkForUpdates } = await load();
    const killSidecar = vi.fn<() => Promise<void>>(() => Promise.resolve());

    await checkForUpdates(true, killSidecar);

    expect(killSidecar).not.toHaveBeenCalled();
    expect(doubles.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });
});
