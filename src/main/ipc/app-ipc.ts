import { app, ipcMain, shell } from "electron";
import type { AppMeta } from "../../common/types/app";

export function registerAppIpc(): void {
  ipcMain.handle("app:getMeta", (): AppMeta => ({
    name: app.getName(),
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node
  }));
  ipcMain.handle("app:openExternal", (_event, url: string) => shell.openExternal(url));
}
