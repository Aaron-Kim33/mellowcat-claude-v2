import type { WorkflowUISchema } from "./workflow-ui-schema";

const OPENROUTER_MODEL_OPTIONS = [
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-3.5-sonnet",
  "google/gemini-2.0-flash-001"
] as const;

const OPENAI_MODEL_OPTIONS = ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"] as const;

const YOUTUBE_CATEGORY_OPTIONS = [
  { value: "22", label: "People & Blogs" },
  { value: "24", label: "Entertainment" },
  { value: "25", label: "News & Politics" },
  { value: "27", label: "Education" }
] as const;

const DISCOVERY_AND_AI_SECTION = {
  id: "discovery-ai",
  eyebrow: "Discovery & AI",
  title: "Trend and script engine",
  fields: [
    {
      id: "trendWindow",
      label: "Trend Window",
      type: "select",
      options: [
        { label: "Recent 24 hours", value: "24h" },
        { label: "Recent 3 days", value: "3d" }
      ]
    },
    {
      id: "scriptProvider",
      label: "Script Provider",
      type: "select",
      options: [
        { label: "OpenRouter", value: "openrouter_api" },
        { label: "OpenAI", value: "openai_api" },
        { label: "Claude CLI", value: "claude_cli" },
        { label: "Mock", value: "mock" }
      ]
    },
    {
      id: "openRouterApiKey",
      label: "OpenRouter API Key",
      type: "secret",
      placeholder: "sk-or-v1-...",
      showWhen: { fieldId: "scriptProvider", equals: "openrouter_api" }
    },
    {
      id: "openRouterModel",
      label: "OpenRouter Model",
      type: "select",
      options: OPENROUTER_MODEL_OPTIONS.map((model) => ({
        label: model,
        value: model
      })),
      showWhen: { fieldId: "scriptProvider", equals: "openrouter_api" }
    },
    {
      id: "openAiApiKey",
      label: "OpenAI API Key",
      type: "secret",
      placeholder: "sk-...",
      showWhen: { fieldId: "scriptProvider", equals: "openai_api" }
    },
    {
      id: "openAiModel",
      label: "OpenAI Model",
      type: "select",
      options: OPENAI_MODEL_OPTIONS.map((model) => ({
        label: model,
        value: model
      })),
      showWhen: { fieldId: "scriptProvider", equals: "openai_api" }
    }
  ]
} as const;

const TELEGRAM_SECTION = {
  id: "telegram",
  eyebrow: "Telegram",
  title: "Review and control",
  description:
    "Change Telegram output language from the bot itself with /lang ko or /lang en.",
  fields: [
    {
      id: "telegramBotToken",
      label: "Telegram Bot Token",
      type: "secret",
      placeholder: "123456:ABC..."
    },
    {
      id: "telegramAdminChatId",
      label: "Telegram Admin Chat ID",
      type: "text",
      placeholder: "123456789"
    }
  ],
  actions: [{ id: "syncTelegram", label: "Sync Telegram", tone: "telegram" }],
  statuses: [
    { id: "savedMessage", label: "Workflow" },
    { id: "telegramQuickStart", label: "Quick start" },
    { id: "telegramMessage", label: "Telegram" },
    { id: "telegramTransport", label: "Transport" }
  ]
} as const;

