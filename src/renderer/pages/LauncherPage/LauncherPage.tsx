import { ClaudeTerminal } from "../../components/Terminal/ClaudeTerminal";
import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

type LauncherPageProps = {
  onNavigate: (tab: "launcher" | "store" | "installed" | "settings" | "login") => void;
};

export function LauncherPage({ onNavigate }: LauncherPageProps) {
  const {
    claudeSession,
    claudeInstallation,
    claudeDetectionMessage,
    appUpdateStatus,
    settings,
    installed,
    startClaude,
    stopClaude,
    resetClaudeSession,
    detectClaudeInstallation,
    installClaudeCode
  } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.launcher;
  const hasClaudePath = Boolean(settings?.claudeExecutablePath?.trim()) || claudeInstallation?.installed;
  const claudeArgsText = settings?.claudeArgs?.length ? settings.claudeArgs.join(" ") : "(none)";
  const enabledMcps = installed.filter((item) => item.enabled);
  const runningMcps = enabledMcps.filter((item) => item.runtime.status === "running");
  const hasAnyInstalledMcp = installed.length > 0;
  const isReady = hasClaudePath && hasAnyInstalledMcp;

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="subtle">{copy.subtitle}</p>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => void startClaude()}
            disabled={!hasClaudePath}
          >
            Start Session
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => claudeSession && void stopClaude(claudeSession.id)}
            disabled={!claudeSession}
          >
            Stop Session
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => resetClaudeSession()}
          >
            Reset View
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void detectClaudeInstallation()}
          >
            Detect Claude
          </button>
          {!claudeInstallation?.installed && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void installClaudeCode()}
              disabled={claudeInstallation ? !claudeInstallation.canAutoInstall : false}
            >
              Install Claude Code
            </button>
          )}
        </div>
      </div>

      {!isReady && (
        <div className="card onboarding-card">
          <div className="card-row">
            <div>
              <p className="eyebrow">Getting Started</p>
              <h3>Finish setup in a couple of steps</h3>
            </div>
            <span className="pill">{isReady ? "Ready" : "Setup Needed"}</span>
          </div>
          <div className="onboarding-list">
            <div className="onboarding-item">
              <strong>{hasClaudePath ? "1. Claude is ready" : "1. Configure Claude Code"}</strong>
              <p className="subtle">
                {hasClaudePath
                  ? "Claude was detected and can launch from this app."
                  : "Install or detect Claude Code, then confirm its path in Settings."}
              </p>
              {!hasClaudePath && (
                <div className="button-row">
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
                    onClick={() => onNavigate("settings")}
                  >
                    Open Settings
                  </button>
                </div>
              )}
            </div>

            <div className="onboarding-item">
              <strong>{hasAnyInstalledMcp ? "2. MCPs are installed" : "2. Install your first MCP"}</strong>
              <p className="subtle">
                {hasAnyInstalledMcp
                  ? "You already have MCP packages available for Claude workflows."
                  : "Visit the Store and install at least one MCP package to unlock the main workflow."}
              </p>
              {!hasAnyInstalledMcp && (
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => onNavigate("store")}
                  >
                    Open Store
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ClaudeTerminal sessionId={claudeSession?.id} />

      <div className="card">
        <div className="card-row">
          <strong>Status</strong>
          <span className="pill">{claudeSession?.status ?? "idle"}</span>
        </div>
        <div className="settings-row">
          <span>Claude Path</span>
          <code>
            {settings?.claudeExecutablePath ??
              claudeInstallation?.executablePath ??
              "Not configured"}
          </code>
        </div>
        <div className="settings-row">
          <span>Claude Args</span>
          <code>{claudeArgsText}</code>
        </div>
        <div className="settings-row">
          <span>Generated MCP Config</span>
          <code>{settings?.generatedMcpConfigPath ?? "Unavailable"}</code>
        </div>
        {!hasClaudePath ? (
          <p className="warning-text">
            Claude Code was not detected. Use Detect or Install Claude Code before starting.
          </p>
        ) : (
          <p className="subtle">Start a session, then type directly inside the terminal panel below.</p>
        )}
        {claudeDetectionMessage && <p className="subtle">{claudeDetectionMessage}</p>}
        {!claudeInstallation?.canAutoInstall && !claudeInstallation?.installed && (
          <div className="manual-install-box">
            <strong>Manual install</strong>
            <code>{claudeInstallation?.manualInstallCommand}</code>
            <a
              className="inline-link"
              href={claudeInstallation?.manualInstallUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open install guide
            </a>
          </div>
        )}
        {claudeSession?.status === "stopped" && (
          <p className="subtle">Session stopped. Start a new session or reset the view before retrying.</p>
        )}
      </div>

      <div className="card">
        <div className="card-row">
          <strong>App Update</strong>
          <span className="pill">{appUpdateStatus?.state ?? "idle"}</span>
        </div>
        <p className="subtle">
          {appUpdateStatus?.message ?? "No update activity reported yet."}
        </p>
      </div>

      <div className="card">
        <div className="card-row">
          <strong>Active MCPs</strong>
          <span className="pill">
            {runningMcps.length} running / {enabledMcps.length} enabled
          </span>
        </div>
        {enabledMcps.length === 0 ? (
          <p className="subtle">No MCPs are enabled yet. Install one from Store or enable one from Installed.</p>
        ) : (
          <div className="tag-row">
            {enabledMcps.map((item) => (
              <span key={item.id} className="tag">
                {item.id} · {item.runtime.status}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
