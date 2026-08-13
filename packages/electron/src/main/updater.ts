// @opencode-ref: opencode/packages/desktop/src/main/updater.ts

import { app, dialog } from "electron";
import pkg from "electron-updater";
import log from "electron-log/main.js";
import { UPDATER_ENABLED } from "./constants";

const { autoUpdater } = pkg;

type UpdateCheckResult = {
  updateAvailable: boolean;
  version?: string;
  failed?: boolean;
};

let downloadedVersion: string | undefined;
let pendingCheck: Promise<UpdateCheckResult> | undefined;
let pendingInstall: Promise<void> | undefined;

export function setupAutoUpdater() {
  if (!UPDATER_ENABLED) return;
  autoUpdater.logger = log;
  autoUpdater.channel = "latest";
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  log.log("auto updater configured", {
    channel: autoUpdater.channel,
    allowPrerelease: autoUpdater.allowPrerelease,
    allowDowngrade: autoUpdater.allowDowngrade,
    currentVersion: app.getVersion(),
  });
}

export async function checkUpdate(): Promise<UpdateCheckResult> {
  if (!UPDATER_ENABLED) return { updateAvailable: false };
  if (downloadedVersion) {
    return { updateAvailable: true, version: downloadedVersion };
  }
  if (pendingCheck) return pendingCheck;

  pendingCheck = checkAndDownloadUpdate().finally(() => {
    pendingCheck = undefined;
  });
  return pendingCheck;
}

async function checkAndDownloadUpdate(): Promise<UpdateCheckResult> {
  log.log("checking for updates", {
    currentVersion: app.getVersion(),
    channel: autoUpdater.channel,
    allowPrerelease: autoUpdater.allowPrerelease,
    allowDowngrade: autoUpdater.allowDowngrade,
  });
  try {
    const result = await autoUpdater.checkForUpdates();
    const updateInfo = result?.updateInfo;
    log.log("update metadata fetched", {
      releaseVersion: updateInfo?.version ?? null,
      releaseDate: updateInfo?.releaseDate ?? null,
      releaseName: updateInfo?.releaseName ?? null,
      files: updateInfo?.files?.map((file) => file.url) ?? [],
    });
    const version = result?.updateInfo?.version;
    if (result?.isUpdateAvailable === false || !version) {
      log.log("no update available", {
        reason: "provider returned no newer version",
      });
      return { updateAvailable: false };
    }
    log.log("update available", { version });
    await autoUpdater.downloadUpdate();
    downloadedVersion = version;
    log.log("update download completed", { version });
    return { updateAvailable: true, version };
  } catch (error) {
    log.error("update check failed", error);
    return { updateAvailable: false, failed: true };
  }
}

export function installUpdate(killSidecar: () => Promise<void>) {
  if (pendingInstall) return pendingInstall;

  pendingInstall = installDownloadedUpdate(killSidecar).finally(() => {
    pendingInstall = undefined;
  });
  return pendingInstall;
}

async function installDownloadedUpdate(killSidecar: () => Promise<void>) {
  const result = downloadedVersion
    ? { updateAvailable: true, version: downloadedVersion }
    : await checkUpdate();
  if (!result.updateAvailable || !downloadedVersion) {
    log.log("install update skipped", {
      reason: result.failed ? "update check failed" : "no update available",
    });
    return;
  }
  log.log("installing downloaded update", {
    version: result.version ?? null,
  });
  await killSidecar();
  autoUpdater.quitAndInstall();
}

export async function checkForUpdates(
  alertOnFail: boolean,
  killSidecar: () => Promise<void>,
) {
  if (!UPDATER_ENABLED) return;
  log.log("checkForUpdates invoked", { alertOnFail });
  const result = await checkUpdate();
  if (!result.updateAvailable) {
    if (result.failed) {
      log.log("no update decision", { reason: "update check failed" });
      if (!alertOnFail) return;
      await dialog.showMessageBox({
        type: "error",
        message: "Update check failed.",
        title: "Update Error",
      });
      return;
    }

    log.log("no update decision", { reason: "already up to date" });
    if (!alertOnFail) return;
    await dialog.showMessageBox({
      type: "info",
      message: "You're up to date.",
      title: "No Updates",
    });
    return;
  }

  const response = await dialog.showMessageBox({
    type: "info",
    message: `Update ${result.version ?? ""} downloaded. Restart now?`,
    title: "Update Ready",
    buttons: ["Restart", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  log.log("update prompt response", {
    version: result.version ?? null,
    restartNow: response.response === 0,
  });
  if (response.response === 0) {
    await installUpdate(killSidecar);
  }
}
