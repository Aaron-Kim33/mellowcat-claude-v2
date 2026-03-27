import { useState } from "react";
import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

export function LoginPage() {
  const { authSession, login, loginWithToken, logout, settings } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.account;
  const [sessionToken, setSessionToken] = useState("");

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
        <label className="field">
          <span>Session Token</span>
          <input
            className="text-input"
            type="password"
            value={sessionToken}
            onChange={(event) => setSessionToken(event.target.value)}
            placeholder="Paste a server-issued session token"
          />
          <span className="subtle">For local preview, set API Base URL to `mock://remote` and use any non-empty token.</span>
        </label>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => void handleBrowserLogin()}>
            {copy.login}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleTokenLogin()}
            disabled={!sessionToken.trim()}
          >
            Use Session Token
          </button>
          <button type="button" className="secondary-button" onClick={() => void handleLogout()}>
            {copy.logout}
          </button>
        </div>
      </div>
    </section>
  );
}
