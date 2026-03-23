export type AutomationJobStage =
  | "idle"
  | "shortlisted"
  | "selected"
  | "scripting"
  | "awaiting_review"
  | "awaiting_revision_input"
  | "approved"
  | "packaging"
  | "ready"
  | "rejected"
  | "error";

export interface AutomationJobSnapshot {
  id: string;
  title: string;
  stage: AutomationJobStage;
  createdAt: string;
  updatedAt: string;
}

export interface ShortformScriptDraft {
  titleOptions: string[];
  hook: string;
  narration: string;
  callToAction: string;
}

export interface ShortformScriptResult {
  source: "claude" | "openrouter" | "openai" | "mock";
  draft: ShortformScriptDraft;
  error?: string;
}

export interface TelegramControlStatus {
  configured: boolean;
  botTokenConfigured: boolean;
  adminChatIdConfigured: boolean;
  transport: "mock" | "telegram";
  state: "idle" | "configured" | "running" | "error";
  message: string;
  lastEventAt?: string;
  lastDispatchAt?: string;
  lastCallbackData?: string;
  lastDraftSource?: "claude" | "openrouter" | "openai" | "mock";
  lastDraftError?: string;
  lastPackagePath?: string;
  trendSourceDebug?: Array<{
    sourceId: string;
    region: "global" | "domestic";
    count: number;
    status: "ok" | "fallback" | "error";
    message?: string;
  }>;
  activeJob?: AutomationJobSnapshot;
}

export interface ShortformWorkflowConfig {
  trendWindow: "24h" | "3d";
  scriptProvider: "claude_cli" | "openrouter_api" | "openai_api" | "mock";
  openRouterApiKey?: string;
  openRouterModel?: string;
  openAiApiKey?: string;
  openAiModel?: string;
  telegramBotToken?: string;
  telegramAdminChatId?: string;
  telegramOutputLanguage?: "en" | "ko";
  youtubeChannelLabel?: string;
  youtubePrivacyStatus?: "private" | "unlisted" | "public";
  youtubeCategoryId?: string;
  youtubeAudience?: "not_made_for_kids" | "made_for_kids";
  youtubeOAuthClientId?: string;
  youtubeOAuthClientSecret?: string;
  youtubeOAuthRedirectPort?: string;
}
