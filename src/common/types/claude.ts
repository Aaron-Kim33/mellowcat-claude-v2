export type ClaudeSessionStatus = "idle" | "starting" | "running" | "stopped" | "error";

export interface ClaudeSession {
  id: string;
  profileId?: string;
  status: ClaudeSessionStatus;
  startedAt?: string;
  stoppedAt?: string;
  lastOutput?: string;
  transport?: "mock" | "custom";
}

export interface ClaudeOutputEvent {
  sessionId: string;
  chunk: string;
  timestamp: string;
}

export interface ClaudeInstallationStatus {
  installed: boolean;
  executablePath?: string;
  source: "settings" | "path" | "common_path" | "not_found";
  npmAvailable: boolean;
  canAutoInstall: boolean;
  installInProgress: boolean;
  message?: string;
  manualInstallCommand?: string;
  manualInstallUrl?: string;
}
