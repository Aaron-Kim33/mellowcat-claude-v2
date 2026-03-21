export interface AppSettings {
  vaultPath: string;
  generatedMcpConfigPath: string;
  autoUpdate: boolean;
  claudeExecutablePath?: string;
  claudeArgs?: string[];
  apiBaseUrl?: string;
  launchOnStartup: boolean;
}
