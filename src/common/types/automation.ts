export type AutomationJobStage =
  | "idle"
  | "shortlisted"
  | "selected"
  | "awaiting_script_category"
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

export type ShortformScriptCategory = "horror" | "romance" | "community";
export type ShortformIdeaStrategy = "pattern_remix" | "comment_gap" | "series_ip";
export type ScriptLengthMode = "auto" | "shortform" | "longform";
export type ProcessDraftMode = "auto_generate" | "manual_polish";

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

export type WorkflowAiProvider =
  | "claude_cli"
  | "openrouter_api"
  | "openai_api"
  | "mock";

export type WorkflowAiConnectionRef = "connection_1" | "connection_2";

export interface ShortformWorkflowConfig {
  inputMode?: "auto" | "manual";
  processMode?: "auto" | "manual";
  createMode?: "auto" | "manual";
  outputMode?: "auto" | "manual";
  inputProviderType?: "builtin" | "module";
  processProviderType?: "builtin" | "module";
  createProviderType?: "builtin" | "module";
  outputProviderType?: "builtin" | "module";
  inputModuleId?: string;
  processModuleId?: string;
  createModuleId?: string;
  outputModuleId?: string;
  inputAiConnection?: WorkflowAiConnectionRef;
  inputAiProvider?: WorkflowAiProvider;
  inputAiModel?: string;
  processAiConnection?: WorkflowAiConnectionRef;
  processAiProvider?: WorkflowAiProvider;
  processAiModel?: string;
  processIdeaStrategy?: ShortformIdeaStrategy;
  processLengthMode?: ScriptLengthMode;
  processDraftMode?: ProcessDraftMode;
  createAiConnection?: WorkflowAiConnectionRef;
  createAiProvider?: WorkflowAiProvider;
  createAiModel?: string;
  outputAiConnection?: WorkflowAiConnectionRef;
  outputAiProvider?: WorkflowAiProvider;
  outputAiModel?: string;
  inputAiSummaryEnabled?: boolean;
  processAiGenerationEnabled?: boolean;
  createAiGenerationEnabled?: boolean;
  outputAiGenerationEnabled?: boolean;
  trendWindow: "24h" | "3d";
  scriptProvider: WorkflowAiProvider;
  openRouterApiKey?: string;
  openRouterModel?: string;
  openAiApiKey?: string;
  openAiModel?: string;
  telegramBotToken?: string;
  telegramAdminChatId?: string;
  telegramOutputLanguage?: "en" | "ko";
  instagramAccountHandle?: string;
  instagramAccessToken?: string;
  pexelsApiKey?: string;
  createAssetSource?: "pexels" | "flux";
  fluxApiKey?: string;
  fluxApiBaseUrl?: string;
  fluxModel?: string;
  createBackgroundSourceType?: "preset" | "custom";
  createSceneStylePresetId?: string;
  createTargetDurationSec?: number;
  createMinimumSceneCount?: number;
  createBackgroundMediaPath?: string;
  createSubtitleTheme?: "clean_dark" | "clean_light" | "story_bold";
  createVideoSubtitleMode?: "soft" | "hard";
  createVideoRenderQuality?: "standard" | "high";
  createRerenderSceneIndexes?: string;
  youtubeChannelLabel?: string;
  youtubePrivacyStatus?: "private" | "unlisted" | "public";
  youtubeCategoryId?: string;
  youtubeAudience?: "not_made_for_kids" | "made_for_kids";
  youtubeRequireCaptions?: boolean;
  youtubeDataApiKey?: string;
  youtubeOAuthClientId?: string;
  youtubeOAuthClientSecret?: string;
  youtubeOAuthRedirectPort?: string;
}
