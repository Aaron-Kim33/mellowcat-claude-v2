import { app, dialog } from "electron";
import log from "electron-log";
import { autoUpdater } from "electron-updater";

export class AppUpdateService {
  constructor() {
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  }

  initialize(): void {
    if (!app.isPackaged) {
      return;
    }

    autoUpdater.on("checking-for-update", () => {
      log.info("[updater] checking for updates");
    });

    autoUpdater.on("update-available", (info) => {
      log.info("[updater] update available", info.version);
    });

    autoUpdater.on("update-not-available", () => {
      log.info("[updater] no updates available");
    });

    autoUpdater.on("error", (error) => {
      log.error("[updater] error", error);
    });

    autoUpdater.on("update-downloaded", async (info) => {
      log.info("[updater] update downloaded", info.version);
      const result = await dialog.showMessageBox({
        type: "info",
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Update Ready",
        message: `Version ${info.version} has been downloaded.`,
        detail: "Restart MellowCat Claude to apply the update."
      });

      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });

    void autoUpdater.checkForUpdatesAndNotify();
  }
}
