import { ClaudeTerminal } from "../../components/Terminal/ClaudeTerminal";
import { getLauncherCopy } from "../../lib/launcher-copy";
import { useAppStore } from "../../store/app-store";

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
  const isKorean = settings?.launcherLanguage === "ko";
  const hasClaudePath = Boolean(settings?.claudeExecutablePath?.trim()) || claudeInstallation?.installed;
  const claudeArgsText = settings?.claudeArgs?.length ? settings.claudeArgs.join(" ") : isKorean ? "(없음)" : "(none)";
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
            {isKorean ? "세션 시작" : "Start Session"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => claudeSession && void stopClaude(claudeSession.id)}
            disabled={!claudeSession}
          >
            {isKorean ? "세션 종료" : "Stop Session"}
          </button>
          <button type="button" className="secondary-button" onClick={() => resetClaudeSession()}>
            {isKorean ? "화면 초기화" : "Reset View"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void detectClaudeInstallation()}
          >
            {isKorean ? "Claude 찾기" : "Detect Claude"}
          </button>
          {!claudeInstallation?.installed && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void installClaudeCode()}
              disabled={claudeInstallation ? !claudeInstallation.canAutoInstall : false}
            >
              {isKorean ? "Claude Code 설치" : "Install Claude Code"}
            </button>
          )}
        </div>
      </div>

      {!isReady && (
        <div className="card onboarding-card">
          <div className="card-row">
            <div>
              <p className="eyebrow">{isKorean ? "시작 전 확인" : "Getting Started"}</p>
              <h3>{isKorean ? "몇 단계만 마치면 바로 시작할 수 있어요" : "Finish setup in a couple of steps"}</h3>
            </div>
            <span className="pill">{isReady ? (isKorean ? "준비됨" : "Ready") : isKorean ? "설정 필요" : "Setup Needed"}</span>
          </div>
          <div className="onboarding-list">
            <div className="onboarding-item">
              <strong>
                {hasClaudePath
                  ? isKorean
                    ? "1. Claude 준비 완료"
                    : "1. Claude is ready"
                  : isKorean
                    ? "1. Claude Code 경로 설정"
                    : "1. Configure Claude Code"}
              </strong>
              <p className="subtle">
                {hasClaudePath
                  ? isKorean
                    ? "Claude가 감지되었고 이 런처에서 바로 실행할 수 있습니다."
                    : "Claude was detected and can launch from this app."
                  : isKorean
                    ? "Claude Code를 설치하거나 감지한 뒤 설정에서 경로를 확인하세요."
                    : "Install or detect Claude Code, then confirm its path in Settings."}
              </p>
              {!hasClaudePath && (
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void detectClaudeInstallation()}
                  >
                    {isKorean ? "Claude 찾기" : "Detect Claude"}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => onNavigate("settings")}>
                    {isKorean ? "설정 열기" : "Open Settings"}
                  </button>
                </div>
              )}
            </div>

            <div className="onboarding-item">
              <strong>
                {hasAnyInstalledMcp
                  ? isKorean
                    ? "2. MCP 설치 완료"
                    : "2. MCPs are installed"
                  : isKorean
                    ? "2. 첫 MCP 설치"
                    : "2. Install your first MCP"}
              </strong>
              <p className="subtle">
                {hasAnyInstalledMcp
                  ? isKorean
                    ? "이미 Claude 워크플로에 사용할 MCP 패키지가 준비되어 있습니다."
                    : "You already have MCP packages available for Claude workflows."
                  : isKorean
                    ? "마켓에서 MCP 패키지를 하나 이상 설치하면 주요 워크플로를 사용할 수 있습니다."
                    : "Visit the Store and install at least one MCP package to unlock the main workflow."}
              </p>
              {!hasAnyInstalledMcp && (
                <div className="button-row">
                  <button type="button" className="secondary-button" onClick={() => onNavigate("store")}>
                    {isKorean ? "마켓 열기" : "Open Store"}
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
          <strong>{isKorean ? "Claude 상태" : "Status"}</strong>
          <span className="pill">{claudeSession?.status ?? (isKorean ? "대기 중" : "idle")}</span>
        </div>
        <div className="settings-row">
          <span>{isKorean ? "Claude 경로" : "Claude Path"}</span>
          <code>
            {settings?.claudeExecutablePath ??
              claudeInstallation?.executablePath ??
              (isKorean ? "설정되지 않음" : "Not configured")}
          </code>
        </div>
        <div className="settings-row">
          <span>{isKorean ? "Claude 인자" : "Claude Args"}</span>
          <code>{claudeArgsText}</code>
        </div>
        <div className="settings-row">
          <span>{isKorean ? "생성된 MCP 설정" : "Generated MCP Config"}</span>
          <code>{settings?.generatedMcpConfigPath ?? (isKorean ? "사용 불가" : "Unavailable")}</code>
        </div>
        {!hasClaudePath ? (
          <p className="warning-text">
            {isKorean
              ? "Claude Code가 감지되지 않았습니다. 시작 전에 Claude를 찾거나 설치해 주세요."
              : "Claude Code was not detected. Use Detect or Install Claude Code before starting."}
          </p>
        ) : (
          <p className="subtle">
            {isKorean
              ? "세션을 시작한 뒤 아래 터미널 패널에서 바로 작업을 이어가면 됩니다."
              : "Start a session, then type directly inside the terminal panel below."}
          </p>
        )}
        {claudeDetectionMessage && <p className="subtle">{claudeDetectionMessage}</p>}
        {!claudeInstallation?.canAutoInstall && !claudeInstallation?.installed && (
          <div className="manual-install-box">
            <strong>{isKorean ? "수동 설치" : "Manual install"}</strong>
            <code>{claudeInstallation?.manualInstallCommand}</code>
            <a
              className="inline-link"
              href={claudeInstallation?.manualInstallUrl}
              target="_blank"
              rel="noreferrer"
            >
              {isKorean ? "설치 안내 열기" : "Open install guide"}
            </a>
          </div>
        )}
        {claudeSession?.status === "stopped" && (
          <p className="subtle">
            {isKorean
              ? "세션이 종료되었습니다. 새 세션을 시작하거나 화면을 초기화한 뒤 다시 시도하세요."
              : "Session stopped. Start a new session or reset the view before retrying."}
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-row">
          <strong>{isKorean ? "앱 업데이트" : "App Update"}</strong>
          <span className="pill">{appUpdateStatus?.state ?? (isKorean ? "대기 중" : "idle")}</span>
        </div>
        <p className="subtle">
          {appUpdateStatus?.message ??
            (isKorean ? "아직 업데이트 활동이 보고되지 않았습니다." : "No update activity reported yet.")}
        </p>
      </div>

      <div className="card">
        <div className="card-row">
          <strong>{isKorean ? "활성 MCP" : "Active MCPs"}</strong>
          <span className="pill">
            {isKorean
              ? `${runningMcps.length} 실행 중 / ${enabledMcps.length} 활성화`
              : `${runningMcps.length} running / ${enabledMcps.length} enabled`}
          </span>
        </div>
        {enabledMcps.length === 0 ? (
          <p className="subtle">
            {isKorean
              ? "아직 활성화된 MCP가 없습니다. 마켓에서 설치하거나 설치됨 탭에서 활성화하세요."
              : "No MCPs are enabled yet. Install one from Store or enable one from Installed."}
          </p>
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
