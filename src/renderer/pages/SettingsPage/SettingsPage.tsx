import { useEffect, useState } from "react";
import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

const OPENROUTER_MODEL_OPTIONS = [
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-3.5-sonnet",
  "google/gemini-2.0-flash-001"
] as const;

const OPENAI_MODEL_OPTIONS = ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"] as const;

export function SettingsPage() {
  const {
    settings,
    telegramStatus,
    claudeInstallation,
    claudeDetectionMessage,
    saveSettings,
    detectClaudeInstallation,
    installClaudeCode,
    refreshTelegramStatus,
    sendMockShortlist
  } = useAppStore();
  const [claudeExecutablePath, setClaudeExecutablePath] = useState("");
  const [claudeArgsText, setClaudeArgsText] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [launcherLanguage, setLauncherLanguage] = useState<"en" | "ko">("en");
  const [trendWindow, setTrendWindow] = useState<"24h" | "3d">("24h");
  const [scriptProvider, setScriptProvider] = useState("openrouter_api");
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [openRouterModel, setOpenRouterModel] = useState("");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [openAiModel, setOpenAiModel] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramAdminChatId, setTelegramAdminChatId] = useState("");
  const [telegramOutputLanguage, setTelegramOutputLanguage] = useState<"en" | "ko">("en");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const selectedProvider = scriptProvider;
  const copy = getLauncherCopy(launcherLanguage).pages.settings;

  useEffect(() => {
    setClaudeExecutablePath(settings?.claudeExecutablePath ?? "");
    setClaudeArgsText(settings?.claudeArgs?.join(" ") ?? "");
    setApiBaseUrl(settings?.apiBaseUrl ?? "");
    setLauncherLanguage(settings?.launcherLanguage ?? "en");
    setTrendWindow(settings?.trendWindow ?? "24h");
    setScriptProvider(settings?.scriptProvider ?? "openrouter_api");
    setOpenRouterApiKey(settings?.openRouterApiKey ?? "");
    setOpenRouterModel(settings?.openRouterModel ?? "openai/gpt-4o-mini");
    setOpenAiApiKey(settings?.openAiApiKey ?? "");
    setOpenAiModel(settings?.openAiModel ?? "gpt-5-mini");
    setTelegramBotToken(settings?.telegramBotToken ?? "");
    setTelegramAdminChatId(settings?.telegramAdminChatId ?? "");
    setTelegramOutputLanguage(settings?.telegramOutputLanguage ?? "en");
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setSavedMessage("");

    await saveSettings({
      claudeExecutablePath: claudeExecutablePath.trim() || undefined,
      claudeArgs: claudeArgsText.trim() ? claudeArgsText.trim().split(/\s+/) : [],
      apiBaseUrl: apiBaseUrl.trim() || undefined,
      launcherLanguage,
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
      telegramOutputLanguage
    });

    setSaving(false);
    setSavedMessage(copy.saved);
  };

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="subtle">{copy.subtitle}</p>
        </div>
      </div>

      <div className="card">
        <div className="settings-row">
          <span>Vault Path</span>
          <code>{settings?.vaultPath ?? "Loading..."}</code>
        </div>
        <div className="settings-row">
          <span>Claude Detected</span>
          <strong>{claudeInstallation?.installed ? "Yes" : "No"}</strong>
        </div>
        <div className="settings-row">
          <span>Detected Path</span>
          <code>{claudeInstallation?.executablePath ?? "Not found"}</code>
        </div>
        <div className="settings-row">
          <span>Auto Update</span>
          <strong>{settings?.autoUpdate ? "Enabled" : "Disabled"}</strong>
        </div>
        <div className="settings-row">
          <span>Launch On Startup</span>
          <strong>{settings?.launchOnStartup ? "Enabled" : "Disabled"}</strong>
        </div>
      </div>

      <div className="card">
        <div className="form-grid">
          <label className="field">
            <span>{copy.launcherLanguage}</span>
            <select
              className="text-input"
              value={launcherLanguage}
              onChange={(event) => setLauncherLanguage(event.target.value as "en" | "ko")}
            >
              <option value="en">{copy.english}</option>
              <option value="ko">{copy.korean}</option>
            </select>
          </label>

          <label className="field">
            <span>Claude Executable Path</span>
            <input
              className="text-input"
              value={claudeExecutablePath}
              onChange={(event) => setClaudeExecutablePath(event.target.value)}
              placeholder="C:\\path\\to\\claude.exe"
            />
          </label>

          <label className="field">
            <span>API Base URL</span>
            <input
              className="text-input"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder="https://api.mellowcat.dev/"
            />
          </label>

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

          {selectedProvider === "openrouter_api" && (
            <>
              <label className="field">
                <span>Provider API Key</span>
                <input
                  className="text-input"
                  value={openRouterApiKey}
                  onChange={(event) => setOpenRouterApiKey(event.target.value)}
                  placeholder="sk-or-v1-..."
                />
              </label>

              <label className="field">
                <span>Provider Model</span>
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

          {selectedProvider === "openai_api" && (
            <>
              <label className="field">
                <span>Provider API Key</span>
                <input
                  className="text-input"
                  value={openAiApiKey}
                  onChange={(event) => setOpenAiApiKey(event.target.value)}
                  placeholder="sk-..."
                />
              </label>

              <label className="field">
                <span>Provider Model</span>
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

          {selectedProvider === "claude_cli" && (
            <label className="field">
              <span>Claude Args</span>
              <input
                className="text-input"
                value={claudeArgsText}
                onChange={(event) => setClaudeArgsText(event.target.value)}
                placeholder="--model sonnet --verbose"
              />
            </label>
          )}

          <label className="field">
            <span>Telegram Bot Token</span>
            <input
              className="text-input"
              value={telegramBotToken}
              onChange={(event) => setTelegramBotToken(event.target.value)}
              placeholder="123456:ABC..."
            />
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
              onChange={(event) =>
                setTelegramOutputLanguage(event.target.value as "en" | "ko")
              }
            >
              <option value="en">English</option>
              <option value="ko">Korean</option>
            </select>
          </label>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving..." : copy.saveSettings}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void detectClaudeInstallation()}
          >
            {copy.detectClaude}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void installClaudeCode()}
            disabled={claudeInstallation ? !claudeInstallation.canAutoInstall : false}
          >
            {copy.installClaudeCode}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refreshTelegramStatus()}
          >
            {copy.syncTelegram}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void sendMockShortlist()}
          >
            {copy.sendTestTrendShortlist}
          </button>
        </div>
        <div className="button-row">
          <span className="subtle">
            {claudeDetectionMessage ??
              claudeInstallation?.message ??
              "Changes apply to new Claude sessions and future API reads."}
          </span>
          <span className="subtle">{savedMessage}</span>
        </div>
        {!claudeInstallation?.canAutoInstall && (
          <div className="manual-install-box">
            <strong>Manual install</strong>
            <code>{claudeInstallation?.manualInstallCommand}</code>
            <a
              className="inline-link"
              href={claudeInstallation?.manualInstallUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open Claude Code install guide
            </a>
          </div>
        )}
        <div className="manual-install-box">
          <strong>Telegram Control</strong>
          <div className="settings-row">
            <span>Configured</span>
            <strong>{telegramStatus?.configured ? "Yes" : "No"}</strong>
          </div>
          <div className="settings-row">
            <span>Transport</span>
            <strong>{telegramStatus?.transport ?? "mock"}</strong>
          </div>
          <div className="settings-row">
            <span>Status</span>
            <strong>{telegramStatus?.state ?? "idle"}</strong>
          </div>
          <div className="settings-row">
            <span>Last Callback</span>
            <code>{telegramStatus?.lastCallbackData ?? "None yet"}</code>
          </div>
          <div className="settings-row">
            <span>Last Draft Source</span>
            <code>{telegramStatus?.lastDraftSource ?? "None yet"}</code>
          </div>
          <div className="settings-row">
            <span>Last Draft Error</span>
            <code>{telegramStatus?.lastDraftError ?? "None"}</code>
          </div>
          <div className="settings-row">
            <span>Last Package Path</span>
            <code>{telegramStatus?.lastPackagePath ?? "Not created yet"}</code>
          </div>
          {telegramStatus?.trendSourceDebug?.map((item) => (
            <div key={item.sourceId} className="settings-row">
              <span>{item.sourceId}</span>
              <code>
                {item.count} ({item.status}
                {item.message ? `, ${item.message}` : ""})
              </code>
            </div>
          ))}
          <p className="subtle">
            {telegramStatus?.message ??
              "Add Telegram settings, then use mock shortlist while the real bot transport is being wired in."}
          </p>
          <p className="subtle">
            {copy.realFlowHint}
          </p>
        </div>
      </div>
    </section>
  );
}
