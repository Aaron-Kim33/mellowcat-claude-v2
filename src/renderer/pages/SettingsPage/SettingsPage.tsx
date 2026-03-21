import { useEffect, useState } from "react";
import { useAppStore } from "../../store/app-store";

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
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    setClaudeExecutablePath(settings?.claudeExecutablePath ?? "");
    setClaudeArgsText(settings?.claudeArgs?.join(" ") ?? "");
    setApiBaseUrl(settings?.apiBaseUrl ?? "");
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setSavedMessage("");

    await saveSettings({
      claudeExecutablePath: claudeExecutablePath.trim() || undefined,
      claudeArgs: claudeArgsText.trim() ? claudeArgsText.trim().split(/\s+/) : [],
      apiBaseUrl: apiBaseUrl.trim() || undefined
    });

    setSaving(false);
    setSavedMessage("Saved");
  };

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Launcher defaults</h2>
          <p className="subtle">Settings are stored through a repository layer so this can move from local JSON to a richer storage system later.</p>
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
            {saving ? "Saving..." : "Save Settings"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void detectClaudeInstallation()}
          >
            Detect Claude
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void installClaudeCode()}
            disabled={claudeInstallation ? !claudeInstallation.canAutoInstall : false}
          >
            Install Claude Code
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
      </div>
    </section>
  );
}
