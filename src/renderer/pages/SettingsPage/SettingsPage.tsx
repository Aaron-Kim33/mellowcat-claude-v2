import { useEffect, useState } from "react";
import { getLauncherCopy } from "../../lib/launcher-copy";
import { getAiModelOptions, getDefaultAiModel } from "../../lib/ai-model-catalog";
import { useAppStore } from "../../store/app-store";

type AiProvider = "claude_cli" | "openrouter_api" | "openai_api" | "mock";

function renderProviderOptions(isKorean: boolean) {
  return (
    <>
      <option value="openrouter_api">OpenRouter</option>
      <option value="openai_api">OpenAI</option>
      <option value="claude_cli">Claude CLI</option>
      <option value="mock">{isKorean ? "테스트용 Mock" : "Mock"}</option>
    </>
  );
}

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

  const [scriptProvider, setScriptProvider] = useState<AiProvider>("openrouter_api");
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [openRouterModel, setOpenRouterModel] = useState("openai/gpt-5.4-mini");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [openAiModel, setOpenAiModel] = useState("gpt-5.4-mini");

  const [secondaryScriptProvider, setSecondaryScriptProvider] =
    useState<AiProvider>("openai_api");
  const [secondaryOpenRouterApiKey, setSecondaryOpenRouterApiKey] = useState("");
  const [secondaryOpenRouterModel, setSecondaryOpenRouterModel] =
    useState("anthropic/claude-sonnet-4.6");
  const [secondaryOpenAiApiKey, setSecondaryOpenAiApiKey] = useState("");
  const [secondaryOpenAiModel, setSecondaryOpenAiModel] = useState("gpt-5.4");
  const [azureSpeechKey, setAzureSpeechKey] = useState("");
  const [azureSpeechRegion, setAzureSpeechRegion] = useState("");
  const [azureSpeechVoice, setAzureSpeechVoice] = useState("ko-KR-SunHiNeural");

  const [showOpenRouterApiKey, setShowOpenRouterApiKey] = useState(false);
  const [showOpenAiApiKey, setShowOpenAiApiKey] = useState(false);
  const [showSecondaryOpenRouterApiKey, setShowSecondaryOpenRouterApiKey] =
    useState(false);
  const [showSecondaryOpenAiApiKey, setShowSecondaryOpenAiApiKey] = useState(false);
  const [showAzureSpeechKey, setShowAzureSpeechKey] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  const copy = getLauncherCopy(launcherLanguage).pages.settings;
  const isKorean = launcherLanguage === "ko";
  const isDeveloperMode =
    settings?.apiBaseUrl?.startsWith("http://127.0.0.1") ||
    settings?.apiBaseUrl?.startsWith("http://localhost") ||
    settings?.apiBaseUrl === "mock://remote";

  useEffect(() => {
    setClaudeExecutablePath(settings?.claudeExecutablePath ?? "");
    setClaudeArgsText(settings?.claudeArgs?.join(" ") ?? "");
    setApiBaseUrl(settings?.apiBaseUrl ?? "");
    setLauncherLanguage(settings?.launcherLanguage ?? "en");

    setScriptProvider(settings?.scriptProvider ?? "openrouter_api");
    setOpenRouterApiKey(settings?.openRouterApiKey ?? "");
    setOpenRouterModel(settings?.openRouterModel ?? "openai/gpt-5.4-mini");
    setOpenAiApiKey(settings?.openAiApiKey ?? "");
    setOpenAiModel(settings?.openAiModel ?? "gpt-5.4-mini");

    setSecondaryScriptProvider(settings?.secondaryScriptProvider ?? "openai_api");
    setSecondaryOpenRouterApiKey(settings?.secondaryOpenRouterApiKey ?? "");
    setSecondaryOpenRouterModel(
      settings?.secondaryOpenRouterModel ?? "anthropic/claude-sonnet-4.6"
    );
    setSecondaryOpenAiApiKey(settings?.secondaryOpenAiApiKey ?? "");
    setSecondaryOpenAiModel(settings?.secondaryOpenAiModel ?? "gpt-5.4");
    setAzureSpeechKey(settings?.azureSpeechKey ?? "");
    setAzureSpeechRegion(settings?.azureSpeechRegion ?? "");
    setAzureSpeechVoice(settings?.azureSpeechVoice ?? "ko-KR-SunHiNeural");
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setSavedMessage("");

    await saveSettings({
      claudeExecutablePath: claudeExecutablePath.trim() || undefined,
      claudeArgs: claudeArgsText.trim() ? claudeArgsText.trim().split(/\s+/) : [],
      apiBaseUrl: apiBaseUrl.trim() || undefined,
      launcherLanguage,
      scriptProvider,
      openRouterApiKey: openRouterApiKey.trim() || undefined,
      openRouterModel: openRouterModel.trim() || undefined,
      openAiApiKey: openAiApiKey.trim() || undefined,
      openAiModel: openAiModel.trim() || undefined,
      secondaryScriptProvider,
      secondaryOpenRouterApiKey: secondaryOpenRouterApiKey.trim() || undefined,
      secondaryOpenRouterModel: secondaryOpenRouterModel.trim() || undefined,
      secondaryOpenAiApiKey: secondaryOpenAiApiKey.trim() || undefined,
      secondaryOpenAiModel: secondaryOpenAiModel.trim() || undefined,
      azureSpeechKey: azureSpeechKey.trim() || undefined,
      azureSpeechRegion: azureSpeechRegion.trim() || undefined,
      azureSpeechVoice: azureSpeechVoice.trim() || undefined
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
          <strong>
            {claudeInstallation?.installed
              ? isKorean
                ? "예"
                : "Yes"
              : isKorean
                ? "아니오"
                : "No"}
          </strong>
        </div>
        <div className="settings-row">
          <span>{isKorean ? "감지된 경로" : "Detected Path"}</span>
          <code>{claudeInstallation?.executablePath ?? (isKorean ? "찾지 못함" : "Not found")}</code>
        </div>
        <div className="settings-row">
          <span>{isKorean ? "자동 업데이트" : "Auto Update"}</span>
          <strong>
            {settings?.autoUpdate
              ? isKorean
                ? "사용"
                : "Enabled"
              : isKorean
                ? "사용 안 함"
                : "Disabled"}
          </strong>
        </div>
        <div className="settings-row">
          <span>{isKorean ? "시작 프로그램 실행" : "Launch On Startup"}</span>
          <strong>
            {settings?.launchOnStartup
              ? isKorean
                ? "사용"
                : "Enabled"
              : isKorean
                ? "사용 안 함"
                : "Disabled"}
          </strong>
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
        </div>
      </div>

      <div className="card">
        <div className="card-row">
          <div>
            <h3>{isKorean ? "전역 AI 연결" : "Global AI Connections"}</h3>
            <p className="subtle">
              {isKorean
                ? "API 키는 여기에서 한 번만 저장하고, 각 슬롯이나 모듈은 이 연결을 참조해서 사용합니다."
                : "Save API keys once here. Slots and modules should reference these connections instead of storing their own keys."}
            </p>
          </div>
        </div>

        <div className="grid">
          <div className="manual-install-box">
            <strong>{isKorean ? "AI 연결 1" : "AI Connection 1"}</strong>
            <div className="form-grid">
              <label className="field">
                <span>{isKorean ? "기본 AI 연결" : "Default AI connection"}</span>
                <select
                  className="text-input"
                  value={scriptProvider}
                  onChange={(event) => {
                    const nextProvider = event.target.value as AiProvider;
                    setScriptProvider(nextProvider);
                    if (nextProvider === "openrouter_api") {
                      setOpenRouterModel(getDefaultAiModel("openrouter_api"));
                    }
                    if (nextProvider === "openai_api") {
                      setOpenAiModel(getDefaultAiModel("openai_api"));
                    }
                  }}
                >
                  {renderProviderOptions(isKorean)}
                </select>
              </label>

              {scriptProvider === "openrouter_api" && (
                <>
                  <label className="field">
                    <span>OpenRouter API Key</span>
                    <div className="secret-input-row">
                      <input
                        className="text-input"
                        type={showOpenRouterApiKey ? "text" : "password"}
                        value={openRouterApiKey}
                        onChange={(event) => setOpenRouterApiKey(event.target.value)}
                        placeholder="sk-or-v1-..."
                      />
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setShowOpenRouterApiKey((value) => !value)}
                      >
                        {showOpenRouterApiKey
                          ? isKorean
                            ? "숨기기"
                            : "Hide"
                          : isKorean
                            ? "보기"
                            : "Show"}
                      </button>
                    </div>
                  </label>
                  <label className="field">
                    <span>{isKorean ? "OpenRouter 모델" : "OpenRouter model"}</span>
                    <select
                      className="text-input"
                      value={openRouterModel}
                      onChange={(event) => setOpenRouterModel(event.target.value)}
                    >
                      {getAiModelOptions("openrouter_api").map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
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
                    <div className="secret-input-row">
                      <input
                        className="text-input"
                        type={showOpenAiApiKey ? "text" : "password"}
                        value={openAiApiKey}
                        onChange={(event) => setOpenAiApiKey(event.target.value)}
                        placeholder="sk-..."
                      />
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setShowOpenAiApiKey((value) => !value)}
                      >
                        {showOpenAiApiKey
                          ? isKorean
                            ? "숨기기"
                            : "Hide"
                          : isKorean
                            ? "보기"
                            : "Show"}
                      </button>
                    </div>
                  </label>
                  <label className="field">
                    <span>{isKorean ? "OpenAI 모델" : "OpenAI model"}</span>
                    <select
                      className="text-input"
                      value={openAiModel}
                      onChange={(event) => setOpenAiModel(event.target.value)}
                    >
                      {getAiModelOptions("openai_api").map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              {scriptProvider === "claude_cli" && (
                <p className="subtle">
                  {isKorean
                    ? "Claude CLI는 감지된 Claude 실행 파일 또는 개발자 설정의 경로를 참조합니다."
                    : "Claude CLI uses the detected Claude executable or the developer override path."}
                </p>
              )}
            </div>
          </div>

          <div className="manual-install-box">
            <strong>{isKorean ? "AI 연결 2" : "AI Connection 2"}</strong>
            <div className="form-grid">
              <label className="field">
                <span>{isKorean ? "보조 AI 연결" : "Secondary AI connection"}</span>
                <select
                  className="text-input"
                  value={secondaryScriptProvider}
                  onChange={(event) => {
                    const nextProvider = event.target.value as AiProvider;
                    setSecondaryScriptProvider(nextProvider);
                    if (nextProvider === "openrouter_api") {
                      setSecondaryOpenRouterModel(getDefaultAiModel("openrouter_api"));
                    }
                    if (nextProvider === "openai_api") {
                      setSecondaryOpenAiModel(getDefaultAiModel("openai_api"));
                    }
                  }}
                >
                  {renderProviderOptions(isKorean)}
                </select>
              </label>

              {secondaryScriptProvider === "openrouter_api" && (
                <>
                  <label className="field">
                    <span>OpenRouter API Key</span>
                    <div className="secret-input-row">
                      <input
                        className="text-input"
                        type={showSecondaryOpenRouterApiKey ? "text" : "password"}
                        value={secondaryOpenRouterApiKey}
                        onChange={(event) => setSecondaryOpenRouterApiKey(event.target.value)}
                        placeholder="sk-or-v1-..."
                      />
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          setShowSecondaryOpenRouterApiKey((value) => !value)
                        }
                      >
                        {showSecondaryOpenRouterApiKey
                          ? isKorean
                            ? "숨기기"
                            : "Hide"
                          : isKorean
                            ? "보기"
                            : "Show"}
                      </button>
                    </div>
                  </label>
                  <label className="field">
                    <span>{isKorean ? "OpenRouter 모델" : "OpenRouter model"}</span>
                    <select
                      className="text-input"
                      value={secondaryOpenRouterModel}
                      onChange={(event) => setSecondaryOpenRouterModel(event.target.value)}
                    >
                      {getAiModelOptions("openrouter_api").map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              {secondaryScriptProvider === "openai_api" && (
                <>
                  <label className="field">
                    <span>OpenAI API Key</span>
                    <div className="secret-input-row">
                      <input
                        className="text-input"
                        type={showSecondaryOpenAiApiKey ? "text" : "password"}
                        value={secondaryOpenAiApiKey}
                        onChange={(event) => setSecondaryOpenAiApiKey(event.target.value)}
                        placeholder="sk-..."
                      />
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setShowSecondaryOpenAiApiKey((value) => !value)}
                      >
                        {showSecondaryOpenAiApiKey
                          ? isKorean
                            ? "숨기기"
                            : "Hide"
                          : isKorean
                            ? "보기"
                            : "Show"}
                      </button>
                    </div>
                  </label>
                  <label className="field">
                    <span>{isKorean ? "OpenAI 모델" : "OpenAI model"}</span>
                    <select
                      className="text-input"
                      value={secondaryOpenAiModel}
                      onChange={(event) => setSecondaryOpenAiModel(event.target.value)}
                    >
                      {getAiModelOptions("openai_api").map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              {secondaryScriptProvider === "claude_cli" && (
                <p className="subtle">
                  {isKorean
                    ? "보조 연결도 Claude CLI를 선택하면 감지된 실행 파일을 참조합니다."
                    : "When Claude CLI is selected here, it also references the detected executable."}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="manual-install-box">
          <strong>{isKorean ? "연결 사용 방식" : "How connections are used"}</strong>
          <p className="subtle">
            {isKorean
              ? "지금은 AI 연결 1이 기본 연결로 사용됩니다. AI 연결 2는 다음 단계에서 슬롯별 참조 대상으로 연결할 예정입니다."
              : "Right now, AI Connection 1 is used as the default connection. AI Connection 2 is stored and will be wired into per-slot selection next."}
          </p>
        </div>

        <div className="manual-install-box">
          <strong>{isKorean ? "Azure Speech 더빙" : "Azure Speech dubbing"}</strong>
          <p className="subtle">
            {isKorean
              ? "3번 슬롯 더빙은 Azure Speech를 우선 사용하고, 없을 때만 OpenAI TTS로 내려갑니다."
              : "Slot 3 dubbing prefers Azure Speech first and only falls back to OpenAI TTS if Azure isn't configured."}
          </p>
          <div className="form-grid">
            <label className="field">
              <span>Azure Speech Key</span>
              <div className="secret-input-row">
                <input
                  className="text-input"
                  type={showAzureSpeechKey ? "text" : "password"}
                  value={azureSpeechKey}
                  onChange={(event) => setAzureSpeechKey(event.target.value)}
                  placeholder="xxxxxxxxxxxxxxxx"
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowAzureSpeechKey((value) => !value)}
                >
                  {showAzureSpeechKey
                    ? isKorean
                      ? "숨기기"
                      : "Hide"
                    : isKorean
                      ? "보기"
                      : "Show"}
                </button>
              </div>
            </label>
            <label className="field">
              <span>{isKorean ? "Azure 리전" : "Azure region"}</span>
              <input
                className="text-input"
                value={azureSpeechRegion}
                onChange={(event) => setAzureSpeechRegion(event.target.value)}
                placeholder="eastus"
              />
            </label>
            <label className="field">
              <span>{isKorean ? "한국어 음성" : "Korean voice"}</span>
              <input
                className="text-input"
                value={azureSpeechVoice}
                onChange={(event) => setAzureSpeechVoice(event.target.value)}
                placeholder="ko-KR-SunHiNeural"
              />
            </label>
          </div>
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
          >
            {copy.installClaudeCode}
          </button>
        </div>

        {claudeDetectionMessage && <p className="subtle">{claudeDetectionMessage}</p>}
        {savedMessage && <p className="success-text">{savedMessage}</p>}
      </div>

      {isDeveloperMode && (
        <div className="card">
          <div className="card-row">
            <div>
              <h3>{isKorean ? "개발자 설정" : "Developer settings"}</h3>
              <p className="subtle">
                {isKorean
                  ? "로컬 테스트나 문제 해결이 필요할 때만 수정하세요."
                  : "Only change these for local testing or troubleshooting."}
              </p>
            </div>
          </div>

          <div className="form-grid">
              <label className="field">
                <span>{isKorean ? "Claude 실행 파일 경로" : "Claude executable path"}</span>
                <input
                  className="text-input"
                  value={claudeExecutablePath}
                  onChange={(event) => setClaudeExecutablePath(event.target.value)}
                  placeholder={
                    isKorean
                      ? "감지 경로를 덮어쓸 때만 입력하세요."
                      : "Only enter this to override the detected path."
                  }
                />
              </label>

              <label className="field">
                <span>{isKorean ? "Claude 실행 인자" : "Claude launch args"}</span>
                <input
                  className="text-input"
                  value={claudeArgsText}
                  onChange={(event) => setClaudeArgsText(event.target.value)}
                  placeholder={isKorean ? "--dangerously-skip-permissions" : "--dangerously-skip-permissions"}
                />
              </label>

              <label className="field">
                <span>{isKorean ? "API Base URL" : "API Base URL"}</span>
                <input
                  className="text-input"
                  value={apiBaseUrl}
                  onChange={(event) => setApiBaseUrl(event.target.value)}
                  placeholder="https://mellowcat-claude-v2-production.up.railway.app"
                />
              </label>
          </div>
        </div>
      )}
    </section>
  );
}
