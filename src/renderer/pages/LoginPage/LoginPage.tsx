import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

export function LoginPage() {
  const { authSession, login, logout, settings } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.account;

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
        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => void login()}>
            {copy.login}
          </button>
          <button type="button" className="secondary-button" onClick={() => void logout()}>
            {copy.logout}
          </button>
        </div>
      </div>
    </section>
  );
}
