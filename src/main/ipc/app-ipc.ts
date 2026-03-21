import { app, ipcMain } from "electron";
import type { AppMeta } from "../../common/types/app";

export function registerAppIpc(): void {
  ipcMain.handle("app:getMeta", (): AppMeta => ({
    name: app.getName(),
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node
  }));
}
