import { BrowserWindow, ipcMain } from "electron";
import type { AppUpdateStatus } from "../../common/types/settings";
import { AppUpdateService } from "../services/update/app-update-service";

export function registerSystemIpc(appUpdateService: AppUpdateService): void {
  appUpdateService.on("status", (status: AppUpdateStatus) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("app:update-status", status);
    });
  });

  ipcMain.handle("settings:getUpdateStatus", () => appUpdateService.getStatus());
}
