import { useEffect, useState } from "react";
import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

export function SettingsPage() {
  const {
    settings,
    claudeInstallation,
    claudeDetectionMessage,
    saveSettings,
    detectClaudeInstallation,
    installClaudeCode
  } = useAppStore();
  const [claudeExecutablePath, setClaudeExecutablePath] = useState("");
  const [claudeArgsText, setClaudeArgsText] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [launcherLanguage, setLauncherLanguage] = useState<"en" | "ko">("en");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const copy = getLauncherCopy(launcherLanguage).pages.settings;

  useEffect(() => {
    setClaudeExecutablePath(settings?.claudeExecutablePath ?? "");
    setClaudeArgsText(settings?.claudeArgs?.join(" ") ?? "");
    setApiBaseUrl(settings?.apiBaseUrl ?? "");
    setLauncherLanguage(settings?.launcherLanguage ?? "en");
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setSavedMessage("");

    await saveSettings({
      claudeExecutablePath: claudeExecutablePath.trim() || undefined,
      claudeArgs: claudeArgsText.trim() ? claudeArgsText.trim().split(/\s+/) : [],
      apiBaseUrl: apiBaseUrl.trim() || undefined,
      launcherLanguage
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
            <span>Claude Args</span>
            <input
              className="text-input"
              value={claudeArgsText}
              onChange={(event) => setClaudeArgsText(event.target.value)}
              placeholder="--model sonnet --verbose"
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
        </div>
        <div className="button-row">
          <span className="subtle">
            {claudeDetectionMessage ??
              claudeInstallation?.message ??
              "Workflow-specific configuration now lives in Installed."}
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
          <strong>Workflow Config Has Moved</strong>
          <p className="subtle">
            Telegram, generation provider, and YouTube publishing settings are now managed from the Installed page so automation-specific config stays with the workflow layer.
          </p>
        </div>
      </div>
    </section>
  );
}
