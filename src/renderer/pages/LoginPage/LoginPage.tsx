import { useState } from "react";
import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

export function LoginPage() {
  const { authSession, login, loginWithToken, logout, settings } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.account;
  const [sessionToken, setSessionToken] = useState("");

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
          <button type="button" className="primary-button" onClick={() => void login()}>
            {copy.login}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void loginWithToken(sessionToken)}
            disabled={!sessionToken.trim()}
          >
            Use Session Token
          </button>
          <button type="button" className="secondary-button" onClick={() => void logout()}>
            {copy.logout}
          </button>
        </div>
      </div>
    </section>
  );
}
