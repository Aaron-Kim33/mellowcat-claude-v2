import { useEffect, useState } from "react";
import { useAppStore } from "../../store/app-store";
import { LogPanel } from "../../components/Terminal/LogPanel";
import {
  getDefaultAiModel,
  getAiModelLabel,
  getAiModelOptions
} from "../../lib/ai-model-catalog";
import { getLauncherCopy } from "../../lib/launcher-copy";
import { evaluateMcpComposition } from "../../lib/mcp-composition";
import { WorkflowConfigRenderer } from "../../components/Workflow/WorkflowConfigRenderer";
import { resolveRegisteredWorkflows } from "../../lib/workflow-registry";
import {
  getMcpRuntimeContract,
  listMcpRuntimeContracts
} from "../../../common/contracts/mcp-contract-registry";
import { getBuiltinSlotUiSchema } from "../../../common/contracts/builtin-slot-ui-registry";
import type {
  WorkflowAiConnectionRef,
  WorkflowAiProvider
} from "@common/types/automation";
import type {
  ManualInputCandidateDraft,
  ManualCreateCheckpointPayload,
  ManualOutputCheckpointPayload,
  WorkflowCheckpointEnvelope
} from "@common/types/slot-workflow";
import type {
  MCPSlotActionSchema,
  MCPSlotFieldSchema,
  MCPSlotUiSchema
} from "@common/types/mcp-contract";

function isoToLocalDateTimeInput(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part: number) => part.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateTimeInputToIso(value: string) {
  if (!value.trim()) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function getSlotTone(status: "ready" | "running" | "waiting" | "idle" | "error") {
  if (status === "error") {
    return "error";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "ready") {
    return "ready";
  }
  if (status === "waiting") {
    return "waiting";
  }
  return "idle";
}

function getCurrentWorkflowJobId(activeJobId?: string, lastPackagePath?: string) {
  if (activeJobId) {
    return activeJobId;
  }

  if (!lastPackagePath) {
    return undefined;
  }

  const normalized = lastPackagePath.replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1);
}

type SlotProviderType = "builtin" | "module";
type SlotId = "input" | "process" | "create" | "output";

function getSlotProviderLabel(
  providerType: SlotProviderType,
  isKorean: boolean,
  moduleName?: string
) {
  if (providerType === "builtin") {
    return isKorean ? "기본 내장 실행기" : "Built-in runner";
  }

  if (moduleName) {
    return isKorean ? `선택 모듈: ${moduleName}` : `Selected module: ${moduleName}`;
  }

  return isKorean ? "설치된 모듈을 선택해 주세요." : "Choose an installed module.";
}

function isBuiltinAiCapable(slotId: SlotId) {
  return slotId === "input" || slotId === "process";
}

function getAiConnectionLabel(
  provider: "claude_cli" | "openrouter_api" | "openai_api" | "mock",
  isKorean: boolean,
  model?: string
) {
  if (provider === "openrouter_api") {
    const label = getAiModelLabel(provider, model);
    return label ? `OpenRouter · ${label}` : "OpenRouter";
  }

  if (provider === "openai_api") {
    const label = getAiModelLabel(provider, model);
    return label ? `OpenAI · ${label}` : "OpenAI";
  }

  if (provider === "claude_cli") {
    const label = getAiModelLabel(provider, model);
    return label ? `Claude CLI · ${label}` : isKorean ? "Claude CLI 연결" : "Claude CLI";
  }

  return isKorean ? "Mock 연결" : "Mock";
}

function getAiModeSummary(
  enabled: boolean,
  provider: WorkflowAiProvider,
  isKorean: boolean,
  model?: string
) {
  if (!enabled) {
    return isKorean ? "AI 사용 안 함" : "AI disabled";
  }

  return getAiConnectionLabel(provider, isKorean, model);
}

function summarizeCheckpoint(
  checkpoint?: WorkflowCheckpointEnvelope,
  language: "ko" | "en" = "ko"
) {
  if (!checkpoint) {
    return language === "ko" ? "아직 저장된 checkpoint가 없습니다." : "No checkpoint saved yet.";
  }

  if (checkpoint.slot === "input") {
    const candidateCount = Array.isArray((checkpoint.payload as { candidates?: unknown[] }).candidates)
      ? ((checkpoint.payload as { candidates?: unknown[] }).candidates?.length ?? 0)
      : 0;
    return language === "ko"
      ? `후보 ${candidateCount}개가 기록되어 있습니다.`
      : `${candidateCount} candidates are recorded.`;
  }

  if (checkpoint.slot === "process") {
    const summary = (checkpoint.payload as { summary?: { headline?: string } }).summary?.headline;
    return summary || (language === "ko" ? "스크립트 초안이 저장되어 있습니다." : "A script draft is stored.");
  }

  if (checkpoint.slot === "create") {
    const packagePath = (checkpoint.payload as { packagePath?: string }).packagePath;
    return packagePath || (language === "ko" ? "제작 패키지가 준비되었습니다." : "A creation package is ready.");
  }

  if (checkpoint.slot === "output") {
    const result = (checkpoint.payload as { result?: { videoUrl?: string; status?: string } }).result;
    return result?.videoUrl || result?.status || (language === "ko" ? "배포 정보가 저장되어 있습니다." : "Publish info is stored.");
  }

  return language === "ko" ? "checkpoint 정보가 있습니다." : "Checkpoint data is available.";
}

function createEmptyManualCandidate(index: number): ManualInputCandidateDraft {
  return {
    id: `manual-candidate-${index}`,
    title: "",
    summary: "",
    operatorSummary: "",
    sourceLabel: "",
    sourceUrl: "",
    fitReason: "",
    sourceKind: "mock",
    sourceRegion: "domestic",
    contentAngle: "manual_input"
  };
}

function getRendererFilePath(file: File): string | undefined {
  return (file as File & { path?: string }).path;
}

function getSlotButtonClass(kind: MCPSlotActionSchema["kind"]) {
  if (kind === "danger") {
    return "danger-button";
  }
  if (kind === "primary") {
    return "primary-button youtube";
  }
  return "secondary-button";
}

function hasVoiceoverCredentials(settings?: {
  azureSpeechKey?: string;
  azureSpeechRegion?: string;
  openAiApiKey?: string;
  secondaryOpenAiApiKey?: string;
}) {
  const hasAzure = Boolean(settings?.azureSpeechKey?.trim() && settings?.azureSpeechRegion?.trim());
  const hasOpenAi = Boolean(settings?.openAiApiKey?.trim() || settings?.secondaryOpenAiApiKey?.trim());
  return hasAzure || hasOpenAi;
}

