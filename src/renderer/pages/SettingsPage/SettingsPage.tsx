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
  const isKorean = launcherLanguage === "ko";

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
          <span>{isKorean ? "Vault 경로" : "Vault Path"}</span>
          <code>{settings?.vaultPath ?? (isKorean ? "불러오는 중..." : "Loading...")}</code>
        </div>
        <div className="settings-row">
          <span>{isKorean ? "Claude 감지 여부" : "Claude Detected"}</span>
          <strong>{claudeInstallation?.installed ? (isKorean ? "예" : "Yes") : isKorean ? "아니오" : "No"}</strong>
        </div>
        <div className="settings-row">
          <span>{isKorean ? "감지된 경로" : "Detected Path"}</span>
          <code>{claudeInstallation?.executablePath ?? (isKorean ? "찾지 못함" : "Not found")}</code>
        </div>
        <div className="settings-row">
          <span>{isKorean ? "자동 업데이트" : "Auto Update"}</span>
          <strong>{settings?.autoUpdate ? (isKorean ? "사용" : "Enabled") : isKorean ? "사용 안 함" : "Disabled"}</strong>
        </div>
        <div className="settings-row">
          <span>{isKorean ? "시작 프로그램 실행" : "Launch On Startup"}</span>
          <strong>{settings?.launchOnStartup ? (isKorean ? "사용" : "Enabled") : isKorean ? "사용 안 함" : "Disabled"}</strong>
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
            <span>{isKorean ? "Claude 실행 파일 경로" : "Claude Executable Path"}</span>
            <input
              className="text-input"
              value={claudeExecutablePath}
              onChange={(event) => setClaudeExecutablePath(event.target.value)}
              placeholder="C:\\path\\to\\claude.exe"
            />
          </label>

          <label className="field">
            <span>{isKorean ? "Claude 실행 인자" : "Claude Args"}</span>
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
            <span className="subtle">
              {isKorean
                ? "백엔드 없이 원격 카탈로그와 구매 흐름을 확인하려면 `mock://remote`를 사용하세요."
                : "Use `mock://remote` to preview remote catalog and purchase flows without a backend."}
            </span>
          </label>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (isKorean ? "저장 중..." : "Saving...") : copy.saveSettings}
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
              (isKorean
                ? "워크플로 전용 설정은 이제 설치됨 탭에서 관리합니다."
                : "Workflow-specific configuration now lives in Installed.")}
          </span>
          <span className="subtle">{savedMessage}</span>
        </div>
        {!claudeInstallation?.canAutoInstall && (
          <div className="manual-install-box">
            <strong>{isKorean ? "수동 설치" : "Manual install"}</strong>
            <code>{claudeInstallation?.manualInstallCommand}</code>
            <a
              className="inline-link"
              href={claudeInstallation?.manualInstallUrl}
              target="_blank"
              rel="noreferrer"
            >
              {isKorean ? "Claude Code 설치 안내 열기" : "Open Claude Code install guide"}
            </a>
          </div>
        )}
        <div className="manual-install-box">
          <strong>{isKorean ? "워크플로 설정 위치가 바뀌었습니다" : "Workflow Config Has Moved"}</strong>
          <p className="subtle">
            {isKorean
              ? "텔레그램, 생성 모델, 유튜브 게시 설정은 이제 설치됨 탭에서 관리합니다. 자동화별 설정을 워크플로 계층에 모아두기 위해서입니다."
              : "Telegram, generation provider, and YouTube publishing settings are now managed from the Installed page so automation-specific config stays with the workflow layer."}
          </p>
        </div>
      </div>
    </section>
  );
}
