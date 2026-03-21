import { useAppStore } from "../../store/app-store";

export function LoginPage() {
  const { authSession, login, logout } = useAppStore();

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">Account</p>
          <h2>Future-proof auth entry</h2>
          <p className="subtle">The UI stays optional for now, but the service boundary is already in place for account and payment rollout later.</p>
        </div>
      </div>

      <div className="card">
        <div className="settings-row">
          <span>Status</span>
          <strong>{authSession?.loggedIn ? "Logged In" : "Logged Out"}</strong>
        </div>
        <div className="settings-row">
          <span>User</span>
          <strong>{authSession?.displayName ?? "Guest"}</strong>
        </div>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => void login()}>
            Login
          </button>
          <button type="button" className="secondary-button" onClick={() => void logout()}>
            Logout
          </button>
        </div>
      </div>
    </section>
  );
}
