import { ipcRenderer } from "electron";

export const authBridge = {
  getSession: () => ipcRenderer.invoke("auth:getSession"),
  loginWithBrowser: () => ipcRenderer.invoke("auth:login"),
  logout: () => ipcRenderer.invoke("auth:logout")
};
