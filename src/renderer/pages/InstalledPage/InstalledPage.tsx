import { useEffect, useState } from "react";
import { useAppStore } from "../../store/app-store";
import { LogPanel } from "../../components/Terminal/LogPanel";
import { getLauncherCopy } from "../../lib/launcher-copy";
import { evaluateMcpComposition } from "../../lib/mcp-composition";
import { WorkflowConfigRenderer } from "../../components/Workflow/WorkflowConfigRenderer";
import { resolveRegisteredWorkflows } from "../../lib/workflow-registry";

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

export function InstalledPage() {
  const {
    catalog,
    installed,
    settings,
    workflowConfig,
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
  const [scriptProvider, setScriptProvider] = useState("openrouter_api");
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [openRouterModel, setOpenRouterModel] = useState("openai/gpt-4o-mini");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [openAiModel, setOpenAiModel] = useState("gpt-5-mini");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramAdminChatId, setTelegramAdminChatId] = useState("");
  const [youtubeChannelLabel, setYoutubeChannelLabel] = useState("");
  const [youtubePrivacyStatus, setYoutubePrivacyStatus] = useState<"private" | "unlisted" | "public">("private");
  const [youtubeCategoryId, setYoutubeCategoryId] = useState("22");
  const [youtubeAudience, setYoutubeAudience] = useState<"not_made_for_kids" | "made_for_kids">("not_made_for_kids");
  const [youtubeOAuthClientId, setYoutubeOAuthClientId] = useState("");
  const [youtubeOAuthClientSecret, setYoutubeOAuthClientSecret] = useState("");
  const [youtubeOAuthRedirectPort, setYoutubeOAuthRedirectPort] = useState("45123");
  const [youtubeVideoFilePath, setYoutubeVideoFilePath] = useState("");
  const [youtubeThumbnailFilePath, setYoutubeThumbnailFilePath] = useState("");
  const [youtubePublishMode, setYoutubePublishMode] = useState<"now" | "scheduled">("now");
  const [youtubeScheduledPublishAt, setYoutubeScheduledPublishAt] = useState("");
  const [showOpenRouterApiKey, setShowOpenRouterApiKey] = useState(false);
  const [showOpenAiApiKey, setShowOpenAiApiKey] = useState(false);
  const [showTelegramBotToken, setShowTelegramBotToken] = useState(false);
  const [showYouTubeClientSecret, setShowYouTubeClientSecret] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    setTrendWindow(workflowConfig?.trendWindow ?? "24h");
    setScriptProvider(workflowConfig?.scriptProvider ?? "openrouter_api");
    setOpenRouterApiKey(workflowConfig?.openRouterApiKey ?? "");
    setOpenRouterModel(workflowConfig?.openRouterModel ?? "openai/gpt-4o-mini");
    setOpenAiApiKey(workflowConfig?.openAiApiKey ?? "");
    setOpenAiModel(workflowConfig?.openAiModel ?? "gpt-5-mini");
    setTelegramBotToken(workflowConfig?.telegramBotToken ?? "");
    setTelegramAdminChatId(workflowConfig?.telegramAdminChatId ?? "");
    setYoutubeChannelLabel(workflowConfig?.youtubeChannelLabel ?? "");
    setYoutubePrivacyStatus(workflowConfig?.youtubePrivacyStatus ?? "private");
    setYoutubeCategoryId(workflowConfig?.youtubeCategoryId ?? "22");
    setYoutubeAudience(workflowConfig?.youtubeAudience ?? "not_made_for_kids");
    setYoutubeOAuthClientId(workflowConfig?.youtubeOAuthClientId ?? "");
    setYoutubeOAuthClientSecret(workflowConfig?.youtubeOAuthClientSecret ?? "");
    setYoutubeOAuthRedirectPort(workflowConfig?.youtubeOAuthRedirectPort ?? "45123");
  }, [workflowConfig]);

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

  const handleSaveWorkflowConfig = async () => {
    setSavedMessage("");
    await saveWorkflowConfig({
      trendWindow,
      scriptProvider:
        scriptProvider === "claude_cli" ||
        scriptProvider === "mock" ||
        scriptProvider === "openai_api"
          ? scriptProvider
          : "openrouter_api",
      openRouterApiKey: openRouterApiKey.trim() || undefined,
      openRouterModel: openRouterModel.trim() || undefined,
      openAiApiKey: openAiApiKey.trim() || undefined,
      openAiModel: openAiModel.trim() || undefined,
      telegramBotToken: telegramBotToken.trim() || undefined,
      telegramAdminChatId: telegramAdminChatId.trim() || undefined,
      youtubeChannelLabel: youtubeChannelLabel.trim() || undefined,
      youtubePrivacyStatus,
      youtubeCategoryId,
      youtubeAudience,
      youtubeOAuthClientId: youtubeOAuthClientId.trim() || undefined,
      youtubeOAuthClientSecret: youtubeOAuthClientSecret.trim() || undefined,
      youtubeOAuthRedirectPort: youtubeOAuthRedirectPort.trim() || undefined
    });
    setSavedMessage("Workflow config saved.");
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
    setSavedMessage("Upload request saved.");
  };

  const handleChooseVideoFile = async () => {
    if (!telegramStatus?.lastPackagePath) {
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
    setSavedMessage("Video file selected.");
  };

  const handleChooseThumbnailFile = async () => {
    if (!telegramStatus?.lastPackagePath) {
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
    setSavedMessage("Thumbnail file selected.");
  };

  const handleUploadLastPackage = async () => {
    if (!telegramStatus?.lastPackagePath) {
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

  const selectedOutput = selectedMcpLogId ? mcpOutputById[selectedMcpLogId] ?? "" : "";
  const sortedInstalled = [...installed].sort((left, right) => {
    const leftScore =
      (left.runtime.status === "running" ? 20 : 0) +
      (left.enabled ? 10 : 0);
    const rightScore =
      (right.runtime.status === "running" ? 20 : 0) +
      (right.enabled ? 10 : 0);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return left.id.localeCompare(right.id);
  });

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="subtle">{copy.subtitle}</p>
        </div>
      </div>

      {composition.issues.length > 0 && (
        <div className="manual-install-box">
          <strong>Composition Check</strong>
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
            <p className="eyebrow">Installed Workflow Config</p>
            <h3>{resolvedWorkflows[0]?.schema.title ?? "Workflow Stack"}</h3>
          </div>
          <span className="pill">{workflowConfig?.scriptProvider ?? "openrouter_api"}</span>
        </div>
        <p className="subtle">
          {resolvedWorkflows[0]?.schema.description ??
            "Workflow-specific configuration will appear here when compatible packs or MCPs are installed."}
        </p>

        {resolvedWorkflows.length > 0 ? (
          resolvedWorkflows.map((workflow) => (
            <div key={workflow.id} className="workflow-stack-block">
              <WorkflowConfigRenderer
                schema={workflow.schema}
                fields={{
                  trendWindow: {
                    value: trendWindow,
                    onChange: (value) => setTrendWindow(value as "24h" | "3d")
                  },
                  scriptProvider: {
                    value: scriptProvider,
                    onChange: setScriptProvider
                  },
                  openRouterApiKey: {
                    value: openRouterApiKey,
                    onChange: setOpenRouterApiKey,
                    visible: showOpenRouterApiKey,
                    onToggleVisibility: () => setShowOpenRouterApiKey((value) => !value)
                  },
                  openRouterModel: {
                    value: openRouterModel,
                    onChange: setOpenRouterModel
                  },
                  openAiApiKey: {
                    value: openAiApiKey,
                    onChange: setOpenAiApiKey,
                    visible: showOpenAiApiKey,
                    onToggleVisibility: () => setShowOpenAiApiKey((value) => !value)
                  },
                  openAiModel: {
                    value: openAiModel,
                    onChange: setOpenAiModel
                  },
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
                  youtubeOAuthClientId: {
                    value: youtubeOAuthClientId,
                    onChange: setYoutubeOAuthClientId
                  },
                  youtubeOAuthClientSecret: {
                    value: youtubeOAuthClientSecret,
                    onChange: setYoutubeOAuthClientSecret,
                    visible: showYouTubeClientSecret,
                    onToggleVisibility: () => setShowYouTubeClientSecret((value) => !value)
                  },
                  youtubeOAuthRedirectPort: {
                    value: youtubeOAuthRedirectPort,
                    onChange: setYoutubeOAuthRedirectPort
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
                      !telegramStatus?.lastPackagePath ||
                      !youtubeVideoFilePath.trim()
                  }
                }}
                statuses={{
                  savedMessage: {
                    value: savedMessage || "Save workflow config after edits."
                  },
                  telegramQuickStart: {
                    value: "텔레그램에서 /help 또는 /shortlist 를 보내면 시작할 수 있습니다."
                  },
                  telegramMessage: {
                    value:
                      telegramStatus?.message ?? "Telegram control status will appear here."
                  },
                  telegramTransport: {
                    value: telegramStatus?.state ?? "idle"
                  },
                  youtubeState: {
                    value: youTubeAuthStatus?.connected ? "connected" : "not connected",
                    tone: youTubeAuthStatus?.connected ? "default" : "warning"
                  },
                  selectedVideoFile: {
                    value: youtubeVideoFilePath || "No video selected yet",
                    tone: youtubeVideoFilePath ? "default" : "warning"
                  },
                  selectedThumbnailFile: {
                    value: youtubeThumbnailFilePath || "No thumbnail selected",
                    tone: "default"
                  },
                  latestPackage: {
                    value: telegramStatus?.lastPackagePath ?? "Not created yet"
                  },
                  uploadRequestStatus: {
                    value: youTubeUploadRequest
                      ? `${youTubeUploadRequest.status} ${youTubeUploadRequest.videoFilePath ? "· video path set" : "· video path missing"}`
                      : "No upload request loaded yet",
                    tone:
                      !youTubeUploadRequest || youTubeUploadRequest.videoFilePath
                        ? "default"
                        : "warning"
                  },
                  lastUpload: {
                    value: lastYouTubeUploadResult
                      ? lastYouTubeUploadResult.ok
                        ? "Upload complete. The latest package is now on YouTube."
                        : lastYouTubeUploadResult.message
                      : youTubeAuthStatus?.message ??
                        "Connect YouTube here when this workflow needs publishing.",
                    tone:
                      lastYouTubeUploadResult && !lastYouTubeUploadResult.ok
                        ? "warning"
                        : "default",
                    href: lastYouTubeUploadResult?.videoUrl,
                    linkLabel: "Open uploaded video"
                  },
                  instagramState: {
                    value: "delivery connector coming soon",
                    tone: "warning"
                  }
                }}
              />

              <div className="manual-install-box">
                <strong>Marketplace links</strong>
                <div className="tag-row">
                  {catalog
                    .filter((item) => item.workflow?.ids?.includes(workflow.id))
                    .map((item) => {
                      const installedRecord = installed.find(
                        (installedItem) => installedItem.id === item.id
                      );
                      const stateLabel = installedRecord
                        ? installedRecord.runtime.status === "running"
                          ? "running"
                          : "installed"
                        : item.availability?.state === "coming_soon"
                          ? "coming soon"
                          : "available";

                      return (
                        <span key={item.id} className="tag">
                          {item.name} {"\u00b7"} {stateLabel}
                        </span>
                      );
                    })}
                </div>
                <p className="subtle">
                  This workflow lights up from marketplace items that declare the same workflow id.
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="manual-install-box">
            <strong>No workflow stack detected yet</strong>
            <p className="subtle">
              Install a compatible Pack or automation MCP set to light up this area.
            </p>
          </div>
        )}

        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSaveWorkflowConfig()}
          >
            Save Workflow Config
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
            <div className="meta-list">
              <div className="meta-item">
                <span>{copy.enabled}</span>
                <strong>{item.enabled ? "Yes" : "No"}</strong>
              </div>
              {composition.issues.some((issue) => issue.mcpId === item.id) && (
                <div className="meta-item">
                  <span>Compatibility</span>
                  <strong className="warning-text">Needs more workflow pieces</strong>
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
                Start
              </button>
              <button type="button" className="secondary-button" onClick={() => void stopMcp(item.id)}>
                Stop
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
