import { ipcRenderer } from "electron";
import type { ClaudeOutputEvent } from "../common/types/claude";

export const claudeBridge = {
  startSession: (profileId?: string) => ipcRenderer.invoke("claude:start", profileId),
  stopSession: (sessionId: string) => ipcRenderer.invoke("claude:stop", sessionId),
  sendInput: (sessionId: string, input: string) => ipcRenderer.invoke("claude:input", sessionId, input),
  resize: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke("claude:resize", sessionId, cols, rows),
  onOutput: (callback: (event: ClaudeOutputEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ClaudeOutputEvent) => callback(payload);
    ipcRenderer.on("claude:output", listener);
    return () => ipcRenderer.removeListener("claude:output", listener);
  }
};
