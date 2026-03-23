import { contextBridge, ipcRenderer } from "electron";
import type { AppMeta } from "../common/types/app";
import type {
  ShortformWorkflowConfig,
  TelegramControlStatus
} from "../common/types/automation";
import type { ClaudeInstallationStatus, ClaudeOutputEvent } from "../common/types/claude";
import type { MellowCatAPI } from "../common/types/ipc";
import type { MCPOutputEvent } from "../common/types/mcp";
import type {
  AppSettings,
  AppUpdateStatus,
  YouTubeAuthStatus,
  YouTubeUploadRequest,
  YouTubeUploadResult
} from "../common/types/settings";

const claudeBridge: MellowCatAPI["claude"] = {
  startSession: (profileId?: string) => ipcRenderer.invoke("claude:start", profileId),
  stopSession: (sessionId: string) => ipcRenderer.invoke("claude:stop", sessionId),
  sendInput: (sessionId: string, input: string) =>
    ipcRenderer.invoke("claude:input", sessionId, input),
  resize: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke("claude:resize", sessionId, cols, rows),
  getInstallationStatus: () => ipcRenderer.invoke("claude:getInstallationStatus"),
  detectInstallation: () => ipcRenderer.invoke("claude:detectInstallation"),
  installClaudeCode: () => ipcRenderer.invoke("claude:installClaudeCode"),
  onOutput: (callback: (event: ClaudeOutputEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ClaudeOutputEvent) =>
      callback(payload);
    ipcRenderer.on("claude:output", listener);
    return () => ipcRenderer.removeListener("claude:output", listener);
  }
};

const mcpBridge: MellowCatAPI["mcp"] = {
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
    const listener = (_event: Electron.IpcRendererEvent, payload: MCPOutputEvent) =>
      callback(payload);
    ipcRenderer.on("mcp:output", listener);
    return () => ipcRenderer.removeListener("mcp:output", listener);
  }
};

const settingsBridge: MellowCatAPI["settings"] = {
  get: () => ipcRenderer.invoke("settings:get"),
  set: (patch: Partial<AppSettings>) => ipcRenderer.invoke("settings:set", patch),
  getUpdateStatus: () => ipcRenderer.invoke("settings:getUpdateStatus"),
  onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AppUpdateStatus) =>
      callback(payload);
    ipcRenderer.on("app:update-status", listener);
    return () => ipcRenderer.removeListener("app:update-status", listener);
  }
};

const authBridge: MellowCatAPI["auth"] = {
  getSession: () => ipcRenderer.invoke("auth:getSession"),
  loginWithBrowser: () => ipcRenderer.invoke("auth:login"),
  logout: () => ipcRenderer.invoke("auth:logout")
};

const automationBridge: MellowCatAPI["automation"] = {
  getWorkflowConfig: (): Promise<ShortformWorkflowConfig> =>
    ipcRenderer.invoke("automation:workflow:getConfig"),
  setWorkflowConfig: (
    patch: Partial<ShortformWorkflowConfig>
  ): Promise<ShortformWorkflowConfig> =>
    ipcRenderer.invoke("automation:workflow:setConfig", patch),
  getTelegramStatus: (): Promise<TelegramControlStatus> =>
    ipcRenderer.invoke("automation:telegram:getStatus"),
  syncTelegram: (): Promise<TelegramControlStatus> =>
    ipcRenderer.invoke("automation:telegram:sync"),
  sendMockShortlist: (): Promise<TelegramControlStatus> =>
    ipcRenderer.invoke("automation:telegram:sendMockShortlist"),
  getYouTubeStatus: (): Promise<YouTubeAuthStatus> =>
    ipcRenderer.invoke("automation:youtube:getStatus"),
  connectYouTube: (): Promise<YouTubeAuthStatus> =>
    ipcRenderer.invoke("automation:youtube:connect"),
  disconnectYouTube: (): Promise<YouTubeAuthStatus> =>
    ipcRenderer.invoke("automation:youtube:disconnect"),
  inspectYouTubeUploadRequest: (packagePath: string): Promise<YouTubeUploadRequest> =>
    ipcRenderer.invoke("automation:youtube:inspectUploadRequest", packagePath),
  updateYouTubeUploadRequest: (
    packagePath: string,
    patch: Partial<YouTubeUploadRequest>
  ): Promise<YouTubeUploadRequest> =>
    ipcRenderer.invoke("automation:youtube:updateUploadRequest", packagePath, patch),
  pickYouTubeVideoFile: (): Promise<string | undefined> =>
    ipcRenderer.invoke("automation:youtube:pickVideoFile"),
  pickYouTubeThumbnailFile: (): Promise<string | undefined> =>
    ipcRenderer.invoke("automation:youtube:pickThumbnailFile"),
  uploadYouTubePackage: (packagePath: string): Promise<YouTubeUploadResult> =>
    ipcRenderer.invoke("automation:youtube:uploadPackage", packagePath)
};

const api: MellowCatAPI = {
  app: {
    getMeta: (): Promise<AppMeta> => ipcRenderer.invoke("app:getMeta")
  },
  claude: claudeBridge,
  mcp: mcpBridge,
  settings: settingsBridge,
  auth: authBridge,
  automation: automationBridge
};

contextBridge.exposeInMainWorld("mellowcat", api);
