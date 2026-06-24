export const UPDATER_ENABLED = () => window.__KOWORK__?.updaterEnabled ?? false;

export async function runUpdater({ alertOnFail }: { alertOnFail: boolean }) {
  try {
    await window.api.runUpdater(alertOnFail);
  } catch {
    if (alertOnFail) {
      window.alert("Update check failed. Please try again later.");
    }
  }
}
