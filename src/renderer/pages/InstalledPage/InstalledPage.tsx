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
    setSavedMessage(isKorean ? "영상 파일을 선택했습니다." : "Video file selected.");
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
    setSavedMessage(isKorean ? "썸네일 파일을 선택했습니다." : "Thumbnail file selected.");
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
          <span className="pill">{workflowConfig?.scriptProvider ?? "openrouter_api"}</span>
        </div>
        <p className="subtle">
          {resolvedWorkflows[0]?.schema.description ??
            (isKorean
              ? "호환되는 팩이나 MCP가 설치되면 워크플로 전용 설정이 이곳에 표시됩니다."
              : "Workflow-specific configuration will appear here when compatible packs or MCPs are installed.")}
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
                    value: telegramStatus?.lastPackagePath ?? (isKorean ? "아직 생성되지 않음" : "Not created yet")
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
            <div className="meta-list">
              <div className="meta-item">
                <span>{copy.enabled}</span>
                <strong>{item.enabled ? (isKorean ? "예" : "Yes") : isKorean ? "아니오" : "No"}</strong>
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
