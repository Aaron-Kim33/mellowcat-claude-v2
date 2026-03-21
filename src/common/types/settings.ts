export interface AppSettings {
  vaultPath: string;
  generatedMcpConfigPath: string;
  autoUpdate: boolean;
  claudeExecutablePath?: string;
  claudeArgs?: string[];
  apiBaseUrl?: string;
  launchOnStartup: boolean;
}

export interface AppUpdateStatus {
  state:
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  version?: string;
  message?: string;
}
