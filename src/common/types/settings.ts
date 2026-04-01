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
  secondaryScriptProvider?: "claude_cli" | "openrouter_api" | "openai_api" | "mock";
  secondaryOpenRouterApiKey?: string;
  secondaryOpenRouterModel?: string;
  secondaryOpenAiApiKey?: string;
  secondaryOpenAiModel?: string;
  telegramBotToken?: string;
  telegramAdminChatId?: string;
  telegramOutputLanguage?: "en" | "ko";
  instagramAccountHandle?: string;
  instagramAccessToken?: string;
  pexelsApiKey?: string;
  azureSpeechKey?: string;
  azureSpeechRegion?: string;
  azureSpeechVoice?: string;
  mediaAnalysisPolicy?: "text_only" | "vision_on_demand";
  youtubeChannelLabel?: string;
  youtubePrivacyStatus?: "private" | "unlisted" | "public";
  youtubeCategoryId?: string;
  youtubeAudience?: "not_made_for_kids" | "made_for_kids";
  youtubeOAuthClientId?: string;
  youtubeOAuthClientSecret?: string;
  youtubeOAuthRedirectPort?: string;
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

export interface YouTubeAuthStatus {
  configured: boolean;
  connected: boolean;
  clientIdConfigured: boolean;
  channelLabel?: string;
  scope: string;
  connectedAt?: string;
  expiresAt?: string;
  message: string;
}

export interface YouTubeUploadRequest {
  platform: "youtube";
  status: "draft" | "ready" | "uploaded" | "error";
  videoFilePath: string;
  thumbnailFilePath: string;
  scheduledPublishAt: string;
  metadata: {
    title: string;
    description: string;
    tags: string[];
    categoryId: string;
    privacyStatus: "private" | "unlisted" | "public";
    selfDeclaredMadeForKids: boolean;
  };
}

export interface YouTubeUploadResult {
  ok: boolean;
  packagePath: string;
  status: "uploaded" | "error";
  videoId?: string;
  videoUrl?: string;
  requestPath: string;
  resultPath: string;
  message: string;
}
