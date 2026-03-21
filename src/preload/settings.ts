import { ipcRenderer } from "electron";
import type { AppSettings } from "../common/types/settings";

export const settingsBridge = {
  get: () => ipcRenderer.invoke("settings:get"),
  set: (patch: Partial<AppSettings>) => ipcRenderer.invoke("settings:set", patch)
};
