import { ClaudeTerminal } from "../../components/Terminal/ClaudeTerminal";
import { useAppStore } from "../../store/app-store";

export function LauncherPage() {
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
  const hasClaudePath = Boolean(settings?.claudeExecutablePath?.trim()) || claudeInstallation?.installed;
  const claudeArgsText = settings?.claudeArgs?.length ? settings.claudeArgs.join(" ") : "(none)";
  const enabledMcps = installed.filter((item) => item.enabled);
  const runningMcps = enabledMcps.filter((item) => item.runtime.status === "running");

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">Launcher</p>
          <h2>Claude session control</h2>
          <p className="subtle">Start a local Claude session, stream its output, and prepare to wire in the real engine.</p>
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

      <ClaudeTerminal sessionId={claudeSession?.id} />
    </section>
  );
}