const YOUTUBE_SECTION = {
  id: "youtube",
  eyebrow: "YouTube",
  title: "Connection and upload",
  description:
    "1. Approve a Telegram review to create a package. 2. Pick the video file here. 3. Upload from the same section.",
  actionPlacement: "beforeFields",
  fields: [
    {
      id: "youtubeChannelLabel",
      label: "YouTube Channel Label",
      type: "text",
      placeholder: "Main Shorts Channel"
    },
    {
      id: "youtubePrivacyStatus",
      label: "YouTube Privacy",
      type: "select",
      options: [
        { label: "Private", value: "private" },
        { label: "Unlisted", value: "unlisted" },
        { label: "Public", value: "public" }
      ]
    },
    {
      id: "youtubeCategoryId",
      label: "YouTube Category",
      type: "select",
      options: YOUTUBE_CATEGORY_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value
      }))
    },
    {
      id: "youtubeAudience",
      label: "YouTube Audience",
      type: "select",
      options: [
        { label: "Not made for kids", value: "not_made_for_kids" },
        { label: "Made for kids", value: "made_for_kids" }
      ]
    },
    {
      id: "youtubeOAuthClientId",
      label: "YouTube OAuth Client ID",
      type: "text",
      placeholder: "1234567890-xxxx.apps.googleusercontent.com"
    },
    {
      id: "youtubeOAuthClientSecret",
      label: "YouTube OAuth Client Secret",
      type: "secret",
      placeholder: "GOCSPX-..."
    },
    {
      id: "youtubeOAuthRedirectPort",
      label: "YouTube Redirect Port",
      type: "text",
      placeholder: "45123"
    },
    {
      id: "youtubePublishMode",
      label: "Publish Mode",
      type: "select",
      options: [
        { label: "Upload now", value: "now" },
        { label: "Schedule upload", value: "scheduled" }
      ]
    },
    {
      id: "youtubeScheduledPublishAt",
      label: "Scheduled Publish At",
      type: "datetime-local",
      showWhen: { fieldId: "youtubePublishMode", equals: "scheduled" }
    }
  ],
  actions: [
    { id: "refreshYouTube", label: "Refresh YouTube", tone: "secondary" },
    { id: "connectYouTube", label: "Connect YouTube", tone: "youtube" },
    { id: "disconnectYouTube", label: "Disconnect YouTube", tone: "danger" },
    { id: "chooseVideoFile", label: "Choose Video File", tone: "secondary" },
    { id: "chooseThumbnailFile", label: "Choose Thumbnail", tone: "secondary" },
    { id: "uploadLastPackage", label: "Upload Last Package", tone: "youtube" }
  ],
  statuses: [
    { id: "youtubeState", label: "YouTube" },
    { id: "selectedVideoFile", label: "Selected video" },
    { id: "selectedThumbnailFile", label: "Selected thumbnail" },
    { id: "uploadRequestStatus", label: "Upload request" },
    { id: "latestPackage", label: "Latest package" },
    { id: "lastUpload", label: "Last upload" }
  ]
} as const;

const INSTAGRAM_SECTION = {
  id: "instagram",
  eyebrow: "Instagram",
  title: "Delivery and publishing",
  description:
    "Instagram delivery is planned as the next publishing connector. This workflow already reserves the delivery slot for it.",
  statuses: [
    { id: "instagramState", label: "Instagram" },
    { id: "latestPackage", label: "Latest package" }
  ]
} as const;

export const SHORTFORM_TELEGRAM_YOUTUBE_SCHEMA: WorkflowUISchema = {
  id: "shortform-telegram-youtube",
  title: "Telegram to YouTube",
  description:
    "Run discovery and review from Telegram, then package and publish directly to YouTube.",
  sections: [DISCOVERY_AND_AI_SECTION, TELEGRAM_SECTION, YOUTUBE_SECTION]
};

export const SHORTFORM_TELEGRAM_INSTAGRAM_SCHEMA: WorkflowUISchema = {
  id: "shortform-telegram-instagram",
  title: "Telegram to Instagram",
  description:
    "Run discovery and review from Telegram, then prepare final packages for Instagram delivery.",
  sections: [DISCOVERY_AND_AI_SECTION, TELEGRAM_SECTION, INSTAGRAM_SECTION]
};

export const SHORTFORM_WORKFLOW_SCHEMA: WorkflowUISchema = {
  id: "shortform-automation-stack",
  title: "Shortform Automation Stack",
  description:
    "Manage Telegram, generation, and channel delivery settings here so automation-specific config stays with the workflow layer, not global app settings.",
  sections: [DISCOVERY_AND_AI_SECTION, TELEGRAM_SECTION, YOUTUBE_SECTION]
};
