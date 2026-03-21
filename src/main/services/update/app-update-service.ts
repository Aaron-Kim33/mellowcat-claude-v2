import { app, dialog } from "electron";
import { EventEmitter } from "node:events";
import log from "electron-log";
import { autoUpdater } from "electron-updater";
import type { AppUpdateStatus } from "../../../common/types/settings";

export class AppUpdateService extends EventEmitter {
  private status: AppUpdateStatus = {
    state: "idle",
    message: "Updater idle"
  };

  constructor() {
    super();
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  }

  getStatus(): AppUpdateStatus {
    return this.status;
  }

  initialize(): void {
    if (!app.isPackaged) {
      this.setStatus({
        state: "idle",
        message: "Auto-update checks run only in packaged builds."
      });
      return;
    }

    autoUpdater.on("checking-for-update", () => {
      log.info("[updater] checking for updates");
      this.setStatus({
        state: "checking",
        message: "Checking for updates..."
      });
    });

    autoUpdater.on("update-available", (info) => {
      log.info("[updater] update available", info.version);
      this.setStatus({
        state: "available",
        version: info.version,
        message: `Update ${info.version} found. Downloading...`
      });
    });

    autoUpdater.on("update-not-available", () => {
      log.info("[updater] no updates available");
      this.setStatus({
        state: "not-available",
        message: "You already have the latest version."
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      this.setStatus({
        state: "downloading",
        message: `Downloading update... ${Math.round(progress.percent)}%`
      });
    });

    autoUpdater.on("error", (error) => {
      log.error("[updater] error", error);
      this.setStatus({
        state: "error",
        message: `Update error: ${error.message}`
      });
    });

    autoUpdater.on("update-downloaded", async (info) => {
      log.info("[updater] update downloaded", info.version);
      this.setStatus({
        state: "downloaded",
        version: info.version,
        message: `Update ${info.version} downloaded. Restart to apply it.`
      });
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

  private setStatus(nextStatus: AppUpdateStatus): void {
    this.status = nextStatus;
    this.emit("status", nextStatus);
  }
}
