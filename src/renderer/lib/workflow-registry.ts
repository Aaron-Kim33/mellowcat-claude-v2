import type { ShortformWorkflowConfig, TelegramControlStatus } from "@common/types/automation";
import type { YouTubeAuthStatus, YouTubeUploadResult } from "@common/types/settings";
import {
  SHORTFORM_TELEGRAM_INSTAGRAM_SCHEMA,
  SHORTFORM_TELEGRAM_YOUTUBE_SCHEMA,
  SHORTFORM_WORKFLOW_SCHEMA
} from "./workflow-schemas";
import type { WorkflowUISchema } from "./workflow-ui-schema";

export interface WorkflowContextSnapshot {
  installedIds: string[];
  installedWorkflowIds?: string[];
  workflowConfig?: ShortformWorkflowConfig;
  telegramStatus?: TelegramControlStatus;
  youTubeAuthStatus?: YouTubeAuthStatus;
  lastYouTubeUploadResult?: YouTubeUploadResult;
}

export interface RegisteredWorkflow {
  id: string;
  schema: WorkflowUISchema;
  matches: (context: WorkflowContextSnapshot) => boolean;
}

function hasShortformSignals(context: WorkflowContextSnapshot) {
  const workflow = context.workflowConfig;

  return Boolean(
    context.installedWorkflowIds?.includes("shortform-automation-stack") ||
      context.installedIds.some((id) =>
        [
          "telegram-control-mcp",
          "trend-discovery-mcp",
          "shortform-script-mcp",
          "asset-packager-mcp",
          "youtube-publish-mcp",
          "instagram-publish-mcp"
        ].includes(id)
      ) ||
      workflow?.telegramBotToken ||
      workflow?.telegramAdminChatId ||
      workflow?.openRouterApiKey ||
      workflow?.openAiApiKey ||
      workflow?.youtubeOAuthClientId ||
      workflow?.youtubeOAuthClientSecret ||
      context.telegramStatus?.configured ||
      context.telegramStatus?.lastPackagePath ||
      context.youTubeAuthStatus?.configured ||
      context.lastYouTubeUploadResult
  );
}

const REGISTERED_WORKFLOWS: RegisteredWorkflow[] = [
  {
    id: "shortform-telegram-youtube",
    schema: SHORTFORM_TELEGRAM_YOUTUBE_SCHEMA,
    matches: (context) => context.installedWorkflowIds?.includes("shortform-telegram-youtube") ?? false
  },
  {
    id: "shortform-telegram-instagram",
    schema: SHORTFORM_TELEGRAM_INSTAGRAM_SCHEMA,
    matches: (context) =>
      context.installedWorkflowIds?.includes("shortform-telegram-instagram") ?? false
  },
  {
    id: "shortform-automation-stack",
    schema: SHORTFORM_WORKFLOW_SCHEMA,
    matches: hasShortformSignals
  }
];

export function resolveRegisteredWorkflows(
  context: WorkflowContextSnapshot
): RegisteredWorkflow[] {
  const explicitMatches = REGISTERED_WORKFLOWS.filter(
    (workflow) =>
      context.installedWorkflowIds?.includes(workflow.id) && workflow.matches(context)
  );

  if (explicitMatches.length > 0) {
    return explicitMatches;
  }

  return REGISTERED_WORKFLOWS.filter((workflow) => workflow.matches(context));
}
