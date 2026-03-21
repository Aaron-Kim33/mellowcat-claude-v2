import path from "node:path";
import { BrowserWindow } from "electron";

export class WindowManager {
  createMainWindow(): BrowserWindow {
    const preloadPath = path.join(__dirname, "../../preload/index.js");

    const win = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1180,
      minHeight: 760,
      backgroundColor: "#0f1115",
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      void win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      void win.loadFile(path.join(__dirname, "../../../renderer/index.html"));
    }

    return win;
  }
}
