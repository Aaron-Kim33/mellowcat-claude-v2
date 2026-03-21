import { BrowserWindow, ipcMain } from "electron";
import type { ClaudeOutputEvent } from "../../common/types/claude";
import { ClaudeEngine } from "../services/claude/claude-engine";
import { ClaudeInstallationService } from "../services/claude/claude-installation-service";

export function registerClaudeIpc(
  claudeEngine: ClaudeEngine,
  installationService: ClaudeInstallationService
): void {
  claudeEngine.on("output", (payload: ClaudeOutputEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("claude:output", payload);
    });
  });

  ipcMain.handle("claude:start", (_event, profileId?: string) => {
    return claudeEngine.startSession(profileId);
  });

  ipcMain.handle("claude:stop", (_event, sessionId: string) => {
    claudeEngine.stopSession(sessionId);
  });

  ipcMain.handle("claude:input", (_event, sessionId: string, input: string) => {
    claudeEngine.sendInput(sessionId, input);
  });

  ipcMain.handle("claude:resize", (_event, sessionId: string, cols: number, rows: number) => {
    claudeEngine.resizeSession(sessionId, cols, rows);
  });
  ipcMain.handle("claude:getInstallationStatus", () => installationService.getStatus());
  ipcMain.handle("claude:detectInstallation", () => installationService.detectAndPersist());
  ipcMain.handle("claude:installClaudeCode", () => installationService.installClaudeCode());
}
