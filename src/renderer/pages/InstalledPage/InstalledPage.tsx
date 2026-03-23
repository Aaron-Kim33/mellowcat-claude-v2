import { useEffect, useState } from "react";
import { useAppStore } from "../../store/app-store";
import { LogPanel } from "../../components/Terminal/LogPanel";
import { getLauncherCopy } from "../../lib/launcher-copy";
import { evaluateMcpComposition } from "../../lib/mcp-composition";

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

export function InstalledPage() {
  const {
    installed,
    settings,
    workflowConfig,
    telegramStatus,
    youTubeAuthStatus,
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
    disconnectYouTube
  } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.installed;
  const composition = evaluateMcpComposition(installed.map((item) => item.id));
  const [trendWindow, setTrendWindow] = useState<"24h" | "3d">("24h");
  const [scriptProvider, setScriptProvider] = useState("openrouter_api");
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [openRouterModel, setOpenRouterModel] = useState("openai/gpt-4o-mini");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [openAiModel, setOpenAiModel] = useState("gpt-5-mini");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramAdminChatId, setTelegramAdminChatId] = useState("");
  const [telegramOutputLanguage, setTelegramOutputLanguage] = useState<"en" | "ko">("en");
  const [youtubeChannelLabel, setYoutubeChannelLabel] = useState("");
  const [youtubePrivacyStatus, setYoutubePrivacyStatus] = useState<"private" | "unlisted" | "public">("private");
  const [youtubeCategoryId, setYoutubeCategoryId] = useState("22");
  const [youtubeAudience, setYoutubeAudience] = useState<"not_made_for_kids" | "made_for_kids">("not_made_for_kids");
  const [youtubeOAuthClientId, setYoutubeOAuthClientId] = useState("");
  const [youtubeOAuthClientSecret, setYoutubeOAuthClientSecret] = useState("");
  const [youtubeOAuthRedirectPort, setYoutubeOAuthRedirectPort] = useState("45123");
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
    setTelegramOutputLanguage(workflowConfig?.telegramOutputLanguage ?? "en");
    setYoutubeChannelLabel(workflowConfig?.youtubeChannelLabel ?? "");
    setYoutubePrivacyStatus(workflowConfig?.youtubePrivacyStatus ?? "private");
    setYoutubeCategoryId(workflowConfig?.youtubeCategoryId ?? "22");
    setYoutubeAudience(workflowConfig?.youtubeAudience ?? "not_made_for_kids");
    setYoutubeOAuthClientId(workflowConfig?.youtubeOAuthClientId ?? "");
    setYoutubeOAuthClientSecret(workflowConfig?.youtubeOAuthClientSecret ?? "");
    setYoutubeOAuthRedirectPort(workflowConfig?.youtubeOAuthRedirectPort ?? "45123");
  }, [workflowConfig]);

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
      telegramOutputLanguage,
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
            <h3>Shortform Automation Stack</h3>
          </div>
          <span className="pill">{workflowConfig?.scriptProvider ?? "openrouter_api"}</span>
        </div>
        <p className="subtle">
          Manage Telegram, generation, and YouTube delivery settings here so automation-specific config stays with the workflow layer, not global app settings.
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Trend Window</span>
            <select
              className="text-input"
              value={trendWindow}
              onChange={(event) => setTrendWindow(event.target.value as "24h" | "3d")}
            >
              <option value="24h">Recent 24 hours</option>
              <option value="3d">Recent 3 days</option>
            </select>
          </label>

          <label className="field">
            <span>Script Provider</span>
            <select
              className="text-input"
              value={scriptProvider}
              onChange={(event) => setScriptProvider(event.target.value)}
            >
              <option value="openrouter_api">OpenRouter</option>
              <option value="openai_api">OpenAI</option>
              <option value="claude_cli">Claude CLI</option>
              <option value="mock">Mock</option>
            </select>
          </label>

          {scriptProvider === "openrouter_api" && (
            <>
              <label className="field">
                <span>OpenRouter API Key</span>
                <div className="secret-input">
                  <input
                    className="text-input"
                    type={showOpenRouterApiKey ? "text" : "password"}
                    value={openRouterApiKey}
                    onChange={(event) => setOpenRouterApiKey(event.target.value)}
                    placeholder="sk-or-v1-..."
                  />
                  <button
                    type="button"
                    className="secret-toggle"
                    onClick={() => setShowOpenRouterApiKey((value) => !value)}
                  >
                    {showOpenRouterApiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <label className="field">
                <span>OpenRouter Model</span>
                <select
                  className="text-input"
                  value={openRouterModel}
                  onChange={(event) => setOpenRouterModel(event.target.value)}
                >
                  {OPENROUTER_MODEL_OPTIONS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {scriptProvider === "openai_api" && (
            <>
              <label className="field">
                <span>OpenAI API Key</span>
                <div className="secret-input">
                  <input
                    className="text-input"
                    type={showOpenAiApiKey ? "text" : "password"}
                    value={openAiApiKey}
                    onChange={(event) => setOpenAiApiKey(event.target.value)}
                    placeholder="sk-..."
                  />
                  <button
                    type="button"
                    className="secret-toggle"
                    onClick={() => setShowOpenAiApiKey((value) => !value)}
                  >
                    {showOpenAiApiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <label className="field">
                <span>OpenAI Model</span>
                <select
                  className="text-input"
                  value={openAiModel}
                  onChange={(event) => setOpenAiModel(event.target.value)}
                >
                  {OPENAI_MODEL_OPTIONS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="field">
            <span>Telegram Bot Token</span>
            <div className="secret-input">
              <input
                className="text-input"
                type={showTelegramBotToken ? "text" : "password"}
                value={telegramBotToken}
                onChange={(event) => setTelegramBotToken(event.target.value)}
                placeholder="123456:ABC..."
              />
              <button
                type="button"
                className="secret-toggle"
                onClick={() => setShowTelegramBotToken((value) => !value)}
              >
                {showTelegramBotToken ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label className="field">
            <span>Telegram Admin Chat ID</span>
            <input
              className="text-input"
              value={telegramAdminChatId}
              onChange={(event) => setTelegramAdminChatId(event.target.value)}
              placeholder="123456789"
            />
          </label>

          <label className="field">
            <span>Telegram Output Language</span>
            <select
              className="text-input"
              value={telegramOutputLanguage}
              onChange={(event) => setTelegramOutputLanguage(event.target.value as "en" | "ko")}
            >
              <option value="en">English</option>
              <option value="ko">Korean</option>
            </select>
          </label>

          <label className="field">
            <span>YouTube Channel Label</span>
            <input
              className="text-input"
              value={youtubeChannelLabel}
              onChange={(event) => setYoutubeChannelLabel(event.target.value)}
              placeholder="Main Shorts Channel"
            />
          </label>

          <label className="field">
            <span>YouTube Privacy</span>
            <select
              className="text-input"
              value={youtubePrivacyStatus}
              onChange={(event) =>
                setYoutubePrivacyStatus(
                  event.target.value as "private" | "unlisted" | "public"
                )
              }
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </label>

          <label className="field">
            <span>YouTube Category</span>
            <select
              className="text-input"
              value={youtubeCategoryId}
              onChange={(event) => setYoutubeCategoryId(event.target.value)}
            >
              {YOUTUBE_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>YouTube Audience</span>
            <select
              className="text-input"
              value={youtubeAudience}
              onChange={(event) =>
                setYoutubeAudience(
                  event.target.value as "not_made_for_kids" | "made_for_kids"
                )
              }
            >
              <option value="not_made_for_kids">Not made for kids</option>
              <option value="made_for_kids">Made for kids</option>
            </select>
          </label>

          <label className="field">
            <span>YouTube OAuth Client ID</span>
            <input
              className="text-input"
              value={youtubeOAuthClientId}
              onChange={(event) => setYoutubeOAuthClientId(event.target.value)}
              placeholder="1234567890-xxxx.apps.googleusercontent.com"
            />
          </label>

          <label className="field">
            <span>YouTube OAuth Client Secret</span>
            <div className="secret-input">
              <input
                className="text-input"
                type={showYouTubeClientSecret ? "text" : "password"}
                value={youtubeOAuthClientSecret}
                onChange={(event) => setYoutubeOAuthClientSecret(event.target.value)}
                placeholder="GOCSPX-..."
              />
              <button
                type="button"
                className="secret-toggle"
                onClick={() => setShowYouTubeClientSecret((value) => !value)}
              >
                {showYouTubeClientSecret ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label className="field">
            <span>YouTube Redirect Port</span>
            <input
              className="text-input"
              value={youtubeOAuthRedirectPort}
              onChange={(event) => setYoutubeOAuthRedirectPort(event.target.value)}
              placeholder="45123"
            />
          </label>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSaveWorkflowConfig()}
          >
            Save Workflow Config
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refreshTelegramStatus()}
          >
            Sync Telegram
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refreshYouTubeStatus()}
          >
            Refresh YouTube
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void connectYouTube()}
            disabled={!youtubeOAuthClientId.trim()}
          >
            Connect YouTube
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => void disconnectYouTube()}
            disabled={!youTubeAuthStatus?.connected}
          >
            Disconnect YouTube
          </button>
        </div>

        <div className="button-row">
          <span className="subtle">{savedMessage}</span>
          <span className="subtle">
            {telegramStatus?.message ?? "Telegram control status will appear here."}
          </span>
        </div>

        <div className="manual-install-box">
          <strong>Automation Transports</strong>
          <div className="settings-row">
            <span>Telegram</span>
            <code>{telegramStatus?.state ?? "idle"}</code>
          </div>
          <div className="settings-row">
            <span>YouTube</span>
            <code>{youTubeAuthStatus?.connected ? "connected" : "not connected"}</code>
          </div>
          <p className="subtle">
            {youTubeAuthStatus?.message ??
              "Connect YouTube here when this workflow needs publishing."}
          </p>
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
