import { useState } from "react";
import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

export function LoginPage() {
  const {
    authSession,
    authBusy,
    authStatusMessage,
    login,
    loginWithToken,
    logout,
    settings
  } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.account;
  const [sessionToken, setSessionToken] = useState("");
  const isKorean = settings?.launcherLanguage === "ko";
  const isDeveloperMode =
    settings?.apiBaseUrl?.startsWith("http://127.0.0.1") ||
    settings?.apiBaseUrl?.startsWith("http://localhost") ||
    settings?.apiBaseUrl === "mock://remote";
  const signInWithBrowserLabel = isKorean ? "브라우저로 로그인" : "Sign in with browser";
  const developerAccessLabel = isKorean ? "개발자 접근" : "Developer access";
  const developerHint = isKorean
    ? "로컬 테스트나 백엔드 디버깅에서만 세션 토큰을 사용하세요."
    : "Use a raw session token only for local testing or backend debugging.";
  const sessionTokenLabel = isKorean ? "세션 토큰" : "Session Token";
  const sessionTokenPlaceholder = isKorean
    ? "서버에서 발급된 세션 토큰을 붙여넣으세요"
    : "Paste a server-issued session token";
  const useSessionTokenLabel = isKorean ? "세션 토큰 사용" : "Use Session Token";

  const handleBrowserLogin = async () => {
    try {
      await login();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed.";
      window.alert(message);
    }
  };

  const handleTokenLogin = async () => {
    try {
      await loginWithToken(sessionToken);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Token login failed.";
      window.alert(message);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Logout failed.";
      window.alert(message);
    }
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
          <span>{copy.status}</span>
          <strong>{authSession?.loggedIn ? copy.loggedIn : copy.loggedOut}</strong>
        </div>
        <div className="settings-row">
          <span>{copy.user}</span>
          <strong>{authSession?.displayName ?? copy.guest}</strong>
        </div>
        {authSession?.email && (
          <div className="settings-row">
            <span>Email</span>
            <strong>{authSession.email}</strong>
          </div>
        )}
        {authStatusMessage && <p className="subtle">{authStatusMessage}</p>}
        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleBrowserLogin()}
            disabled={authBusy}
          >
            {authBusy ? authStatusMessage ?? signInWithBrowserLabel : signInWithBrowserLabel}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleLogout()}
            disabled={authBusy}
          >
            {copy.logout}
          </button>
        </div>
        {isDeveloperMode && (
          <details>
            <summary>{developerAccessLabel}</summary>
            <div style={{ marginTop: 12 }}>
              <label className="field">
                <span>{sessionTokenLabel}</span>
                <input
                  className="text-input"
                  type="password"
                  value={sessionToken}
                  onChange={(event) => setSessionToken(event.target.value)}
                  placeholder={sessionTokenPlaceholder}
                />
                <span className="subtle">{developerHint}</span>
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleTokenLogin()}
                  disabled={!sessionToken.trim() || authBusy}
                >
                  {useSessionTokenLabel}
                </button>
              </div>
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
