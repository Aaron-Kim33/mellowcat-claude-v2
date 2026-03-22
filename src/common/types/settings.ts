export interface AppSettings {
  vaultPath: string;
  generatedMcpConfigPath: string;
  autoUpdate: boolean;
  launcherLanguage?: "en" | "ko";
  trendWindow?: "24h" | "3d";
  claudeExecutablePath?: string;
  claudeArgs?: string[];
  apiBaseUrl?: string;
  scriptProvider?: "claude_cli" | "openrouter_api" | "openai_api" | "mock";
  openRouterApiKey?: string;
  openRouterModel?: string;
  openAiApiKey?: string;
  openAiModel?: string;
  telegramBotToken?: string;
  telegramAdminChatId?: string;
  telegramOutputLanguage?: "en" | "ko";
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
