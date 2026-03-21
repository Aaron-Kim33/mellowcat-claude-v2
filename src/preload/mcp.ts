import { ipcRenderer } from "electron";
import type { MCPOutputEvent } from "../common/types/mcp";

export const mcpBridge = {
  listInstalled: () => ipcRenderer.invoke("mcp:listInstalled"),
  listCatalog: () => ipcRenderer.invoke("mcp:listCatalog"),
  install: (mcpId: string) => ipcRenderer.invoke("mcp:install", mcpId),
  uninstall: (mcpId: string) => ipcRenderer.invoke("mcp:uninstall", mcpId),
  enable: (mcpId: string) => ipcRenderer.invoke("mcp:enable", mcpId),
  disable: (mcpId: string) => ipcRenderer.invoke("mcp:disable", mcpId),
  start: (mcpId: string) => ipcRenderer.invoke("mcp:start", mcpId),
  stop: (mcpId: string) => ipcRenderer.invoke("mcp:stop", mcpId),
  update: (mcpId: string) => ipcRenderer.invoke("mcp:update", mcpId),
  onOutput: (callback: (event: MCPOutputEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: MCPOutputEvent) => callback(payload);
    ipcRenderer.on("mcp:output", listener);
    return () => ipcRenderer.removeListener("mcp:output", listener);
  }
};