export function InstalledPage() {
  const {
    catalog,
    installed,
    settings,
    workflowConfig,
    workflowJobSnapshot,
    telegramStatus,
    youTubeAuthStatus,
    youTubeUploadRequest,
    lastYouTubeUploadResult,
    enableMcp,
    disableMcp,
    startMcp,
    stopMcp,
    uninstallMcp,
    selectedMcpLogId,
    selectMcpLog,
    mcpOutputById,
    saveWorkflowConfig,
    refreshWorkflowJobSnapshot,
    runCreatePipeline,
    saveManualInputCheckpoint,
    saveManualProcessCheckpoint,
    saveManualCreateCheckpoint,
    saveManualOutputCheckpoint,
    refreshTelegramStatus,
    refreshYouTubeStatus,
    connectYouTube,
    disconnectYouTube,
    refreshYouTubeUploadRequest,
    saveYouTubeUploadRequest,
    pickYouTubeVideoFile,
    pickYouTubeThumbnailFile,
    uploadLastPackageToYouTube
  } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.installed;
  const isKorean = settings?.launcherLanguage === "ko";
  const composition = evaluateMcpComposition(installed.map((item) => item.id));
  const resolvedWorkflows = resolveRegisteredWorkflows({
    installedIds: installed.map((item) => item.id),
    installedWorkflowIds: installed.flatMap((item) => item.workflow?.ids ?? []),
    workflowConfig,
    telegramStatus,
    youTubeAuthStatus,
    lastYouTubeUploadResult
  });
  const [trendWindow, setTrendWindow] = useState<"24h" | "3d">("24h");
  const [inputAiSummaryEnabled, setInputAiSummaryEnabled] = useState(true);
  const [processAiGenerationEnabled, setProcessAiGenerationEnabled] = useState(true);
  const [createAiGenerationEnabled, setCreateAiGenerationEnabled] = useState(false);
  const [outputAiGenerationEnabled, setOutputAiGenerationEnabled] = useState(false);
  const [inputProviderType, setInputProviderType] = useState<SlotProviderType>("builtin");
  const [processProviderType, setProcessProviderType] = useState<SlotProviderType>("builtin");
  const [createProviderType, setCreateProviderType] = useState<SlotProviderType>("builtin");
  const [outputProviderType, setOutputProviderType] = useState<SlotProviderType>("builtin");
  const [inputAiProvider, setInputAiProvider] = useState<WorkflowAiProvider>("openrouter_api");
  const [processAiProvider, setProcessAiProvider] = useState<WorkflowAiProvider>("openrouter_api");
  const [createAiProvider, setCreateAiProvider] = useState<WorkflowAiProvider>("openrouter_api");
  const [outputAiProvider, setOutputAiProvider] = useState<WorkflowAiProvider>("openrouter_api");
  const [inputAiConnection, setInputAiConnection] = useState<WorkflowAiConnectionRef>("connection_1");
  const [processAiConnection, setProcessAiConnection] = useState<WorkflowAiConnectionRef>("connection_1");
  const [createAiConnection, setCreateAiConnection] = useState<WorkflowAiConnectionRef>("connection_1");
  const [outputAiConnection, setOutputAiConnection] = useState<WorkflowAiConnectionRef>("connection_1");
  const [inputAiModel, setInputAiModel] = useState("openai/gpt-5.4-mini");
  const [processAiModel, setProcessAiModel] = useState("openai/gpt-5.4-mini");
  const [createAiModel, setCreateAiModel] = useState("openai/gpt-5.4-mini");
  const [outputAiModel, setOutputAiModel] = useState("openai/gpt-5.4-mini");
  const [inputModuleId, setInputModuleId] = useState("");
  const [processModuleId, setProcessModuleId] = useState("");
  const [createModuleId, setCreateModuleId] = useState("");
  const [outputModuleId, setOutputModuleId] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramAdminChatId, setTelegramAdminChatId] = useState("");
  const [youtubeChannelLabel, setYoutubeChannelLabel] = useState("");
  const [youtubePrivacyStatus, setYoutubePrivacyStatus] = useState<"private" | "unlisted" | "public">("private");
  const [youtubeCategoryId, setYoutubeCategoryId] = useState("22");
  const [youtubeAudience, setYoutubeAudience] = useState<"not_made_for_kids" | "made_for_kids">("not_made_for_kids");
  const [youtubeOAuthClientId, setYoutubeOAuthClientId] = useState("");
  const [youtubeOAuthClientSecret, setYoutubeOAuthClientSecret] = useState("");
  const [youtubeOAuthRedirectPort, setYoutubeOAuthRedirectPort] = useState("45123");
  const [instagramAccountHandle, setInstagramAccountHandle] = useState("");
  const [instagramAccessToken, setInstagramAccessToken] = useState("");
  const [pexelsApiKey, setPexelsApiKey] = useState("");
  const [createTargetDurationSec, setCreateTargetDurationSec] = useState("60");
  const [createMinimumSceneCount, setCreateMinimumSceneCount] = useState("3");
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [instagramStatusMessage, setInstagramStatusMessage] = useState("");
  const [youtubeVideoFilePath, setYoutubeVideoFilePath] = useState("");
  const [youtubeThumbnailFilePath, setYoutubeThumbnailFilePath] = useState("");
  const [youtubePublishMode, setYoutubePublishMode] = useState<"now" | "scheduled">("now");
  const [youtubeScheduledPublishAt, setYoutubeScheduledPublishAt] = useState("");
  const [showTelegramBotToken, setShowTelegramBotToken] = useState(false);
  const [showYouTubeClientSecret, setShowYouTubeClientSecret] = useState(false);
  const [showInstagramAccessToken, setShowInstagramAccessToken] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [manualInputTitle, setManualInputTitle] = useState("");
  const [manualInputSummary, setManualInputSummary] = useState("");
  const [manualInputSourceLabel, setManualInputSourceLabel] = useState("");
  const [manualInputSourceUrl, setManualInputSourceUrl] = useState("");
  const [manualInputFitReason, setManualInputFitReason] = useState("");
  const [manualInputCandidates, setManualInputCandidates] = useState<ManualInputCandidateDraft[]>([
    createEmptyManualCandidate(1)
  ]);
  const [manualInputAttachments, setManualInputAttachments] = useState<
    Array<{ name: string; path: string }>
  >([]);
  const [manualInputError, setManualInputError] = useState("");
  const [manualProcessSelectedCandidateId, setManualProcessSelectedCandidateId] = useState("");
  const [manualProcessHeadline, setManualProcessHeadline] = useState("");
  const [manualProcessSummary, setManualProcessSummary] = useState("");
  const [manualProcessTitleOptions, setManualProcessTitleOptions] = useState("");
  const [manualProcessHook, setManualProcessHook] = useState("");
  const [manualProcessNarration, setManualProcessNarration] = useState("");
  const [manualProcessCallToAction, setManualProcessCallToAction] = useState("");
  const [manualProcessReviewNotes, setManualProcessReviewNotes] = useState("");
  const [manualProcessError, setManualProcessError] = useState("");
  const [manualCreateVideoPath, setManualCreateVideoPath] = useState("");
  const [manualCreateThumbnailPath, setManualCreateThumbnailPath] = useState("");
  const [manualCreateTitle, setManualCreateTitle] = useState("");
  const [manualCreateDescription, setManualCreateDescription] = useState("");
  const [manualCreateHashtags, setManualCreateHashtags] = useState("");
  const [manualCreateNotes, setManualCreateNotes] = useState("");
  const [manualCreateError, setManualCreateError] = useState("");
  const [createPipelineBusy, setCreatePipelineBusy] = useState(false);
  const [manualOutputTitle, setManualOutputTitle] = useState("");
  const [manualOutputDescription, setManualOutputDescription] = useState("");
  const [manualOutputHashtags, setManualOutputHashtags] = useState("");
  const [manualOutputPrivacyStatus, setManualOutputPrivacyStatus] =
    useState<"private" | "unlisted" | "public">("private");
  const [manualOutputCategoryId, setManualOutputCategoryId] = useState("22");
  const [manualOutputAudience, setManualOutputAudience] =
    useState<"not_made_for_kids" | "made_for_kids">("not_made_for_kids");
  const [manualOutputPublishMode, setManualOutputPublishMode] =
    useState<"draft" | "uploaded" | "error">("draft");
  const [manualOutputScheduledPublishAt, setManualOutputScheduledPublishAt] = useState("");
  const [manualOutputVideoId, setManualOutputVideoId] = useState("");
  const [manualOutputVideoUrl, setManualOutputVideoUrl] = useState("");
  const [manualOutputMessage, setManualOutputMessage] = useState("");
  const [manualOutputError, setManualOutputError] = useState("");
  const scriptProvider = settings?.scriptProvider ?? "openrouter_api";
  const openRouterApiKey = settings?.openRouterApiKey ?? "";
  const openRouterModel = settings?.openRouterModel ?? "openai/gpt-5.4-mini";
  const openAiApiKey = settings?.openAiApiKey ?? "";
  const openAiModel = settings?.openAiModel ?? "gpt-5.4-mini";
  const secondaryScriptProvider = settings?.secondaryScriptProvider ?? "openai_api";
  const secondaryOpenRouterApiKey = settings?.secondaryOpenRouterApiKey ?? "";
  const secondaryOpenRouterModel =
    settings?.secondaryOpenRouterModel ?? "anthropic/claude-sonnet-4.6";
  const secondaryOpenAiApiKey = settings?.secondaryOpenAiApiKey ?? "";
  const secondaryOpenAiModel = settings?.secondaryOpenAiModel ?? "gpt-5.4";

  const resolveAiConnection = (connection: WorkflowAiConnectionRef) => {
    if (connection === "connection_2") {
      return {
        label: isKorean ? "AI 연결 2" : "AI Connection 2",
        provider: secondaryScriptProvider as WorkflowAiProvider,
        openRouterApiKey: secondaryOpenRouterApiKey,
        openRouterModel: secondaryOpenRouterModel,
        openAiApiKey: secondaryOpenAiApiKey,
        openAiModel: secondaryOpenAiModel
      };
    }

    return {
      label: isKorean ? "AI 연결 1" : "AI Connection 1",
      provider: scriptProvider as WorkflowAiProvider,
      openRouterApiKey,
      openRouterModel,
      openAiApiKey,
      openAiModel
    };
  };

  const getResolvedConnectionModel = (connection: WorkflowAiConnectionRef) => {
    const selectedConnection = resolveAiConnection(connection);

    if (selectedConnection.provider === "openai_api") {
      return normalizeAiModelValue(
        "openai_api",
        selectedConnection.openAiModel?.trim(),
        getDefaultAiModel("openai_api")
      );
    }

    if (selectedConnection.provider === "claude_cli") {
      return getDefaultAiModel("claude_cli");
    }

    if (selectedConnection.provider === "mock") {
      return getDefaultAiModel("mock");
    }

    return normalizeAiModelValue(
      "openrouter_api",
      selectedConnection.openRouterModel?.trim(),
      getDefaultAiModel("openrouter_api")
    );
  };

  const normalizeAiModelValue = (
    provider: WorkflowAiProvider,
    requestedModel: string | undefined,
    fallbackModel: string
  ) => {
    const isKnown = getAiModelOptions(provider).some((option) => option.value === requestedModel);
    if (requestedModel && isKnown) {
      return requestedModel;
    }

    return fallbackModel;
  };

  const getAiConfigWarning = (
    provider: WorkflowAiProvider,
    enabled: boolean,
    connection: WorkflowAiConnectionRef
  ) => {
    if (!enabled) {
      return undefined;
    }

    const selectedConnection = resolveAiConnection(connection);

    if (provider === "openrouter_api" && !selectedConnection.openRouterApiKey.trim()) {
      return isKorean
        ? "선택한 OpenRouter 연결에 API 키가 없습니다. 설정 탭에서 먼저 저장해 주세요."
        : "The selected OpenRouter connection is missing an API key. Save it first in Settings.";
    }

    if (provider === "openai_api" && !selectedConnection.openAiApiKey.trim()) {
      return isKorean
        ? "선택한 OpenAI 연결에 API 키가 없습니다. 설정 탭에서 먼저 저장해 주세요."
        : "The selected OpenAI connection is missing an API key. Save it first in Settings.";
    }

    if (provider === "claude_cli" && !settings?.claudeExecutablePath?.trim()) {
      return isKorean
        ? "Claude CLI 연결을 쓰려면 설정 탭에서 Claude 실행 경로가 먼저 준비되어야 합니다."
        : "Claude CLI requires a detected or configured Claude executable in Settings.";
    }

    return undefined;
  };

  const getSlotAiState = (slotId: SlotId) => {
    if (slotId === "input") {
      const connection = inputAiConnection;
      const selectedConnection = resolveAiConnection(connection);
      return {
        enabled: inputAiSummaryEnabled,
        provider: selectedConnection.provider,
        connection,
        connectionLabel: selectedConnection.label,
        model: inputAiModel,
        toggleLabel: isKorean ? "자료 수집에 AI 사용" : "Use AI for input",
        description: isKorean
          ? "자동 모드에서 후보를 텔레그램에 보낼 때 AI로 요약 문장을 다듬습니다."
          : "When automatic mode is on, AI polishes shortlist summaries before they are sent to Telegram.",
        warning: getAiConfigWarning(selectedConnection.provider, inputAiSummaryEnabled, connection),
        onToggle: (nextValue: boolean) => {
          setInputAiSummaryEnabled(nextValue);
          void saveWorkflowConfig({ inputAiSummaryEnabled: nextValue });
        },
        onConnectionChange: (nextConnection: WorkflowAiConnectionRef) => {
          setInputAiConnection(nextConnection);
          const nextSelectedConnection = resolveAiConnection(nextConnection);
          const nextModel = getResolvedConnectionModel(nextConnection);
          setInputAiProvider(nextSelectedConnection.provider);
          setInputAiModel(nextModel);
          void saveWorkflowConfig({
            inputAiConnection: nextConnection,
            inputAiProvider: nextSelectedConnection.provider,
            inputAiModel: nextModel
          });
        },
        onModelChange: (model: string) => {
          setInputAiModel(model);
          void saveWorkflowConfig({ inputAiModel: model || undefined });
        }
      };
    }

    if (slotId === "process") {
      const connection = processAiConnection;
      const selectedConnection = resolveAiConnection(connection);
      return {
        enabled: processAiGenerationEnabled,
        provider: selectedConnection.provider,
        connection,
        connectionLabel: selectedConnection.label,
        model: processAiModel,
        toggleLabel: isKorean ? "자료 가공에 AI 사용" : "Use AI for process",
        description: isKorean
          ? "자동 모드에서 요약, 제목 후보, 훅, 내레이션 초안을 AI로 생성합니다."
          : "When automatic mode is on, AI drafts the summary, title options, hook, and narration.",
        warning: getAiConfigWarning(
          selectedConnection.provider,
          processAiGenerationEnabled,
          connection
        ),
        onToggle: (nextValue: boolean) => {
          setProcessAiGenerationEnabled(nextValue);
          void saveWorkflowConfig({ processAiGenerationEnabled: nextValue });
        },
        onConnectionChange: (nextConnection: WorkflowAiConnectionRef) => {
          setProcessAiConnection(nextConnection);
          const nextSelectedConnection = resolveAiConnection(nextConnection);
          const nextModel = getResolvedConnectionModel(nextConnection);
          setProcessAiProvider(nextSelectedConnection.provider);
          setProcessAiModel(nextModel);
          void saveWorkflowConfig({
            processAiConnection: nextConnection,
            processAiProvider: nextSelectedConnection.provider,
            processAiModel: nextModel
          });
        },
        onModelChange: (model: string) => {
          setProcessAiModel(model);
          void saveWorkflowConfig({ processAiModel: model || undefined });
        }
      };
    }

    if (slotId === "create") {
      const connection = createAiConnection;
      const selectedConnection = resolveAiConnection(connection);
      return {
        enabled: createAiGenerationEnabled,
        provider: selectedConnection.provider,
        connection,
        connectionLabel: selectedConnection.label,
        model: createAiModel,
        toggleLabel: isKorean ? "소재 생성에 AI 사용" : "Use AI for create",
        description: isKorean
          ? "앞으로 TTS·이미지·영상 합성형 모듈이 연결되면 이 슬롯의 AI 실행 여부와 모델을 여기서 고르게 됩니다."
          : "When TTS, image, or video generation modules arrive, this slot will use this AI toggle and model choice.",
        warning: getAiConfigWarning(
          selectedConnection.provider,
          createAiGenerationEnabled,
          connection
        ),
        onToggle: (nextValue: boolean) => {
          setCreateAiGenerationEnabled(nextValue);
          void saveWorkflowConfig({ createAiGenerationEnabled: nextValue });
        },
        onConnectionChange: (nextConnection: WorkflowAiConnectionRef) => {
          setCreateAiConnection(nextConnection);
          const nextSelectedConnection = resolveAiConnection(nextConnection);
          const nextModel = getResolvedConnectionModel(nextConnection);
          setCreateAiProvider(nextSelectedConnection.provider);
          setCreateAiModel(nextModel);
          void saveWorkflowConfig({
            createAiConnection: nextConnection,
            createAiProvider: nextSelectedConnection.provider,
            createAiModel: nextModel
          });
        },
        onModelChange: (model: string) => {
          setCreateAiModel(model);
          void saveWorkflowConfig({ createAiModel: model || undefined });
        }
      };
    }

    const connection = outputAiConnection;
    const selectedConnection = resolveAiConnection(connection);
    return {
      enabled: outputAiGenerationEnabled,
      provider: selectedConnection.provider,
      connection,
      connectionLabel: selectedConnection.label,
      model: outputAiModel,
      toggleLabel: isKorean ? "배포에 AI 사용" : "Use AI for output",
      description: isKorean
        ? "설명 생성, 제목 보정, 플랫폼별 최적화가 붙으면 이 슬롯의 AI 실행 여부와 모델을 여기서 선택합니다."
        : "If description generation or platform optimization is added later, this slot will use this AI toggle and model choice.",
      warning: getAiConfigWarning(
        selectedConnection.provider,
        outputAiGenerationEnabled,
        connection
      ),
      onToggle: (nextValue: boolean) => {
        setOutputAiGenerationEnabled(nextValue);
        void saveWorkflowConfig({ outputAiGenerationEnabled: nextValue });
      },
      onConnectionChange: (nextConnection: WorkflowAiConnectionRef) => {
        setOutputAiConnection(nextConnection);
        const nextSelectedConnection = resolveAiConnection(nextConnection);
        const nextModel = getResolvedConnectionModel(nextConnection);
        setOutputAiProvider(nextSelectedConnection.provider);
        setOutputAiModel(nextModel);
        void saveWorkflowConfig({
          outputAiConnection: nextConnection,
          outputAiProvider: nextSelectedConnection.provider,
          outputAiModel: nextModel
        });
      },
      onModelChange: (model: string) => {
        setOutputAiModel(model);
        void saveWorkflowConfig({ outputAiModel: model || undefined });
      }
    };
  };

  const getSlotUiSchema = (
    slotId: SlotId,
    providerType: SlotProviderType,
    moduleId?: string
  ): MCPSlotUiSchema | undefined => {
    if (providerType === "module" && moduleId) {
      return getMcpRuntimeContract(moduleId)?.slotUi?.[slotId];
    }

    return getBuiltinSlotUiSchema(slotId);
  };

  const getSlotUiField = (
    slotId: SlotId,
    providerType: SlotProviderType,
    moduleId: string | undefined,
    fieldId: string
  ) => getSlotUiSchema(slotId, providerType, moduleId)?.fields.find((field) => field.id === fieldId);

  const getSlotUiAction = (
    slotId: SlotId,
    providerType: SlotProviderType,
    moduleId: string | undefined,
    actionId: string
  ) => getSlotUiSchema(slotId, providerType, moduleId)?.actions.find((action) => action.id === actionId);

  const renderSlotField = (field: MCPSlotFieldSchema) => {
    const fieldClassName =
      field.width === "full" ? "field field-span-2" : "field";

    if (field.id === "youtubeOAuthClientId") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <input
            className="text-input"
            value={youtubeOAuthClientId}
            onChange={(event) => setYoutubeOAuthClientId(event.target.value)}
            placeholder={field.placeholder}
          />
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    if (field.id === "youtubeOAuthClientSecret") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <div className="secret-field">
            <input
              className="text-input"
              type={showYouTubeClientSecret ? "text" : "password"}
              value={youtubeOAuthClientSecret}
              onChange={(event) => setYoutubeOAuthClientSecret(event.target.value)}
              placeholder={field.placeholder}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowYouTubeClientSecret((value) => !value)}
            >
              {showYouTubeClientSecret
                ? isKorean
                  ? "숨기기"
                  : "Hide"
                : isKorean
                  ? "보기"
                  : "Show"}
            </button>
          </div>
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    if (field.id === "youtubeOAuthRedirectPort") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <input
            className="text-input"
            value={youtubeOAuthRedirectPort}
            onChange={(event) => setYoutubeOAuthRedirectPort(event.target.value)}
            placeholder={field.placeholder}
          />
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    if (field.id === "instagramAccountHandle") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <input
            className="text-input"
            value={instagramAccountHandle}
            onChange={(event) => setInstagramAccountHandle(event.target.value)}
            placeholder={field.placeholder}
          />
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    if (field.id === "pexelsApiKey") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <input
            className="text-input"
            type="password"
            value={pexelsApiKey}
            onChange={(event) => setPexelsApiKey(event.target.value)}
            placeholder={field.placeholder}
          />
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    if (field.id === "targetDurationSec") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <input
            className="text-input"
            type="number"
            min={1}
            step={1}
            value={createTargetDurationSec}
            onChange={(event) => setCreateTargetDurationSec(event.target.value)}
            placeholder={field.placeholder}
          />
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    if (field.id === "minimumSceneCount") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <input
            className="text-input"
            type="number"
            min={1}
            step={1}
            value={createMinimumSceneCount}
            onChange={(event) => setCreateMinimumSceneCount(event.target.value)}
            placeholder={field.placeholder}
          />
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    if (field.id === "instagramAccessToken") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <div className="secret-field">
            <input
              className="text-input"
              type={showInstagramAccessToken ? "text" : "password"}
              value={instagramAccessToken}
              onChange={(event) => setInstagramAccessToken(event.target.value)}
              placeholder={field.placeholder}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowInstagramAccessToken((value) => !value)}
            >
              {showInstagramAccessToken
                ? isKorean
                  ? "숨기기"
                  : "Hide"
                : isKorean
                  ? "보기"
                  : "Show"}
            </button>
          </div>
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    return null;
  };

  const renderTelegramField = (field: MCPSlotFieldSchema) => {
    const fieldClassName =
      field.width === "full" ? "field field-span-2" : "field";

    if (field.id === "telegramBotToken") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <div className="secret-input">
            <input
              className="text-input"
              type={showTelegramBotToken ? "text" : "password"}
              value={telegramBotToken}
              onChange={(event) => setTelegramBotToken(event.target.value)}
              placeholder={field.placeholder ?? "123456:ABC..."}
            />
            <button
              type="button"
              className="secret-toggle"
              onClick={() => setShowTelegramBotToken((value) => !value)}
            >
              {showTelegramBotToken
                ? isKorean
                  ? "숨기기"
                  : "Hide"
                : isKorean
                  ? "보기"
                  : "Show"}
            </button>
          </div>
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    if (field.id === "telegramAdminChatId") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <input
            className="text-input"
            value={telegramAdminChatId}
            onChange={(event) => setTelegramAdminChatId(event.target.value)}
            placeholder={field.placeholder ?? "123456789"}
          />
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    if (field.id === "trendWindow") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <select
            className="text-input"
            value={trendWindow}
            onChange={(event) => setTrendWindow(event.target.value as "24h" | "3d")}
          >
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    return null;
  };

  const renderInputCandidateField = (
    candidate: ManualInputCandidateDraft,
    field: MCPSlotFieldSchema
  ) => {
    const fieldClassName =
      field.width === "full" ? "field field-span-2" : "field";

    const bindCandidateChange = (value: string) => {
      const fieldMap: Record<string, keyof ManualInputCandidateDraft> = {
        candidateTitle: "title",
        candidateSourceLabel: "sourceLabel",
        candidateSummary: "summary",
        candidateSourceUrl: "sourceUrl",
        candidateFitReason: "fitReason"
      };
      const mappedField = fieldMap[field.id];
      if (!mappedField) {
        return;
      }
      handleChangeManualCandidate(candidate.id ?? "", mappedField, value);
    };

    const currentValue =
      field.id === "candidateTitle"
        ? candidate.title
        : field.id === "candidateSourceLabel"
          ? candidate.sourceLabel ?? ""
          : field.id === "candidateSummary"
            ? candidate.summary
            : field.id === "candidateSourceUrl"
              ? candidate.sourceUrl ?? ""
              : field.id === "candidateFitReason"
                ? candidate.fitReason ?? ""
                : "";

    if (field.type === "textarea") {
      return (
        <label key={`${candidate.id}-${field.id}`} className={fieldClassName}>
          <span>{field.label}</span>
          <textarea
            className="text-input textarea-input"
            rows={field.id === "candidateSummary" ? 4 : 2}
            value={currentValue}
            onChange={(event) => bindCandidateChange(event.target.value)}
            placeholder={field.placeholder}
          />
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    return (
      <label key={`${candidate.id}-${field.id}`} className={fieldClassName}>
        <span>{field.label}</span>
        <input
          className="text-input"
          value={currentValue}
          onChange={(event) => bindCandidateChange(event.target.value)}
          placeholder={field.placeholder}
        />
        {field.helpText && <span className="subtle">{field.helpText}</span>}
      </label>
    );
  };

  const renderProcessField = (field: MCPSlotFieldSchema) => {
    const fieldClassName =
      field.width === "full" ? "field field-span-2" : "field";

    if (field.id === "selectedCandidateId") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <select
            className="text-input"
            value={manualProcessSelectedCandidateId}
            onChange={(event) => {
              const nextId = event.target.value;
              setManualProcessSelectedCandidateId(nextId);
              const nextCandidate = manualInputCandidates.find((candidate) => candidate.id === nextId);
              if (nextCandidate) {
                setManualProcessHeadline(nextCandidate.title ?? "");
                setManualProcessSummary(nextCandidate.summary ?? "");
              }
            }}
          >
            {manualInputCandidates.map((candidate, index) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title || (isKorean ? `후보 ${index + 1}` : `Candidate ${index + 1}`)}
              </option>
            ))}
          </select>
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    const processFieldMap: Record<
      string,
      {
        value: string;
        setValue: (value: string) => void;
        rows?: number;
      }
    > = {
      headline: {
        value: manualProcessHeadline,
        setValue: setManualProcessHeadline
      },
      processedSummary: {
        value: manualProcessSummary,
        setValue: setManualProcessSummary,
        rows: 3
      },
      titleOptions: {
        value: manualProcessTitleOptions,
        setValue: setManualProcessTitleOptions,
        rows: 3
      },
      hook: {
        value: manualProcessHook,
        setValue: setManualProcessHook,
        rows: 2
      },
      callToAction: {
        value: manualProcessCallToAction,
        setValue: setManualProcessCallToAction,
        rows: 2
      },
      narration: {
        value: manualProcessNarration,
        setValue: setManualProcessNarration,
        rows: 5
      },
      reviewNotes: {
        value: manualProcessReviewNotes,
        setValue: setManualProcessReviewNotes,
        rows: 2
      }
    };

    const binding = processFieldMap[field.id];
    if (!binding) {
      return null;
    }

    if (field.type === "textarea") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <textarea
            className="text-input textarea-input"
            rows={binding.rows ?? 3}
            value={binding.value}
            onChange={(event) => binding.setValue(event.target.value)}
            placeholder={field.placeholder}
          />
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    return (
      <label key={field.id} className={fieldClassName}>
        <span>{field.label}</span>
        <input
          className="text-input"
          value={binding.value}
          onChange={(event) => binding.setValue(event.target.value)}
          placeholder={field.placeholder}
        />
        {field.helpText && <span className="subtle">{field.helpText}</span>}
      </label>
    );
  };

  const renderCreateField = (field: MCPSlotFieldSchema) => {
    const fieldClassName =
      field.width === "full" ? "field field-span-2" : "field";

    const createFieldMap: Record<
      string,
      {
        value: string;
        setValue: (value: string) => void;
        rows?: number;
      }
    > = {
      pexelsApiKey: {
        value: pexelsApiKey,
        setValue: setPexelsApiKey
      },
      targetDurationSec: {
        value: createTargetDurationSec,
        setValue: setCreateTargetDurationSec
      },
      minimumSceneCount: {
        value: createMinimumSceneCount,
        setValue: setCreateMinimumSceneCount
      },
      videoFilePath: {
        value: manualCreateVideoPath,
        setValue: setManualCreateVideoPath
      },
      thumbnailFilePath: {
        value: manualCreateThumbnailPath,
        setValue: setManualCreateThumbnailPath
      },
      publishTitle: {
        value: manualCreateTitle,
        setValue: setManualCreateTitle
      },
      publishDescription: {
        value: manualCreateDescription,
        setValue: setManualCreateDescription,
        rows: 4
      },
      hashtags: {
        value: manualCreateHashtags,
        setValue: setManualCreateHashtags
      },
      productionNotes: {
        value: manualCreateNotes,
        setValue: setManualCreateNotes,
        rows: 2
      }
    };

    const binding = createFieldMap[field.id];
    if (!binding) {
      return null;
    }

    if (field.type === "textarea") {
      return (
        <label key={field.id} className={fieldClassName}>
          <span>{field.label}</span>
          <textarea
            className="text-input textarea-input"
            rows={binding.rows ?? 3}
            value={binding.value}
            onChange={(event) => binding.setValue(event.target.value)}
            placeholder={field.placeholder}
          />
          {field.helpText && <span className="subtle">{field.helpText}</span>}
        </label>
      );
    }

    return (
      <label key={field.id} className={fieldClassName}>
        <span>{field.label}</span>
        <input
          className="text-input"
          value={binding.value}
          onChange={(event) => binding.setValue(event.target.value)}
          placeholder={field.placeholder}
        />
        {field.helpText && <span className="subtle">{field.helpText}</span>}
      </label>
    );
  };

  const runSlotAction = async (actionId: string) => {
    if (actionId === "save_telegram_config") {
      await handleSaveTelegramConfig();
      return;
    }
    if (actionId === "sync_telegram") {
      await refreshTelegramStatus();
      return;
    }
    if (actionId === "save_checkpoint_1") {
      await handleSaveManualInput();
      return;
    }
    if (actionId === "save_checkpoint_2") {
      await handleSaveManualProcess();
      return;
    }
    if (actionId === "save_checkpoint_3") {
      await handleSaveManualCreate();
      return;
    }
    if (actionId === "run_create_pipeline" || actionId === "generate_scene_plan") {
      await handleRunCreatePipeline();
      return;
    }
    if (actionId === "save_youtube_config") {
      await handleSaveWorkflowConfig();
      return;
    }
    if (actionId === "save_instagram_config") {
      await handleSaveWorkflowConfig();
      return;
    }
    if (actionId === "refresh_youtube_status") {
      await refreshYouTubeStatus();
      return;
    }
    if (actionId === "refresh_instagram_status") {
      setSavedMessage(
        isKorean
          ? "인스타그램 mock 상태를 새로고침했습니다."
          : "Instagram mock status refreshed."
      );
      setInstagramStatusMessage(
        instagramConnected
          ? isKorean
            ? "인스타그램 mock 연결이 활성화되어 있습니다."
            : "Instagram mock connection is active."
          : isKorean
            ? "인스타그램 mock 연결이 아직 없습니다."
            : "Instagram mock connection is not active yet."
      );
      return;
    }
    if (actionId === "connect_youtube") {
      await connectYouTube();
      return;
    }
    if (actionId === "connect_instagram") {
      setInstagramConnected(true);
      setInstagramStatusMessage(
        isKorean
          ? "인스타그램 mock 연결이 활성화되었습니다."
          : "Instagram mock connection is active."
      );
      setSavedMessage(
        isKorean
          ? "인스타그램 mock 연결을 활성화했습니다."
          : "Instagram mock connection enabled."
      );
      return;
    }
    if (actionId === "disconnect_youtube") {
      await disconnectYouTube();
      return;
    }
    if (actionId === "disconnect_instagram") {
      setInstagramConnected(false);
      setInstagramStatusMessage(
        isKorean
          ? "인스타그램 mock 연결을 해제했습니다."
          : "Instagram mock connection disconnected."
      );
      setSavedMessage(
        isKorean
          ? "인스타그램 mock 연결을 해제했습니다."
          : "Instagram mock connection disconnected."
      );
      return;
    }
    if (actionId === "upload_last_package") {
      await handleUploadLastPackage();
      return;
    }
    if (actionId === "upload_instagram_mock") {
      setSavedMessage(
        isKorean
          ? "인스타그램 mock 업로드를 실행했습니다."
          : "Instagram mock upload triggered."
      );
      setInstagramStatusMessage(
        isKorean
          ? "최근 패키지를 인스타그램 mock 업로드 대상으로 표시했습니다."
          : "The latest package is marked for Instagram mock upload."
      );
      return;
    }
  };

  const isSlotActionDisabled = (actionId: string) => {
    if (actionId === "connect_youtube") {
      return !youtubeOAuthClientId.trim();
    }
    if (actionId === "disconnect_youtube") {
      return !youTubeAuthStatus?.connected;
    }
    if (actionId === "upload_last_package") {
      return (
        !youTubeAuthStatus?.connected ||
        !activePackagePath ||
        !youtubeVideoFilePath.trim()
      );
    }
    if (actionId === "connect_instagram") {
      return !instagramAccountHandle.trim() || !instagramAccessToken.trim();
    }
    if (actionId === "disconnect_instagram") {
      return !instagramConnected;
    }
    if (actionId === "upload_instagram_mock") {
      return !instagramConnected || !activePackagePath;
    }
    if (actionId === "run_create_pipeline" || actionId === "generate_scene_plan") {
      return (
        createPipelineBusy ||
        !resolvedWorkflowJobId ||
        !workflowJobSnapshot?.checkpoints[2] ||
        Boolean(createPipelineWarning)
      );
    }
    return false;
  };

  useEffect(() => {
    setTrendWindow(workflowConfig?.trendWindow ?? "24h");
    setInputAiSummaryEnabled(workflowConfig?.inputAiSummaryEnabled !== false);
    setProcessAiGenerationEnabled(workflowConfig?.processAiGenerationEnabled !== false);
    setCreateAiGenerationEnabled(workflowConfig?.createAiGenerationEnabled === true);
    setOutputAiGenerationEnabled(workflowConfig?.outputAiGenerationEnabled === true);
    setInputProviderType(workflowConfig?.inputProviderType ?? "builtin");
    setProcessProviderType(workflowConfig?.processProviderType ?? "builtin");
    setCreateProviderType(workflowConfig?.createProviderType ?? "builtin");
    setOutputProviderType(workflowConfig?.outputProviderType ?? "builtin");
    setInputAiConnection(workflowConfig?.inputAiConnection ?? "connection_1");
    setProcessAiConnection(workflowConfig?.processAiConnection ?? "connection_1");
    setCreateAiConnection(workflowConfig?.createAiConnection ?? "connection_1");
    setOutputAiConnection(workflowConfig?.outputAiConnection ?? "connection_1");
    setInputAiProvider(workflowConfig?.inputAiProvider ?? (settings?.scriptProvider ?? "openrouter_api"));
    setProcessAiProvider(workflowConfig?.processAiProvider ?? (settings?.scriptProvider ?? "openrouter_api"));
    setCreateAiProvider(workflowConfig?.createAiProvider ?? (settings?.scriptProvider ?? "openrouter_api"));
    setOutputAiProvider(workflowConfig?.outputAiProvider ?? (settings?.scriptProvider ?? "openrouter_api"));
    const inputConnection = workflowConfig?.inputAiConnection ?? "connection_1";
    const processConnection = workflowConfig?.processAiConnection ?? "connection_1";
    const createConnection = workflowConfig?.createAiConnection ?? "connection_1";
    const outputConnection = workflowConfig?.outputAiConnection ?? "connection_1";
    const inputDefaults = resolveAiConnection(inputConnection);
    const processDefaults = resolveAiConnection(processConnection);
    const createDefaults = resolveAiConnection(createConnection);
    const outputDefaults = resolveAiConnection(outputConnection);
    setInputAiModel(
      normalizeAiModelValue(
        inputDefaults.provider as WorkflowAiProvider,
        workflowConfig?.inputAiModel,
        getResolvedConnectionModel(inputConnection) ?? "openai/gpt-5.4-mini"
      )
    );
    setProcessAiModel(
      normalizeAiModelValue(
        processDefaults.provider as WorkflowAiProvider,
        workflowConfig?.processAiModel,
        getResolvedConnectionModel(processConnection) ?? "openai/gpt-5.4-mini"
      )
    );
    setCreateAiModel(
      normalizeAiModelValue(
        createDefaults.provider as WorkflowAiProvider,
        workflowConfig?.createAiModel,
        getResolvedConnectionModel(createConnection) ?? "openai/gpt-5.4-mini"
      )
    );
    setOutputAiModel(
      normalizeAiModelValue(
        outputDefaults.provider as WorkflowAiProvider,
        workflowConfig?.outputAiModel,
        getResolvedConnectionModel(outputConnection) ?? "openai/gpt-5.4-mini"
      )
    );
    setInputModuleId(workflowConfig?.inputModuleId ?? "");
    setProcessModuleId(workflowConfig?.processModuleId ?? "");
    setCreateModuleId(workflowConfig?.createModuleId ?? "");
    setOutputModuleId(workflowConfig?.outputModuleId ?? "");
    setTelegramBotToken(workflowConfig?.telegramBotToken ?? "");
    setTelegramAdminChatId(workflowConfig?.telegramAdminChatId ?? "");
    setInstagramAccountHandle(workflowConfig?.instagramAccountHandle ?? "");
    setInstagramAccessToken(workflowConfig?.instagramAccessToken ?? "");
    setPexelsApiKey(workflowConfig?.pexelsApiKey ?? "");
    setCreateTargetDurationSec(String(workflowConfig?.createTargetDurationSec ?? 60));
    setCreateMinimumSceneCount(String(workflowConfig?.createMinimumSceneCount ?? 3));
    setYoutubeChannelLabel(workflowConfig?.youtubeChannelLabel ?? "");
    setYoutubePrivacyStatus(workflowConfig?.youtubePrivacyStatus ?? "private");
    setYoutubeCategoryId(workflowConfig?.youtubeCategoryId ?? "22");
    setYoutubeAudience(workflowConfig?.youtubeAudience ?? "not_made_for_kids");
    setYoutubeOAuthClientId(workflowConfig?.youtubeOAuthClientId ?? "");
    setYoutubeOAuthClientSecret(workflowConfig?.youtubeOAuthClientSecret ?? "");
    setYoutubeOAuthRedirectPort(workflowConfig?.youtubeOAuthRedirectPort ?? "45123");
  }, [settings, workflowConfig]);

  useEffect(() => {
    setYoutubeVideoFilePath(youTubeUploadRequest?.videoFilePath ?? "");
    setYoutubeThumbnailFilePath(youTubeUploadRequest?.thumbnailFilePath ?? "");
    setYoutubePublishMode(
      youTubeUploadRequest?.scheduledPublishAt ? "scheduled" : "now"
    );
    setYoutubeScheduledPublishAt(
      isoToLocalDateTimeInput(youTubeUploadRequest?.scheduledPublishAt)
    );
  }, [youTubeUploadRequest]);

  const currentWorkflowJobId = getCurrentWorkflowJobId(
    telegramStatus?.activeJob?.id,
    telegramStatus?.lastPackagePath
  );
  const resolvedWorkflowJobId = currentWorkflowJobId ?? workflowJobSnapshot?.job?.jobId;
  const activePackagePath =
    telegramStatus?.lastPackagePath ?? workflowJobSnapshot?.resolvedPackagePath ?? undefined;
  const createPipelineWarning =
    createModuleId === "youtube-material-generator-mcp"
      ? [
          !pexelsApiKey.trim()
            ? isKorean
              ? "Pexels API Key가 없어 장면별 영상 검색을 할 수 없습니다. 03 슬롯의 모듈 설정에 입력해 주세요."
              : "Pexels API Key is missing. Add it in the Slot 03 module settings."
            : null,
          !hasVoiceoverCredentials(settings)
            ? isKorean
              ? "Azure Speech Key/Region 또는 OpenAI TTS 키가 없어 한국어 더빙을 만들 수 없습니다. 설정 탭의 Azure Speech 더빙 또는 AI 연결에서 입력해 주세요."
              : "No Azure Speech or OpenAI TTS credentials are configured. Add them in Settings."
            : null
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  useEffect(() => {
    if (!currentWorkflowJobId) {
      return;
    }

    void refreshWorkflowJobSnapshot(currentWorkflowJobId);
  }, [currentWorkflowJobId, refreshWorkflowJobSnapshot]);

  useEffect(() => {
    const inputCheckpoint = workflowJobSnapshot?.checkpoints[1];
    const inputCandidates =
      ((inputCheckpoint?.payload as { candidates?: ManualInputCandidateDraft[] } | undefined)
        ?.candidates ?? []) as ManualInputCandidateDraft[];

    if (inputCandidates.length > 0) {
      setManualInputTitle(workflowJobSnapshot?.job?.title ?? inputCandidates[0]?.title ?? "");
      setManualInputCandidates(
        inputCandidates.map((candidate, index) => ({
          id: candidate.id || `manual-candidate-${index + 1}`,
          title: candidate.title ?? "",
          summary: candidate.summary ?? "",
          operatorSummary: candidate.operatorSummary ?? candidate.summary ?? "",
          sourceLabel: candidate.sourceLabel ?? "",
          sourceUrl: candidate.sourceUrl ?? "",
          fitReason: candidate.fitReason ?? "",
          sourceKind: candidate.sourceKind ?? "mock",
          sourceRegion: candidate.sourceRegion ?? "domestic",
          contentAngle: candidate.contentAngle ?? "manual_input"
        }))
      );
    }

    const processCheckpoint = workflowJobSnapshot?.checkpoints[2];
    if (processCheckpoint) {
      const payload = processCheckpoint.payload as {
        selectedCandidateId?: string;
        summary?: { headline?: string; body?: string };
        scriptDraft?: {
          titleOptions?: string[];
          hook?: string;
          narration?: string;
          callToAction?: string;
        };
        review?: { notes?: string };
      };
      setManualProcessSelectedCandidateId(payload.selectedCandidateId ?? inputCandidates[0]?.id ?? "");
      setManualProcessHeadline(payload.summary?.headline ?? inputCandidates[0]?.title ?? "");
      setManualProcessSummary(payload.summary?.body ?? inputCandidates[0]?.summary ?? "");
      setManualProcessTitleOptions((payload.scriptDraft?.titleOptions ?? []).join("\n"));
      setManualProcessHook(payload.scriptDraft?.hook ?? "");
      setManualProcessNarration(payload.scriptDraft?.narration ?? "");
      setManualProcessCallToAction(payload.scriptDraft?.callToAction ?? "");
      setManualProcessReviewNotes(payload.review?.notes ?? "");
      return;
    }

    if (inputCandidates.length > 0) {
      setManualProcessSelectedCandidateId((current) => current || inputCandidates[0]?.id || "");
      setManualProcessHeadline((current) => current || inputCandidates[0]?.title || "");
      setManualProcessSummary((current) => current || inputCandidates[0]?.summary || "");
    }
  }, [workflowJobSnapshot]);

  useEffect(() => {
    const createCheckpoint = workflowJobSnapshot?.checkpoints[3];
    if (createCheckpoint?.slot === "create") {
      const payload = createCheckpoint.payload as {
        assets?: {
          video?: Array<{ path?: string }>;
          thumbnail?: { path?: string };
        };
        metadata?: {
          title?: string;
          description?: string;
          hashtags?: string[];
        };
        notes?: string;
      };
      setManualCreateVideoPath(payload.assets?.video?.[0]?.path ?? "");
      setManualCreateThumbnailPath(payload.assets?.thumbnail?.path ?? "");
      setManualCreateTitle(payload.metadata?.title ?? "");
      setManualCreateDescription(payload.metadata?.description ?? "");
      setManualCreateHashtags((payload.metadata?.hashtags ?? []).join(", "));
      setManualCreateNotes(payload.notes ?? "");
      return;
    }

    if (youTubeUploadRequest) {
      setManualCreateVideoPath((current) => current || youTubeUploadRequest.videoFilePath || "");
      setManualCreateThumbnailPath(
        (current) => current || youTubeUploadRequest.thumbnailFilePath || ""
      );
      setManualCreateTitle((current) => current || youTubeUploadRequest.metadata.title || "");
      setManualCreateDescription(
        (current) => current || youTubeUploadRequest.metadata.description || ""
      );
      setManualCreateHashtags(
        (current) => current || (youTubeUploadRequest.metadata.tags ?? []).join(", ")
      );
    }
  }, [workflowJobSnapshot, youTubeUploadRequest]);

  useEffect(() => {
    const outputCheckpoint = workflowJobSnapshot?.checkpoints[4];
    if (outputCheckpoint?.slot === "output") {
      const payload = outputCheckpoint.payload as {
        request?: {
          scheduledPublishAt?: string;
          metadata?: {
            title?: string;
            description?: string;
            tags?: string[];
            categoryId?: string;
            privacyStatus?: "private" | "unlisted" | "public";
            selfDeclaredMadeForKids?: boolean;
          };
        };
        result?: {
          status?: "pending" | "uploaded" | "error";
          videoId?: string | null;
          videoUrl?: string | null;
          message?: string;
        };
      };
      setManualOutputTitle(payload.request?.metadata?.title ?? "");
      setManualOutputDescription(payload.request?.metadata?.description ?? "");
      setManualOutputHashtags((payload.request?.metadata?.tags ?? []).join(", "));
      setManualOutputCategoryId(payload.request?.metadata?.categoryId ?? "22");
      setManualOutputPrivacyStatus(payload.request?.metadata?.privacyStatus ?? "private");
      setManualOutputAudience(
        payload.request?.metadata?.selfDeclaredMadeForKids ? "made_for_kids" : "not_made_for_kids"
      );
      setManualOutputScheduledPublishAt(
        isoToLocalDateTimeInput(payload.request?.scheduledPublishAt)
      );
      setManualOutputPublishMode(
        payload.result?.status === "uploaded"
          ? "uploaded"
          : payload.result?.status === "error"
            ? "error"
            : "draft"
      );
      setManualOutputVideoId(payload.result?.videoId ?? "");
      setManualOutputVideoUrl(payload.result?.videoUrl ?? "");
      setManualOutputMessage(payload.result?.message ?? "");
      return;
    }

    if (youTubeUploadRequest) {
      setManualOutputTitle((current) => current || youTubeUploadRequest.metadata.title || "");
      setManualOutputDescription(
        (current) => current || youTubeUploadRequest.metadata.description || ""
      );
      setManualOutputHashtags(
        (current) => current || (youTubeUploadRequest.metadata.tags ?? []).join(", ")
      );
      setManualOutputCategoryId(
        (current) => current || youTubeUploadRequest.metadata.categoryId || "22"
      );
      setManualOutputPrivacyStatus(
        youTubeUploadRequest.metadata.privacyStatus ?? "private"
      );
      setManualOutputAudience(
        youTubeUploadRequest.metadata.selfDeclaredMadeForKids
          ? "made_for_kids"
          : "not_made_for_kids"
      );
      setManualOutputScheduledPublishAt(
        (current) => current || isoToLocalDateTimeInput(youTubeUploadRequest.scheduledPublishAt)
      );
    }

    if (lastYouTubeUploadResult) {
      setManualOutputPublishMode(lastYouTubeUploadResult.ok ? "uploaded" : "error");
      setManualOutputVideoId((current) => current || lastYouTubeUploadResult.videoId || "");
      setManualOutputVideoUrl((current) => current || lastYouTubeUploadResult.videoUrl || "");
      setManualOutputMessage((current) => current || lastYouTubeUploadResult.message || "");
    }
  }, [workflowJobSnapshot, youTubeUploadRequest, lastYouTubeUploadResult]);

  const handleSaveWorkflowConfig = async () => {
    setSavedMessage("");
    const parsedCreateTargetDurationSec = Number.parseInt(createTargetDurationSec, 10);
    const parsedCreateMinimumSceneCount = Number.parseInt(createMinimumSceneCount, 10);
    await saveWorkflowConfig({
      inputAiSummaryEnabled,
      processAiGenerationEnabled,
      createAiGenerationEnabled,
      outputAiGenerationEnabled,
      inputAiConnection,
      inputAiProvider,
      inputAiModel: inputAiModel.trim() || undefined,
      processAiConnection,
      processAiProvider,
      processAiModel: processAiModel.trim() || undefined,
      createAiConnection,
      createAiProvider,
      createAiModel: createAiModel.trim() || undefined,
      outputAiConnection,
      outputAiProvider,
      outputAiModel: outputAiModel.trim() || undefined,
      inputProviderType,
      processProviderType,
      createProviderType,
      outputProviderType,
      inputModuleId: inputModuleId.trim() || undefined,
      processModuleId: processModuleId.trim() || undefined,
      createModuleId: createModuleId.trim() || undefined,
      outputModuleId: outputModuleId.trim() || undefined,
      trendWindow,
      telegramBotToken: telegramBotToken.trim() || undefined,
      telegramAdminChatId: telegramAdminChatId.trim() || undefined,
      instagramAccountHandle: instagramAccountHandle.trim() || undefined,
      instagramAccessToken: instagramAccessToken.trim() || undefined,
      pexelsApiKey: pexelsApiKey.trim() || undefined,
      createTargetDurationSec:
        Number.isFinite(parsedCreateTargetDurationSec) && parsedCreateTargetDurationSec > 0
          ? parsedCreateTargetDurationSec
          : undefined,
      createMinimumSceneCount:
        Number.isFinite(parsedCreateMinimumSceneCount) && parsedCreateMinimumSceneCount > 0
          ? parsedCreateMinimumSceneCount
          : undefined,
      youtubeChannelLabel: youtubeChannelLabel.trim() || undefined,
      youtubePrivacyStatus,
      youtubeCategoryId,
      youtubeAudience,
      youtubeOAuthClientId: youtubeOAuthClientId.trim() || undefined,
      youtubeOAuthClientSecret: youtubeOAuthClientSecret.trim() || undefined,
      youtubeOAuthRedirectPort: youtubeOAuthRedirectPort.trim() || undefined
    });
    setSavedMessage(isKorean ? "워크플로 설정을 저장했습니다." : "Workflow config saved.");
  };

  const handleSaveUploadRequest = async () => {
    await saveYouTubeUploadRequest({
      videoFilePath: youtubeVideoFilePath.trim(),
      thumbnailFilePath: youtubeThumbnailFilePath.trim(),
      scheduledPublishAt:
        youtubePublishMode === "scheduled"
          ? localDateTimeInputToIso(youtubeScheduledPublishAt)
          : ""
    });
    setSavedMessage(isKorean ? "업로드 요청을 저장했습니다." : "Upload request saved.");
  };

  const handleSaveTelegramConfig = async () => {
    await saveWorkflowConfig({
      inputAiSummaryEnabled,
      processAiGenerationEnabled,
      createAiGenerationEnabled,
      outputAiGenerationEnabled,
      inputAiConnection,
      inputAiProvider,
      inputAiModel: inputAiModel.trim() || undefined,
      inputProviderType,
      inputModuleId: inputModuleId.trim() || undefined,
      telegramBotToken: telegramBotToken.trim() || undefined,
      telegramAdminChatId: telegramAdminChatId.trim() || undefined
    });
    setSavedMessage(
      isKorean ? "텔레그램 설정을 저장했습니다." : "Telegram settings saved."
    );
  };

  const handleChooseVideoFile = async () => {
    if (!activePackagePath) {
      window.alert(
        "먼저 Telegram에서 후보를 승인해서 package를 만들어주세요. Approve 후 다시 시도하면 됩니다."
      );
      return;
    }

    const selectedPath = await pickYouTubeVideoFile();
    if (!selectedPath) {
      return;
    }

    setYoutubeVideoFilePath(selectedPath);
    await saveYouTubeUploadRequest({
      videoFilePath: selectedPath,
      thumbnailFilePath: youtubeThumbnailFilePath.trim(),
      scheduledPublishAt:
        youtubePublishMode === "scheduled"
          ? localDateTimeInputToIso(youtubeScheduledPublishAt)
          : ""
    });
    setSavedMessage(isKorean ? "영상 파일을 선택했습니다." : "Video file selected.");
  };

  const handleChooseThumbnailFile = async () => {
    if (!activePackagePath) {
      window.alert(
        "먼저 Telegram에서 후보를 승인해서 package를 만들어주세요. Approve 후 다시 시도하면 됩니다."
      );
      return;
    }

    const selectedPath = await pickYouTubeThumbnailFile();
    if (!selectedPath) {
      return;
    }

    setYoutubeThumbnailFilePath(selectedPath);
    await saveYouTubeUploadRequest({
      videoFilePath: youtubeVideoFilePath.trim(),
      thumbnailFilePath: selectedPath,
      scheduledPublishAt:
        youtubePublishMode === "scheduled"
          ? localDateTimeInputToIso(youtubeScheduledPublishAt)
          : ""
    });
    setSavedMessage(isKorean ? "썸네일 파일을 선택했습니다." : "Thumbnail file selected.");
  };

  const handleUploadLastPackage = async () => {
    if (!activePackagePath) {
      window.alert(
        "업로드하려면 먼저 Telegram 흐름에서 package를 만들어야 합니다. 후보 선택 후 Approve까지 진행해 주세요."
      );
      return;
    }

    await saveYouTubeUploadRequest({
      videoFilePath: youtubeVideoFilePath.trim(),
      thumbnailFilePath: youtubeThumbnailFilePath.trim(),
      scheduledPublishAt:
        youtubePublishMode === "scheduled"
          ? localDateTimeInputToIso(youtubeScheduledPublishAt)
          : ""
    });
    await uploadLastPackageToYouTube();
  };

  const handleSaveManualInput = async () => {
    const normalizedCandidates = manualInputCandidates
      .map((candidate) => ({
        ...candidate,
        title: candidate.title.trim(),
        summary: candidate.summary.trim(),
        operatorSummary: candidate.operatorSummary?.trim() || candidate.summary.trim(),
        sourceLabel: candidate.sourceLabel?.trim() || "Manual",
        sourceUrl: candidate.sourceUrl?.trim() || undefined,
        fitReason: candidate.fitReason?.trim() || undefined
      }))
      .filter((candidate) => candidate.title && candidate.summary);

    if (!manualInputTitle.trim() || normalizedCandidates.length === 0) {
      setManualInputError(
        isKorean
          ? "수동 자료 수집에는 작업 제목과 최소 1개의 후보 제목/요약이 필요합니다."
          : "Manual input requires a job title and at least one candidate with title and summary."
      );
      return;
    }

    setManualInputError("");
    await saveManualInputCheckpoint({
      jobId: resolvedWorkflowJobId,
      title: manualInputTitle.trim(),
      candidates: normalizedCandidates,
      attachmentPaths: manualInputAttachments.map((attachment) => attachment.path)
    });
    setSavedMessage(
      isKorean
        ? "수동 자료를 checkpoint-1에 저장했습니다."
        : "Manual source input was saved into checkpoint-1."
    );
  };

  const handleAddManualCandidate = () => {
    setManualInputCandidates((current) => [
      ...current,
      createEmptyManualCandidate(current.length + 1)
    ]);
  };

  const handleRemoveManualCandidate = (candidateId: string) => {
    setManualInputCandidates((current) => {
      if (current.length === 1) {
        return current;
      }
      return current.filter((candidate) => candidate.id !== candidateId);
    });
  };

  const handleChangeManualCandidate = (
    candidateId: string,
    field: keyof ManualInputCandidateDraft,
    value: string
  ) => {
    setManualInputCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              [field]: value
            }
          : candidate
      )
    );
  };

  const appendManualInputAttachments = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    const additions = Array.from(files)
      .map((file) => {
        const filePath = getRendererFilePath(file);
        if (!filePath) {
          return null;
        }
        return {
          name: file.name,
          path: filePath
        };
      })
      .filter((entry): entry is { name: string; path: string } => Boolean(entry));

    if (additions.length === 0) {
      return;
    }

    setManualInputAttachments((current) => {
      const seen = new Set(current.map((entry) => entry.path));
      const next = [...current];
      for (const addition of additions) {
        if (!seen.has(addition.path)) {
          seen.add(addition.path);
          next.push(addition);
        }
      }
      return next;
    });
  };

  const handleSaveManualProcess = async () => {
    if (!resolvedWorkflowJobId) {
      setManualProcessError(
        isKorean
          ? "먼저 checkpoint-1이 저장되어 작업 ID가 만들어져야 합니다."
          : "Save checkpoint-1 first so a workflow job id exists."
      );
      return;
    }

    const titleOptions = manualProcessTitleOptions
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    if (
      !manualProcessHeadline.trim() ||
      !manualProcessSummary.trim() ||
      !manualProcessHook.trim() ||
      !manualProcessNarration.trim() ||
      titleOptions.length === 0
    ) {
      setManualProcessError(
        isKorean
          ? "자료 가공 수동 입력에는 제목, 요약, 제목 후보, 훅, 내레이션이 필요합니다."
          : "Manual process input requires a headline, summary, title options, hook, and narration."
      );
      return;
    }

    setManualProcessError("");
    await saveManualProcessCheckpoint({
      jobId: resolvedWorkflowJobId,
      title: manualInputTitle.trim() || workflowJobSnapshot?.job?.title || undefined,
      selectedCandidateId: manualProcessSelectedCandidateId || undefined,
      headline: manualProcessHeadline.trim(),
      summary: manualProcessSummary.trim(),
      draft: {
        titleOptions,
        hook: manualProcessHook.trim(),
        narration: manualProcessNarration.trim(),
        callToAction: manualProcessCallToAction.trim()
      },
      reviewNotes: manualProcessReviewNotes.trim() || undefined
    });
    setSavedMessage(
      isKorean
        ? "수동 가공 결과를 checkpoint-2에 저장했습니다."
        : "Manual process output was saved into checkpoint-2."
    );
  };

  const handleSaveManualCreate = async () => {
    if (!resolvedWorkflowJobId) {
      setManualCreateError(
        isKorean
          ? "먼저 checkpoint-1 또는 checkpoint-2가 저장되어 작업 ID가 만들어져야 합니다."
          : "Save checkpoint-1 or checkpoint-2 first so a workflow job id exists."
      );
      return;
    }

    const hashtags = manualCreateHashtags
      .split(",")
      .map((item) => item.trim().replace(/^#/, ""))
      .filter(Boolean);

    if (!manualCreateTitle.trim() || !manualCreateDescription.trim()) {
      setManualCreateError(
        isKorean
          ? "소재 생성 수동 입력에는 제목과 설명이 필요합니다."
          : "Manual create input requires a title and description."
      );
      return;
    }

    setManualCreateError("");
    await saveManualCreateCheckpoint({
      jobId: resolvedWorkflowJobId,
      title: manualInputTitle.trim() || workflowJobSnapshot?.job?.title || undefined,
      videoFilePath: manualCreateVideoPath.trim() || undefined,
      thumbnailFilePath: manualCreateThumbnailPath.trim() || undefined,
      metadata: {
        title: manualCreateTitle.trim(),
        description: manualCreateDescription.trim(),
        hashtags
      },
      notes: manualCreateNotes.trim() || undefined
    });
    setSavedMessage(
      isKorean
        ? "수동 소재 생성 결과를 checkpoint-3에 저장했습니다."
        : "Manual create output was saved into checkpoint-3."
    );
  };

  const handleRunCreatePipeline = async () => {
    setSavedMessage("");
    setManualCreateError("");
    if (!resolvedWorkflowJobId) {
      setManualCreateError(
        isKorean
          ? "먼저 checkpoint-2까지 저장되어 작업 ID가 있어야 소재 생성을 실행할 수 있습니다."
          : "Save through checkpoint-2 first so a workflow job id exists."
      );
      return;
    }

    const processCheckpoint = workflowJobSnapshot?.checkpoints[2];
    if (!processCheckpoint) {
      setManualCreateError(
        isKorean
          ? "checkpoint-2가 아직 없어 소재 생성을 시작할 수 없습니다."
          : "checkpoint-2 is still missing, so create generation cannot start yet."
      );
      return;
    }

    setCreatePipelineBusy(true);
    setSavedMessage(
      isKorean
        ? "3번 슬롯이 scene plan, 자산 검색, 더빙, 합성을 순서대로 실행 중입니다..."
        : "Slot 3 is generating the scene plan, assets, dubbing, and composition..."
    );
    try {
      await runCreatePipeline(resolvedWorkflowJobId);
      setSavedMessage(
        isKorean
          ? "3번 슬롯 소재 생성을 완료했습니다. 패키지와 최종 영상 파일을 확인해 주세요."
          : "Slot 3 create generation finished. Check the package and final video files."
      );
    } finally {
      setCreatePipelineBusy(false);
    }
  };

  const handleSaveManualOutput = async () => {
    if (!resolvedWorkflowJobId) {
      setManualOutputError(
        isKorean
          ? "먼저 checkpoint-1~3 중 하나가 저장되어 작업 ID가 만들어져야 합니다."
          : "Save one of checkpoint-1~3 first so a workflow job id exists."
      );
      return;
    }

    if (!manualOutputTitle.trim() || !manualOutputDescription.trim()) {
      setManualOutputError(
        isKorean
          ? "배포 수동 입력에는 제목과 설명이 필요합니다."
          : "Manual output input requires a title and description."
      );
      return;
    }

    const hashtags = manualOutputHashtags
      .split(",")
      .map((item) => item.trim().replace(/^#/, ""))
      .filter(Boolean);

    setManualOutputError("");
    const payload: ManualOutputCheckpointPayload = {
      jobId: resolvedWorkflowJobId,
      title: manualInputTitle.trim() || workflowJobSnapshot?.job?.title || undefined,
      videoFilePath: manualCreateVideoPath.trim() || youtubeVideoFilePath.trim() || undefined,
      thumbnailFilePath:
        manualCreateThumbnailPath.trim() || youtubeThumbnailFilePath.trim() || undefined,
      scheduledPublishAt:
        manualOutputScheduledPublishAt.trim()
          ? localDateTimeInputToIso(manualOutputScheduledPublishAt)
          : undefined,
      metadata: {
        title: manualOutputTitle.trim(),
        description: manualOutputDescription.trim(),
        hashtags,
        categoryId: "22",
        privacyStatus: manualOutputPrivacyStatus,
        selfDeclaredMadeForKids: manualOutputAudience === "made_for_kids"
      },
      result: {
        status: "draft",
        message: manualOutputMessage.trim() || undefined
      }
    };
    await saveManualOutputCheckpoint(payload);
    setSavedMessage(
      isKorean
        ? "수동 배포 결과를 checkpoint-4에 저장했습니다."
        : "Manual publish output was saved into checkpoint-4."
    );
  };

  const selectedOutput = selectedMcpLogId ? mcpOutputById[selectedMcpLogId] ?? "" : "";
  const sortedInstalled = [...installed].sort((left, right) => {
    const leftScore =
      (left.installState === "error" ? 30 : 0) +
      (left.installState === "updating" ? 20 : 0) +
      (left.installState === "downloading" ? 15 : 0) +
      (left.runtime.status === "running" ? 20 : 0) +
      (left.enabled ? 10 : 0);
    const rightScore =
      (right.installState === "error" ? 30 : 0) +
      (right.installState === "updating" ? 20 : 0) +
      (right.installState === "downloading" ? 15 : 0) +
      (right.runtime.status === "running" ? 20 : 0) +
      (right.enabled ? 10 : 0);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return left.id.localeCompare(right.id);
  });
  const installingCount = installed.filter((item) => item.installState === "downloading").length;
  const updatingCount = installed.filter((item) => item.installState === "updating").length;
  const errorCount = installed.filter((item) => item.installState === "error").length;
  const runningCount = installed.filter((item) => item.runtime.status === "running").length;

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="subtle">{copy.subtitle}</p>
        </div>
        <div className="hero-stats">
          <span className="pill">{isKorean ? `설치 중 ${installingCount}` : `${installingCount} installing`}</span>
          <span className="pill">{isKorean ? `업데이트 ${updatingCount}` : `${updatingCount} updating`}</span>
          <span className="pill">{isKorean ? `오류 ${errorCount}` : `${errorCount} errors`}</span>
          <span className="pill">{isKorean ? `실행 중 ${runningCount}` : `${runningCount} running`}</span>
        </div>
      </div>

      {(installingCount > 0 || updatingCount > 0 || errorCount > 0) && (
        <div className="manual-install-box">
          <strong>{isKorean ? "설치 진행 상태" : "Install activity"}</strong>
          <span className="subtle">
            {errorCount > 0
              ? isKorean
                ? "오류가 있는 항목이 위쪽에 먼저 표시됩니다. 다시 확인하거나 재설치해 복구할 수 있습니다."
                : "Items with errors are pinned first so you can recover them quickly."
              : isKorean
                ? "패키지를 내려받고 검증하는 동안 이 화면에서 진행 상태를 계속 확인할 수 있습니다."
                : "Stay on this screen to track packages being downloaded and refreshed."}
          </span>
        </div>
      )}

      {composition.issues.length > 0 && (
        <div className="manual-install-box">
          <strong>{isKorean ? "구성 점검" : "Composition Check"}</strong>
          {composition.issues.map((issue) => (
            <span key={`${issue.mcpId}-${issue.message}`} className="subtle">
              {issue.mcpId}: {issue.message}
            </span>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-row">
          <div>
            <p className="eyebrow">{isKorean ? "설치된 워크플로 설정" : "Installed Workflow Config"}</p>
            <h3>{resolvedWorkflows[0]?.schema.title ?? (isKorean ? "워크플로 묶음" : "Workflow Stack")}</h3>
          </div>
          <span className="pill">
            {getAiConnectionLabel(
              scriptProvider as "claude_cli" | "openrouter_api" | "openai_api" | "mock",
              isKorean,
              scriptProvider === "openrouter_api"
                ? openRouterModel
                : scriptProvider === "openai_api"
                  ? openAiModel
                  : undefined
            )}
          </span>
        </div>
        <p className="subtle">
          {resolvedWorkflows[0]?.schema.description ??
            (isKorean
              ? "호환되는 팩이나 MCP가 설치되면 워크플로 전용 설정이 이곳에 표시됩니다."
              : "Workflow-specific configuration will appear here when compatible packs or MCPs are installed.")}
        </p>
        <div className="manual-install-box">
          <strong>{isKorean ? "AI 연결은 설정에서 관리합니다" : "AI connections live in Settings"}</strong>
          <p className="subtle">
            {isKorean
              ? "API 키와 기본 모델은 설정 탭의 전역 AI 연결에서 한 번만 저장합니다. 각 슬롯과 모듈은 그 연결을 참조하도록 정리 중입니다."
              : "API keys and default models are now managed once in Settings. Slots and modules should reference those saved connections instead of storing their own keys."}
          </p>
        </div>
        {resolvedWorkflows.length > 0 ? (
          resolvedWorkflows.map((workflow) => (
            <div key={workflow.id} className="workflow-stack-block">
              {(() => {
                const inputStatus =
                  telegramStatus?.activeJob?.stage === "shortlisted" ||
                  telegramStatus?.activeJob?.stage === "selected"
                    ? "ready"
                    : telegramStatus?.state === "running"
                      ? "running"
                      : "idle";
                const processStatus =
                  telegramStatus?.activeJob?.stage === "awaiting_review" ||
                  telegramStatus?.activeJob?.stage === "approved"
                    ? "ready"
                    : telegramStatus?.activeJob?.stage === "awaiting_revision_input" ||
                        telegramStatus?.activeJob?.stage === "scripting"
                      ? "running"
                      : telegramStatus?.lastDraftError
                        ? "error"
                        : "waiting";
                const createStatus = activePackagePath
                  ? "ready"
                  : telegramStatus?.activeJob?.stage === "packaging"
                    ? "running"
                    : "waiting";
                const outputStatus = lastYouTubeUploadResult?.ok
                  ? "ready"
                  : lastYouTubeUploadResult && !lastYouTubeUploadResult.ok
                    ? "error"
                    : youTubeUploadRequest?.videoFilePath && youTubeAuthStatus?.connected
                      ? "waiting"
                      : "idle";
                const installedContractIds = new Set(installed.map((item) => item.id));
                const moduleOptions = listMcpRuntimeContracts()
                  .filter(
                    (contract) =>
                      contract.builtinAvailable === true || installedContractIds.has(contract.id)
                  )
                  .map((contract) => ({
                    id: contract.id,
                    name: contract.name,
                    aiCapable: contract.aiCapable === true,
                    slot: contract.slot
                  }));
                const getSlotModuleOptions = (slotId: SlotId) => {
                  return moduleOptions.filter((item) => item.slot === slotId);
                };
                const inputModuleOptions = getSlotModuleOptions("input");
                const processModuleOptions = getSlotModuleOptions("process");
                const createModuleOptions = getSlotModuleOptions("create");
                const outputModuleOptions = getSlotModuleOptions("output");
                const processAiConfigWarning =
                  processAiGenerationEnabled
                    ? scriptProvider === "openrouter_api" && !openRouterApiKey.trim()
                      ? isKorean
                        ? "자료 가공 AI를 켰지만 OpenRouter API 키가 없습니다."
                        : "Process AI is enabled, but the OpenRouter API key is missing."
                      : scriptProvider === "openai_api" && !openAiApiKey.trim()
                        ? isKorean
                          ? "자료 가공 AI를 켰지만 OpenAI API 키가 없습니다."
                          : "Process AI is enabled, but the OpenAI API key is missing."
                        : scriptProvider === "claude_cli" && !settings?.claudeExecutablePath?.trim()
                          ? isKorean
                            ? "자료 가공 AI를 켰지만 Claude 실행 경로가 없습니다."
                            : "Process AI is enabled, but the Claude executable path is missing."
                          : undefined
                    : undefined;
                const inputModuleName = inputModuleOptions.find((item) => item.id === inputModuleId)?.name;
                const inputModuleAiCapable =
                  inputModuleOptions.find((item) => item.id === inputModuleId)?.aiCapable ?? false;
                const inputSlotUi = getSlotUiSchema("input", inputProviderType, inputModuleId);
                const processModuleName = processModuleOptions.find((item) => item.id === processModuleId)?.name;
                const processModuleAiCapable =
                  processModuleOptions.find((item) => item.id === processModuleId)?.aiCapable ?? false;
                const processSlotUi = getSlotUiSchema("process", processProviderType, processModuleId);
                const createModuleName = createModuleOptions.find((item) => item.id === createModuleId)?.name;
                const createModuleAiCapable =
                  createModuleOptions.find((item) => item.id === createModuleId)?.aiCapable ?? false;
                const createSlotUi = getSlotUiSchema("create", createProviderType, createModuleId);
                const outputModuleName = outputModuleOptions.find((item) => item.id === outputModuleId)?.name;
                const outputModuleAiCapable =
                  outputModuleOptions.find((item) => item.id === outputModuleId)?.aiCapable ?? false;
                const outputSlotUi = getSlotUiSchema("output", outputProviderType, outputModuleId);
                const inputTelegramFields = (inputSlotUi?.fields ?? []).filter((field) =>
                  ["telegramBotToken", "telegramAdminChatId", "trendWindow"].includes(field.id)
                );
                const inputCandidateFields = (inputSlotUi?.fields ?? []).filter((field) =>
                  [
                    "candidateTitle",
                    "candidateSourceLabel",
                    "candidateSummary",
                    "candidateSourceUrl",
                    "candidateFitReason"
                  ].includes(field.id)
                );
                const inputTelegramActions = (inputSlotUi?.actions ?? []).filter((action) =>
                  ["save_telegram_config", "sync_telegram"].includes(action.id)
                );
                const inputManualActions = (inputSlotUi?.actions ?? []).filter((action) =>
                  ["add_candidate", "attach_files", "save_checkpoint_1"].includes(action.id)
                );
                const processFields = processSlotUi?.fields ?? [];
                const processActions = processSlotUi?.actions ?? [];
                const createFields = createSlotUi?.fields ?? [];
                const createActions = createSlotUi?.actions ?? [];
                const slotCards = [
                  {
                    id: "input",
                    step: "01",
                    title: inputSlotUi?.title ?? (isKorean ? "자료 수집" : "Input"),
                    description:
                      inputSlotUi?.description ??
                      (isKorean
                        ? "커뮤니티와 소스에서 후보를 모으고 다음 단계로 넘길 주제를 고릅니다."
                        : "Collect and shortlist source candidates."),
                    status: inputStatus,
                    mode: workflowConfig?.inputMode ?? "auto",
                    providerType: inputProviderType,
                    selectedModuleId: inputModuleId,
                    aiCapable:
                      inputProviderType === "module"
                        ? inputModuleAiCapable
                        : isBuiltinAiCapable("input"),
                    providerLabel: getSlotProviderLabel(inputProviderType, isKorean, inputModuleName),
                    statusLabel:
                      inputStatus === "ready"
                        ? isKorean
                          ? "후보 준비됨"
                          : "Candidates ready"
                        : inputStatus === "running"
                          ? isKorean
                            ? "수집 진행 중"
                            : "Collecting"
                          : isKorean
                            ? "아직 시작 전"
                            : "Idle",
                    detail:
                      telegramStatus?.activeJob?.title ??
                      (isKorean ? "아직 선택된 후보가 없습니다." : "No candidate selected yet."),
                    checkpointSummary: summarizeCheckpoint(
                      workflowJobSnapshot?.checkpoints[1],
                      isKorean ? "ko" : "en"
                    ),
                    onToggleMode: () =>
                      void saveWorkflowConfig({
                        inputMode: (workflowConfig?.inputMode ?? "auto") === "auto" ? "manual" : "auto"
                      }),
                    onSetProviderType: (providerType: SlotProviderType) =>
                      void saveWorkflowConfig({
                        inputProviderType: providerType
                      }),
                    onSelectModule: (moduleId: string) =>
                      void saveWorkflowConfig({
                        inputModuleId: moduleId || undefined
                      })
                  },
                  {
                    id: "process",
                    step: "02",
                    title: processSlotUi?.title ?? (isKorean ? "자료 가공" : "Process"),
                    description:
                      processSlotUi?.description ??
                      (isKorean
                        ? "요약, 제목 후보, 훅, 내레이션을 만들어 검토 가능한 초안으로 정리합니다."
                        : "Summarize and draft the script."),
                    status: processStatus,
                    mode: workflowConfig?.processMode ?? "auto",
                    providerType: processProviderType,
                    selectedModuleId: processModuleId,
                    aiCapable:
                      processProviderType === "module"
                        ? processModuleAiCapable
                        : isBuiltinAiCapable("process"),
                    providerLabel: getSlotProviderLabel(processProviderType, isKorean, processModuleName),
                    statusLabel:
                      processStatus === "ready"
                        ? isKorean
                          ? "초안 준비됨"
                          : "Draft ready"
                        : processStatus === "running"
                          ? isKorean
                            ? "초안 다듬는 중"
                            : "Drafting"
                          : processStatus === "error"
                            ? isKorean
                              ? "초안 생성 오류"
                              : "Draft error"
                            : isKorean
                              ? "후보 선택 대기"
                              : "Waiting for selection",
                    detail:
                      telegramStatus?.lastDraftSource
                        ? isKorean
                          ? `최근 생성 엔진: ${telegramStatus.lastDraftSource}`
                          : `Last generator: ${telegramStatus.lastDraftSource}`
                        : isKorean
                          ? "아직 스크립트 초안이 없습니다."
                          : "No script draft yet.",
                    checkpointSummary: summarizeCheckpoint(
                      workflowJobSnapshot?.checkpoints[2],
                      isKorean ? "ko" : "en"
                    ),
                    onToggleMode: () =>
                      void saveWorkflowConfig({
                        processMode:
                          (workflowConfig?.processMode ?? "auto") === "auto" ? "manual" : "auto"
                      }),
                    onSetProviderType: (providerType: SlotProviderType) =>
                      void saveWorkflowConfig({
                        processProviderType: providerType
                      }),
                    onSelectModule: (moduleId: string) =>
                      void saveWorkflowConfig({
                        processModuleId: moduleId || undefined
                      })
                  },
                  {
                    id: "create",
                    step: "03",
                    title: createSlotUi?.title ?? (isKorean ? "소재 생성" : "Create"),
                    description:
                      createSlotUi?.description ??
                      (isKorean
                        ? "패키지, 메타데이터, 파일 경로를 묶어 업로드 가능한 제작 단위로 만듭니다."
                        : "Bundle assets and metadata into a production package."),
                    status: createStatus,
                    mode: workflowConfig?.createMode ?? "auto",
                    providerType: createProviderType,
                    selectedModuleId: createModuleId,
                    aiCapable:
                      createProviderType === "module"
                        ? createModuleAiCapable
                        : isBuiltinAiCapable("create"),
                    providerLabel: getSlotProviderLabel(createProviderType, isKorean, createModuleName),
                    statusLabel:
                      createStatus === "ready"
                        ? isKorean
                          ? "패키지 준비됨"
                          : "Package ready"
                        : createStatus === "running"
                          ? isKorean
                            ? "패키지 생성 중"
                            : "Packaging"
                          : isKorean
                            ? "승인 대기 중"
                            : "Waiting for approval",
                    detail:
                      activePackagePath ??
                      (isKorean
                        ? "패키지를 만들면 여기에 최근 결과 경로가 표시됩니다."
                        : "The latest package path will appear here."),
                    checkpointSummary: summarizeCheckpoint(
                      workflowJobSnapshot?.checkpoints[3],
                      isKorean ? "ko" : "en"
                    ),
                    onToggleMode: () =>
                      void saveWorkflowConfig({
                        createMode: (workflowConfig?.createMode ?? "auto") === "auto" ? "manual" : "auto"
                      }),
                    onSetProviderType: (providerType: SlotProviderType) =>
                      void saveWorkflowConfig({
                        createProviderType: providerType
                      }),
                    onSelectModule: (moduleId: string) =>
                      void saveWorkflowConfig({
                        createModuleId: moduleId || undefined
                      })
                  },
                  {
                    id: "output",
                    step: "04",
                    title: outputSlotUi?.title ?? (isKorean ? "배포" : "Output"),
                    description:
                      outputSlotUi?.description ??
                      (isKorean
                        ? "유튜브 연결과 업로드 요청을 마무리하고 최종 게시까지 진행합니다."
                        : "Connect YouTube and publish the final output."),
                    status: outputStatus,
                    mode: workflowConfig?.outputMode ?? "auto",
                    providerType: outputProviderType,
                    selectedModuleId: outputModuleId,
                    aiCapable:
                      outputProviderType === "module"
                        ? outputModuleAiCapable
                        : isBuiltinAiCapable("output"),
                    providerLabel: getSlotProviderLabel(outputProviderType, isKorean, outputModuleName),
                    statusLabel:
                      outputStatus === "ready"
                        ? isKorean
                          ? "업로드 완료"
                          : "Uploaded"
                        : outputStatus === "error"
                          ? isKorean
                            ? "업로드 오류"
                            : "Upload error"
                          : outputStatus === "waiting"
                            ? isKorean
                              ? "업로드 조건 충족"
                              : "Ready to upload"
                            : isKorean
                              ? "배포 준비 전"
                              : "Not ready",
                    detail:
                      lastYouTubeUploadResult?.videoUrl ??
                      (youTubeAuthStatus?.connected
                        ? isKorean
                          ? "유튜브는 연결됐습니다. 영상 파일을 채우면 업로드할 수 있습니다."
                          : "YouTube is connected. Add a video file to upload."
                        : isKorean
                          ? "유튜브 연결이 아직 필요합니다."
                          : "YouTube connection is still needed."),
                    checkpointSummary: summarizeCheckpoint(
                      workflowJobSnapshot?.checkpoints[4],
                      isKorean ? "ko" : "en"
                    ),
                    onToggleMode: () =>
                      void saveWorkflowConfig({
                        outputMode: (workflowConfig?.outputMode ?? "auto") === "auto" ? "manual" : "auto"
                      }),
                    onSetProviderType: (providerType: SlotProviderType) =>
                      void saveWorkflowConfig({
                        outputProviderType: providerType
                      }),
                    onSelectModule: (moduleId: string) =>
                      void saveWorkflowConfig({
                        outputModuleId: moduleId || undefined
                      })
                  }
                ] as const;

                return (
                  <div className="workflow-slot-pipeline">
                    {slotCards.map((slot) => (
                      <article
                        key={slot.id}
                        className={`workflow-slot-card ${getSlotTone(slot.status)}`}
                      >
                        <div className="workflow-slot-card-header">
                          <span className="workflow-slot-step">{slot.step}</span>
                          <span className={`workflow-slot-status ${getSlotTone(slot.status)}`}>
                            {slot.statusLabel}
                          </span>
                        </div>
                        <div className="workflow-slot-mode-row">
                          <button
                            type="button"
                            className={slot.mode === "auto" ? "pill-button active" : "pill-button"}
                            onClick={slot.onToggleMode}
                          >
                            {slot.mode === "auto"
                              ? isKorean
                                ? "자동 모드"
                                : "Auto mode"
                              : isKorean
                                ? "수동 모드"
                                : "Manual mode"}
                          </button>
                          <span className="workflow-slot-mode-hint">
                            {slot.mode === "auto"
                              ? isKorean
                                ? "현재는 런처가 이 단계를 자동으로 채웁니다."
                                : "The launcher currently fills this slot automatically."
                              : isKorean
                                ? "다음 단계에서는 수동 입력 UI를 여기에 붙일 예정입니다."
                              : "Manual slot input UI will attach here next."}
                          </span>
                        </div>
                        {slot.mode === "auto" &&
                          slot.aiCapable &&
                          (() => {
                            const aiState = getSlotAiState(slot.id as SlotId);
                            return (
                              <details className="workflow-slot-manual-box">
                                <summary className="workflow-slot-summary">
                                  <strong>{isKorean ? "AI 설정" : "AI settings"}</strong>
                                  <span className="workflow-slot-mode-hint">
                                    {getAiModeSummary(
                                      aiState.enabled,
                                      aiState.provider,
                                      isKorean,
                                      aiState.model
                                    )}
                                  </span>
                                </summary>
                                <div className="workflow-slot-command-guide">
                                  <label className="checkbox-row">
                                    <input
                                      type="checkbox"
                                      checked={aiState.enabled}
                                      onChange={(event) => aiState.onToggle(event.target.checked)}
                                    />
                                    <span>{aiState.toggleLabel}</span>
                                  </label>
                                  <span className="subtle">{aiState.description}</span>
                                </div>
                                {aiState.enabled && (
                                  <div className="form-grid">
                                    <label className="field">
                                      <span>{isKorean ? "참조 연결" : "Referenced connection"}</span>
                                      <select
                                        className="text-input"
                                        value={aiState.connection}
                                        onChange={(event) =>
                                          aiState.onConnectionChange(
                                            event.target.value as WorkflowAiConnectionRef
                                          )
                                        }
                                      >
                                        <option value="connection_1">
                                          {isKorean ? "AI 연결 1" : "AI Connection 1"}
                                        </option>
                                        <option value="connection_2">
                                          {isKorean ? "AI 연결 2" : "AI Connection 2"}
                                        </option>
                                      </select>
                                    </label>
                                    <label className="field">
                                      <span>{isKorean ? "현재 공급자" : "Current provider"}</span>
                                      <input
                                        className="text-input"
                                        value={aiState.connectionLabel}
                                        readOnly
                                      />
                                      <span className="subtle">
                                        {getAiConnectionLabel(aiState.provider, isKorean)}
                                      </span>
                                    </label>
                                    <label className="field">
                                      <span>{isKorean ? "모델" : "Model"}</span>
                                      <select
                                        className="text-input"
                                        value={aiState.model}
                                        onChange={(event) =>
                                          aiState.onModelChange(event.target.value)
                                        }
                                      >
                                        {getAiModelOptions(aiState.provider).map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                )}
                                {aiState.warning && (
                                  <span className="warning-text">{aiState.warning}</span>
                                )}
                              </details>
                            );
                          })()}
                        {slot.mode === "auto" && !slot.aiCapable && (
                          <div className="workflow-slot-manual-box">
                            <strong>{isKorean ? "AI 설정" : "AI settings"}</strong>
                            <span className="subtle">
                              {slot.providerType === "module"
                                ? isKorean
                                  ? "선택한 모듈은 AI를 사용하지 않으므로 이 슬롯의 AI 설정이 비활성화됩니다."
                                  : "The selected module does not use AI, so AI settings are disabled for this slot."
                                : isKorean
                                  ? "현재 기본 내장 실행기는 이 슬롯에서 AI를 사용하지 않습니다."
                                  : "The current built-in runner does not use AI for this slot."}
                            </span>
                          </div>
                        )}
                        {slot.id === "create" && createPipelineWarning && (
                          <div className="workflow-slot-manual-box">
                            <strong>{isKorean ? "생성 전 확인" : "Before generate"}</strong>
                            <span className="warning-text">{createPipelineWarning}</span>
                          </div>
                        )}
                        {slot.id === "create" && createPipelineBusy && (
                          <div className="workflow-slot-manual-box">
                            <strong>{isKorean ? "소재 생성 중" : "Generating assets"}</strong>
                            <span className="subtle">
                              {isKorean
                                ? "scene plan, 자산 검색, 더빙, 합성을 차례대로 실행하고 있습니다. 완료될 때까지 잠시 기다려 주세요."
                                : "Running scene planning, asset search, dubbing, and composition. Please wait until it finishes."}
                            </span>
                          </div>
                        )}
                        <div className="workflow-slot-manual-box">
                          <div className="workflow-slot-provider-row">
                            <button
                              type="button"
                              className={slot.providerType === "builtin" ? "pill-button active" : "pill-button"}
                              onClick={() => slot.onSetProviderType("builtin")}
                            >
                              {isKorean ? "기본 내장" : "Built-in"}
                            </button>
                            <button
                              type="button"
                              className={slot.providerType === "module" ? "pill-button active" : "pill-button"}
                              onClick={() => slot.onSetProviderType("module")}
                            >
                              {isKorean ? "모듈 선택" : "Choose module"}
                            </button>
                          </div>
                          <span className="workflow-slot-mode-hint">{slot.providerLabel}</span>
                          {slot.providerType === "module" && (
                            <select
                              className="text-input"
                              value={slot.selectedModuleId}
                              onChange={(event) => slot.onSelectModule(event.target.value)}
                            >
                              <option value="">
                                {isKorean ? "설치된 모듈 선택" : "Select installed module"}
                              </option>
                              {(slot.id === "input"
                                ? inputModuleOptions
                                : slot.id === "process"
                                  ? processModuleOptions
                                  : slot.id === "create"
                                    ? createModuleOptions
                                    : outputModuleOptions
                              ).map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <h4>{slot.title}</h4>
                        <p>{slot.description}</p>
                        <span className="workflow-slot-detail">{slot.detail}</span>
                        {slot.id === "process" && slot.mode === "auto" && (
                          <div className="workflow-slot-manual-box">
                            <div className="workflow-slot-command-guide">
                              <strong>{isKorean ? "현재 단계" : "Current stage"}</strong>
                              <span className="subtle">
                                {isKorean
                                  ? "/shortlist에서 제시된 후보 중 하나를 골라서 요약본과 스크립트 초안을 승인하기 전까지 다듬는 단계입니다."
                                  : "This stage refines the selected /shortlist candidate into a summary and script draft before approval."}
                              </span>
                            </div>
                          </div>
                        )}
                        {slot.id === "create" && slot.mode === "auto" && createFields.length > 0 && (
                          <div className="workflow-slot-manual-box">
                            <strong>
                              {createSlotUi?.title ?? (isKorean ? "소재 생성기 설정" : "Create generator settings")}
                            </strong>
                            <span className="subtle">
                              {isKorean
                                ? "이 슬롯에서 사용할 생성기 설정과 실행 버튼입니다."
                                : "Configure and run the generator used for this slot."}
                            </span>
                            <div className="form-grid">{createFields.map(renderCreateField)}</div>
                            {createActions.length > 0 && (
                              <div className="button-row">
                                {createActions.map((action) => (
                                  <button
                                    key={action.id}
                                    type="button"
                                    className={action.kind === "primary" ? "primary-button" : "secondary-button"}
                                    onClick={() => void runSlotAction(action.id)}
                                    disabled={isSlotActionDisabled(action.id)}
                                  >
                                    {action.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {slot.id === "input" &&
                          (inputTelegramFields.length > 0 || inputTelegramActions.length > 0) && (
                          <div className="workflow-slot-manual-box">
                            <div className="card-row">
                              <strong>
                                {inputSlotUi?.title ?? (isKorean ? "텔레그램 연결 설정" : "Telegram setup")}
                              </strong>
                              <button
                                type="button"
                                className="pill-button"
                                onClick={() =>
                                  void window.mellowcat.app.openExternal(
                                    "https://mellowcat.xyz/help/claudecode#telegramAPI"
                                  )
                                }
                              >
                                ?
                              </button>
                            </div>
                            <div className="form-grid">{inputTelegramFields.map(renderTelegramField)}</div>

                            <div className="workflow-slot-command-guide">
                              <strong>{isKorean ? "빠른 시작 명령어" : "Quick start commands"}</strong>
                              <span className="subtle">
                                {isKorean
                                  ? "/help 로 도움말을 열고, /shortlist 로 후보를 다시 보내고, /lang ko 또는 /lang en 으로 출력 언어를 바꿀 수 있습니다."
                                  : "Use /help for guidance, /shortlist to resend candidates, and /lang ko or /lang en to switch output language."}
                              </span>
                            </div>
                            <div className="workflow-slot-inline-actions">
                              {inputTelegramActions.map((action) => (
                                <button
                                  key={action.id}
                                  type="button"
                                  className={action.kind === "primary" ? "primary-button" : "secondary-button"}
                                  onClick={() => void runSlotAction(action.id)}
                                >
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {slot.id === "input" && slot.mode === "manual" && (
                          <div className="workflow-slot-manual-box">
                            <strong>{isKorean ? "수동 자료 입력" : "Manual source input"}</strong>
                            <label className="field">
                              <span>{isKorean ? "작업 제목" : "Job title"}</span>
                              <input
                                className="text-input"
                                value={manualInputTitle}
                                onChange={(event) => setManualInputTitle(event.target.value)}
                                placeholder={isKorean ? "예: 텔레그램 숏폼 후보 수집" : "e.g. Shortform trend intake"}
                              />
                            </label>
                            <div className="workflow-slot-inline-actions">
                              {inputManualActions
                                .filter((action) => action.id !== "save_checkpoint_1")
                                .map((action) =>
                                  action.id === "attach_files" ? (
                                    <label key={action.id} className="secondary-button file-button">
                                      <input
                                        type="file"
                                        multiple
                                        hidden
                                        onChange={(event) => appendManualInputAttachments(event.target.files)}
                                      />
                                      {action.label}
                                    </label>
                                  ) : (
                                    <button
                                      key={action.id}
                                      type="button"
                                      className={action.kind === "primary" ? "primary-button" : "secondary-button"}
                                      onClick={() => {
                                        if (action.id === "add_candidate") {
                                          handleAddManualCandidate();
                                        } else {
                                          void runSlotAction(action.id);
                                        }
                                      }}
                                    >
                                      {action.label}
                                    </button>
                                  )
                                )}
                            </div>
                            <div
                              className="workflow-slot-dropzone"
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                appendManualInputAttachments(event.dataTransfer.files);
                              }}
                            >
                              <strong>{isKorean ? "파일을 여기로 끌어오세요" : "Drop files here"}</strong>
                              <span className="subtle">
                                {isKorean
                                  ? "원문 스크린샷, 보조 메모, 레퍼런스 파일을 checkpoint-1 첨부로 함께 복사합니다."
                                  : "Reference screenshots, notes, and support files will be copied into checkpoint-1 attachments."}
                              </span>
                            </div>
                            {manualInputAttachments.length > 0 && (
                              <div className="workflow-slot-attachment-list">
                                {manualInputAttachments.map((attachment) => (
                                  <div key={attachment.path} className="workflow-slot-attachment-item">
                                    <span>{attachment.name}</span>
                                    <button
                                      type="button"
                                      className="ghost-button"
                                      onClick={() =>
                                        setManualInputAttachments((current) =>
                                          current.filter((entry) => entry.path !== attachment.path)
                                        )
                                      }
                                    >
                                      {isKorean ? "제거" : "Remove"}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="workflow-slot-candidate-list">
                              {manualInputCandidates.map((candidate, index) => (
                                <div key={candidate.id} className="workflow-slot-candidate-card">
                                  <div className="card-row">
                                    <strong>{isKorean ? `후보 ${index + 1}` : `Candidate ${index + 1}`}</strong>
                                    {manualInputCandidates.length > 1 && (
                                      <button
                                        type="button"
                                        className="ghost-button"
                                        onClick={() => handleRemoveManualCandidate(candidate.id ?? "")}
                                      >
                                        {isKorean ? "삭제" : "Remove"}
                                      </button>
                                    )}
                                  </div>
                                  <div className="form-grid">
                                    {inputCandidateFields.map((field) =>
                                      renderInputCandidateField(candidate, field)
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="button-row">
                              {inputManualActions
                                .filter((action) => action.id === "save_checkpoint_1")
                                .map((action) => (
                                  <button
                                    key={action.id}
                                    type="button"
                                    className={action.kind === "primary" ? "primary-button" : "secondary-button"}
                                    onClick={() => void runSlotAction(action.id)}
                                  >
                                    {action.label}
                                  </button>
                                ))}
                            </div>
                            {manualInputError && (
                              <span className="warning-text">{manualInputError}</span>
                            )}
                          </div>
                        )}
                        {slot.id === "process" &&
                          slot.mode === "manual" &&
                          processActions.some((action) => action.id === "save_checkpoint_2") && (
                          <div className="workflow-slot-manual-box">
                            <strong>{isKorean ? "수동 가공 입력" : "Manual process input"}</strong>
                            <div className="form-grid">{processFields.map(renderProcessField)}</div>
                            <div className="button-row">
                              {processActions
                                .filter((action) => action.id === "save_checkpoint_2")
                                .map((action) => (
                                  <button
                                    key={action.id}
                                    type="button"
                                    className={action.kind === "primary" ? "primary-button" : "secondary-button"}
                                    onClick={() => void runSlotAction(action.id)}
                                  >
                                    {action.label}
                                  </button>
                                ))}
                            </div>
                            {manualProcessError && (
                              <span className="warning-text">{manualProcessError}</span>
                            )}
                          </div>
                        )}
                        {slot.id === "create" &&
                          slot.mode === "manual" &&
                          createActions.some((action) => action.id === "save_checkpoint_3") && (
                          <div className="workflow-slot-manual-box">
                            <strong>{isKorean ? "수동 소재 입력" : "Manual create input"}</strong>
                            <span className="subtle">
                              {isKorean
                                ? "영상 파일과 업로드 메타데이터를 직접 묶어서 checkpoint-3에 저장합니다."
                                : "Bundle the video asset and publish metadata directly into checkpoint-3."}
                            </span>
                            <div className="form-grid">{createFields.map(renderCreateField)}</div>
                            <div className="button-row">
                              {createActions
                                .filter((action) => action.id === "save_checkpoint_3")
                                .map((action) => (
                                  <button
                                    key={action.id}
                                    type="button"
                                    className={action.kind === "primary" ? "primary-button" : "secondary-button"}
                                    onClick={() => void runSlotAction(action.id)}
                                  >
                                    {action.label}
                                  </button>
                                ))}
                            </div>
                            {manualCreateError && (
                              <span className="warning-text">{manualCreateError}</span>
                            )}
                          </div>
                        )}
                        {slot.id === "output" &&
                          (() => {
                            const slotUiSchema = getSlotUiSchema(
                              "output",
                              outputProviderType,
                              outputModuleId
                            );

                            if (!slotUiSchema) {
                              return null;
                            }

                            return (
                              <div className="workflow-slot-manual-box">
                                <strong>{slotUiSchema.title ?? (isKorean ? "배포 설정" : "Output settings")}</strong>
                                {slotUiSchema.description && (
                                  <span className="subtle">{slotUiSchema.description}</span>
                                )}
                                {slotUiSchema.fields.length > 0 && (
                                  <details className="workflow-slot-manual-box">
                                    <summary className="workflow-slot-summary">
                                      <strong>{isKorean ? "모듈 설정" : "Module settings"}</strong>
                                      <span className="workflow-slot-mode-hint">
                                        {isKorean
                                          ? "선택한 실행기 또는 모듈이 요구하는 설정입니다."
                                          : "Settings required by the selected runner or module."}
                                      </span>
                                    </summary>
                                    <div className="form-grid">
                                      {slotUiSchema.fields.map((field) => renderSlotField(field))}
                                    </div>
                                  </details>
                                )}
                                <div className="button-row">
                                  {slotUiSchema.actions.map((action) => {
                                    if (action.id === "connect_youtube" && youTubeAuthStatus?.connected) {
                                      return null;
                                    }
                                    if (action.id === "disconnect_youtube" && !youTubeAuthStatus?.connected) {
                                      return null;
                                    }
                                    if (action.id === "connect_instagram" && instagramConnected) {
                                      return null;
                                    }
                                    if (action.id === "disconnect_instagram" && !instagramConnected) {
                                      return null;
                                    }

                                    return (
                                      <button
                                        key={action.id}
                                        type="button"
                                        className={getSlotButtonClass(action.kind)}
                                        onClick={() => void runSlotAction(action.id)}
                                        disabled={isSlotActionDisabled(action.id)}
                                      >
                                        {action.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                {!youTubeAuthStatus?.connected && !youtubeOAuthClientId.trim() && (
                                  outputModuleId !== "instagram-publish-mcp" && (
                                    <span className="subtle">
                                      {isKorean
                                        ? "먼저 OAuth Client ID를 입력하고 저장해야 유튜브 연결을 시작할 수 있습니다."
                                        : "Enter and save the OAuth Client ID before starting the YouTube connection."}
                                    </span>
                                  )
                                )}
                                {outputModuleId !== "instagram-publish-mcp" &&
                                  youTubeAuthStatus?.connected &&
                                  !youtubeVideoFilePath.trim() && (
                                    <span className="subtle">
                                      {isKorean
                                        ? "업로드하려면 먼저 영상 파일을 선택해 주세요."
                                        : "Choose a video file before starting the upload."}
                                    </span>
                                  )}
                                {outputModuleId === "instagram-publish-mcp" &&
                                  !instagramConnected &&
                                  (!instagramAccountHandle.trim() || !instagramAccessToken.trim()) && (
                                    <span className="subtle">
                                      {isKorean
                                        ? "인스타그램 계정과 Access Token을 저장해야 mock 연결을 시작할 수 있습니다."
                                        : "Save the Instagram account and access token before starting the mock connection."}
                                    </span>
                                  )}
                                {outputModuleId === "instagram-publish-mcp" &&
                                  instagramConnected &&
                                  !activePackagePath && (
                                    <span className="subtle">
                                      {isKorean
                                        ? "mock 업로드를 보려면 먼저 최근 패키지가 있어야 합니다."
                                        : "Create a recent package first to preview the mock upload flow."}
                                    </span>
                                  )}
                                {outputModuleId === "instagram-publish-mcp" && instagramStatusMessage && (
                                  <span className="subtle">{instagramStatusMessage}</span>
                                )}
                              </div>
                            );
                          })()}
                        {slot.id === "output" && slot.mode === "manual" && (
                          <div className="workflow-slot-manual-box">
                            <strong>{isKorean ? "수동 배포 입력" : "Manual publish input"}</strong>
                            <span className="subtle">
                              {isKorean
                                ? "최종 업로드 메타데이터와 수동 업로드 결과를 checkpoint-4에 저장합니다."
                                : "Store the final publish metadata and manual upload result in checkpoint-4."}
                            </span>
                            <div className="form-grid">
                              <label className="field field-span-2">
                                <span>{isKorean ? "최종 제목" : "Final title"}</span>
                                <input
                                  className="text-input"
                                  value={manualOutputTitle}
                                  onChange={(event) => setManualOutputTitle(event.target.value)}
                                  placeholder={
                                    isKorean ? "최종 업로드 제목" : "Final title for upload"
                                  }
                                />
                              </label>
                              <label className="field field-span-2">
                                <span>{isKorean ? "최종 설명" : "Final description"}</span>
                                <textarea
                                  className="text-input textarea-input"
                                  rows={4}
                                  value={manualOutputDescription}
                                  onChange={(event) => setManualOutputDescription(event.target.value)}
                                  placeholder={
                                    isKorean
                                      ? "배포 단계에서 사용할 설명문"
                                      : "Description used during publishing"
                                  }
                                />
                              </label>
                              <label className="field field-span-2">
                                <span>{isKorean ? "해시태그" : "Hashtags"}</span>
                                <input
                                  className="text-input"
                                  value={manualOutputHashtags}
                                  onChange={(event) => setManualOutputHashtags(event.target.value)}
                                  placeholder={
                                    isKorean
                                      ? "쉼표로 구분해 입력하세요."
                                      : "Separate hashtags with commas."
                                  }
                                />
                              </label>
                              <label className="field">
                                <span>{isKorean ? "공개 범위" : "Privacy"}</span>
                                <select
                                  className="text-input"
                                  value={manualOutputPrivacyStatus}
                                  onChange={(event) =>
                                    setManualOutputPrivacyStatus(
                                      event.target.value as "private" | "unlisted" | "public"
                                    )
                                  }
                                >
                                  <option value="private">
                                    {isKorean ? "비공개" : "Private"}
                                  </option>
                                  <option value="unlisted">
                                    {isKorean ? "일부 공개" : "Unlisted"}
                                  </option>
                                  <option value="public">
                                    {isKorean ? "공개" : "Public"}
                                  </option>
                                </select>
                              </label>
                              <div className="field field-span-2">
                                <details className="workflow-slot-manual-box">
                                  <summary className="workflow-slot-summary">
                                    <strong>{isKorean ? "고급 설정" : "Advanced settings"}</strong>
                                    <span className="workflow-slot-mode-hint">
                                      {isKorean ? "예약 게시 시간과 아동용 여부" : "Schedule and audience"}
                                    </span>
                                  </summary>
                                  <div className="form-grid">
                                    <label className="field field-span-2">
                                      <span>{isKorean ? "아동용 여부" : "Audience"}</span>
                                      <select
                                        className="text-input"
                                        value={manualOutputAudience}
                                        onChange={(event) =>
                                          setManualOutputAudience(
                                            event.target.value as
                                              | "not_made_for_kids"
                                              | "made_for_kids"
                                          )
                                        }
                                      >
                                        <option value="not_made_for_kids">
                                          {isKorean ? "아동용 아님" : "Not made for kids"}
                                        </option>
                                        <option value="made_for_kids">
                                          {isKorean ? "아동용" : "Made for kids"}
                                        </option>
                                      </select>
                                    </label>
                                    <label className="field field-span-2">
                                      <span>{isKorean ? "예약 게시 시간" : "Scheduled publish time"}</span>
                                      <input
                                        className="text-input"
                                        type="datetime-local"
                                        value={manualOutputScheduledPublishAt}
                                        onChange={(event) =>
                                          setManualOutputScheduledPublishAt(event.target.value)
                                        }
                                      />
                                    </label>
                                  </div>
                                </details>
                              </div>
                              <label className="field field-span-2">
                                <span>{isKorean ? "배포 메모" : "Publish notes"}</span>
                                <textarea
                                  className="text-input textarea-input"
                                  rows={2}
                                  value={manualOutputMessage}
                                  onChange={(event) => setManualOutputMessage(event.target.value)}
                                  placeholder={
                                    isKorean
                                      ? "수동 업로드 결과나 특이사항을 남깁니다."
                                      : "Leave notes about the manual publish result."
                                  }
                                />
                              </label>
                            </div>
                            <div className="button-row">
                              <button
                                type="button"
                                className="primary-button"
                                onClick={() => void handleSaveManualOutput()}
                              >
                                {isKorean ? "checkpoint-4 저장" : "Save to checkpoint-4"}
                              </button>
                            </div>
                            {manualOutputError && (
                              <span className="warning-text">{manualOutputError}</span>
                            )}
                          </div>
                        )}
                        <div className="workflow-slot-preview">
                          <strong>{isKorean ? "최근 checkpoint" : "Latest checkpoint"}</strong>
                          <span>{slot.checkpointSummary}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                );
              })()}

              <WorkflowConfigRenderer
                schema={{
                  ...workflow.schema,
                  sections: workflow.schema.sections.filter(
                    (section) => section.id !== "youtube" && section.id !== "discovery-baseline"
                  )
                }}
                fields={{
                  telegramBotToken: {
                    value: telegramBotToken,
                    onChange: setTelegramBotToken,
                    visible: showTelegramBotToken,
                    onToggleVisibility: () => setShowTelegramBotToken((value) => !value)
                  },
                  telegramAdminChatId: {
                    value: telegramAdminChatId,
                    onChange: setTelegramAdminChatId
                  },
                  youtubeChannelLabel: {
                    value: youtubeChannelLabel,
                    onChange: setYoutubeChannelLabel
                  },
                  youtubePrivacyStatus: {
                    value: youtubePrivacyStatus,
                    onChange: (value) =>
                      setYoutubePrivacyStatus(value as "private" | "unlisted" | "public")
                  },
                  youtubeCategoryId: {
                    value: youtubeCategoryId,
                    onChange: setYoutubeCategoryId
                  },
                  youtubeAudience: {
                    value: youtubeAudience,
                    onChange: (value) =>
                      setYoutubeAudience(value as "not_made_for_kids" | "made_for_kids")
                  },
                  youtubePublishMode: {
                    value: youtubePublishMode,
                    onChange: (value) =>
                      setYoutubePublishMode(value as "now" | "scheduled")
                  },
                  youtubeScheduledPublishAt: {
                    value: youtubeScheduledPublishAt,
                    onChange: setYoutubeScheduledPublishAt
                  }
                }}
                actions={{
                  syncTelegram: {
                    onClick: () => void refreshTelegramStatus()
                  },
                  refreshYouTube: {
                    onClick: () => void refreshYouTubeStatus()
                  },
                  connectYouTube: {
                    onClick: () => void connectYouTube(),
                    disabled: !youtubeOAuthClientId.trim()
                  },
                  disconnectYouTube: {
                    onClick: () => void disconnectYouTube(),
                    disabled: !youTubeAuthStatus?.connected
                  },
                  chooseVideoFile: {
                    onClick: () => void handleChooseVideoFile()
                  },
                  chooseThumbnailFile: {
                    onClick: () => void handleChooseThumbnailFile()
                  },
                  uploadLastPackage: {
                    onClick: () => void handleUploadLastPackage(),
                    disabled:
                      !youTubeAuthStatus?.connected ||
                      !activePackagePath ||
                      !youtubeVideoFilePath.trim()
                  }
                }}
                statuses={{
                  savedMessage: {
                    value: savedMessage || (isKorean ? "수정 후 워크플로 설정을 저장하세요." : "Save workflow config after edits.")
                  },
                  telegramQuickStart: {
                    value: "텔레그램에서 /help 또는 /shortlist 를 보내면 시작할 수 있습니다."
                  },
                  telegramMessage: {
                    value:
                      telegramStatus?.message ??
                      (isKorean
                        ? "텔레그램 제어 상태가 여기에 표시됩니다."
                        : "Telegram control status will appear here.")
                  },
                  telegramTransport: {
                    value: telegramStatus?.state ?? (isKorean ? "대기 중" : "idle")
                  },
                  youtubeState: {
                    value: youTubeAuthStatus?.connected
                      ? isKorean
                        ? "연결됨"
                        : "connected"
                      : isKorean
                        ? "연결 안 됨"
                        : "not connected",
                    tone: youTubeAuthStatus?.connected ? "default" : "warning"
                  },
                  selectedVideoFile: {
                    value: youtubeVideoFilePath || (isKorean ? "아직 선택한 영상이 없습니다" : "No video selected yet"),
                    tone: youtubeVideoFilePath ? "default" : "warning"
                  },
                  selectedThumbnailFile: {
                    value: youtubeThumbnailFilePath || (isKorean ? "선택한 썸네일이 없습니다" : "No thumbnail selected"),
                    tone: "default"
                  },
                  latestPackage: {
                    value: activePackagePath ?? (isKorean ? "아직 생성되지 않음" : "Not created yet")
                  },
                  uploadRequestStatus: {
                    value: youTubeUploadRequest
                      ? `${youTubeUploadRequest.status} ${
                          youTubeUploadRequest.videoFilePath
                            ? isKorean
                              ? "· 영상 경로 설정됨"
                              : "· video path set"
                            : isKorean
                              ? "· 영상 경로 없음"
                              : "· video path missing"
                        }`
                      : isKorean
                        ? "불러온 업로드 요청이 없습니다"
                        : "No upload request loaded yet",
                    tone:
                      !youTubeUploadRequest || youTubeUploadRequest.videoFilePath
                        ? "default"
                        : "warning"
                  },
                  lastUpload: {
                    value: lastYouTubeUploadResult
                      ? lastYouTubeUploadResult.ok
                        ? isKorean
                          ? "업로드가 완료되었습니다. 최신 패키지가 유튜브에 게시되었습니다."
                          : "Upload complete. The latest package is now on YouTube."
                        : lastYouTubeUploadResult.message
                      : youTubeAuthStatus?.message ??
                        (isKorean
                          ? "이 워크플로가 게시를 필요로 할 때 여기서 유튜브를 연결하세요."
                          : "Connect YouTube here when this workflow needs publishing."),
                    tone:
                      lastYouTubeUploadResult && !lastYouTubeUploadResult.ok
                        ? "warning"
                        : "default",
                    href: lastYouTubeUploadResult?.videoUrl,
                    linkLabel: isKorean ? "업로드한 영상 열기" : "Open uploaded video"
                  },
                  instagramState: {
                    value: isKorean ? "전송 커넥터 준비 중" : "delivery connector coming soon",
                    tone: "warning"
                  }
                }}
              />

              <div className="manual-install-box">
                <strong>{isKorean ? "연결된 마켓 모듈" : "Marketplace links"}</strong>
                <div className="tag-row">
                  {catalog
                    .filter((item) => item.workflow?.ids?.includes(workflow.id))
                    .map((item) => {
                      const installedRecord = installed.find(
                        (installedItem) => installedItem.id === item.id
                      );
                      const stateLabel = installedRecord
                        ? installedRecord.runtime.status === "running"
                          ? isKorean
                            ? "실행 중"
                            : "running"
                          : isKorean
                            ? "설치됨"
                            : "installed"
                        : item.availability?.state === "coming_soon"
                          ? isKorean
                            ? "준비 중"
                            : "coming soon"
                          : isKorean
                            ? "사용 가능"
                            : "available";

                      return (
                        <span key={item.id} className="tag">
                          {item.name} {"\u00b7"} {stateLabel}
                        </span>
                      );
                    })}
                </div>
                <p className="subtle">
                  {isKorean
                    ? "같은 workflow id를 선언한 마켓 모듈이 있으면 이 워크플로가 활성화됩니다."
                    : "This workflow lights up from marketplace items that declare the same workflow id."}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="manual-install-box">
            <strong>{isKorean ? "아직 감지된 워크플로 묶음이 없습니다" : "No workflow stack detected yet"}</strong>
            <p className="subtle">
              {isKorean
                ? "호환되는 팩이나 자동화 MCP 묶음을 설치하면 이 영역이 활성화됩니다."
                : "Install a compatible Pack or automation MCP set to light up this area."}
            </p>
          </div>
        )}

        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSaveWorkflowConfig()}
          >
            {isKorean ? "워크플로 설정 저장" : "Save Workflow Config"}
          </button>
        </div>
      </div>

      <div className="grid">
        {sortedInstalled.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-row">
              <div>
                <h3>{item.id}</h3>
                <p className="subtle">{copy.version} {item.version}</p>
              </div>
              <button
                type="button"
                className={selectedMcpLogId === item.id ? "pill-button active" : "pill-button"}
                onClick={() => selectMcpLog(item.id)}
              >
                {item.runtime.status}
              </button>
            </div>
            {(item.installState === "downloading" ||
              item.installState === "updating" ||
              item.installState === "error") && (
              <div className="manual-install-box">
                <strong>
                  {item.installState === "downloading"
                    ? isKorean
                      ? "설치 패키지를 준비하는 중입니다"
                      : "Preparing installation package"
                    : item.installState === "updating"
                      ? isKorean
                        ? "최신 패키지로 갱신하는 중입니다"
                        : "Refreshing to the latest package"
                      : isKorean
                        ? "복구가 필요한 항목입니다"
                        : "This item needs attention"}
                </strong>
                <span className="subtle">
                  {item.installState === "error"
                    ? item.lastError ?? (isKorean ? "다시 확인 또는 재설치를 시도해 주세요." : "Try rechecking or reinstalling this item.")
                    : item.installState === "downloading"
                      ? isKorean
                        ? "원격 패키지를 내려받고 검증한 뒤 로컬 워크플로에 반영합니다."
                        : "The remote package is being downloaded, verified, and prepared for local use."
                      : isKorean
                        ? "로컬 사본을 최신 빌드에 맞춰 다시 쓰는 중입니다."
                        : "Your local copy is being rewritten against the newest build."}
                </span>
              </div>
            )}
            <div className="meta-list">
              <div className="meta-item">
                <span>{copy.enabled}</span>
                <strong>{item.enabled ? (isKorean ? "예" : "Yes") : isKorean ? "아니오" : "No"}</strong>
              </div>
              <div className="meta-item">
                <span>{isKorean ? "설치 상태" : "Install state"}</span>
                <strong>{item.installState}</strong>
              </div>
              {composition.issues.some((issue) => issue.mcpId === item.id) && (
                <div className="meta-item">
                  <span>{isKorean ? "호환성" : "Compatibility"}</span>
                  <strong className="warning-text">
                    {isKorean ? "추가 워크플로 모듈이 필요합니다" : "Needs more workflow pieces"}
                  </strong>
                </div>
              )}
              <div className="meta-item">
                <span>{copy.installPath}</span>
                <code className="meta-code">{item.installPath}</code>
              </div>
              <div className="meta-item">
                <span>{copy.entrypoint}</span>
                <code className="meta-code">{item.entrypoint ?? "-"}</code>
              </div>
            </div>
            <div className="button-row">
              <button
                type="button"
                className={item.runtime.status === "running" ? "secondary-button" : "primary-button"}
                onClick={() => void startMcp(item.id)}
              >
                {isKorean ? "시작" : "Start"}
              </button>
              <button type="button" className="secondary-button" onClick={() => void stopMcp(item.id)}>
                {isKorean ? "중지" : "Stop"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void (item.enabled ? disableMcp(item.id) : enableMcp(item.id))}
              >
                {item.enabled ? copy.disable : copy.enable}
              </button>
              <button type="button" className="danger-button" onClick={() => void uninstallMcp(item.id)}>
                {copy.remove}
              </button>
            </div>
          </article>
        ))}
      </div>

      <LogPanel
        title={copy.logsTitle}
        output={
          selectedMcpLogId
            ? selectedOutput || copy.noLogs(selectedMcpLogId)
            : copy.selectLogs
        }
      />
    </section>
  );
}
