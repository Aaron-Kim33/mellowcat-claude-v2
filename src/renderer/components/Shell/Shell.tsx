import { useState } from "react";
import { LauncherPage } from "../../pages/LauncherPage/LauncherPage";
import { StorePage } from "../../pages/StorePage/StorePage";
import { InstalledPage } from "../../pages/InstalledPage/InstalledPage";
import { SettingsPage } from "../../pages/SettingsPage/SettingsPage";
import { LoginPage } from "../../pages/LoginPage/LoginPage";

type Tab = "launcher" | "store" | "installed" | "settings" | "login";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "launcher", label: "Launcher" },
  { id: "store", label: "Store" },
  { id: "installed", label: "Installed" },
  { id: "settings", label: "Settings" },
  { id: "login", label: "Account" }
];

export function Shell() {
  const [tab, setTab] = useState<Tab>("launcher");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">MellowCat</p>
          <h1>Claude Control Room</h1>
          <p className="subtle">Launch Claude, install MCPs, and grow into a real storefront later.</p>
        </div>
        <nav className="nav">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "nav-button active" : "nav-button"}
              onClick={() => setTab(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        {tab === "launcher" && <LauncherPage />}
        {tab === "store" && <StorePage />}
        {tab === "installed" && <InstalledPage />}
        {tab === "settings" && <SettingsPage />}
        {tab === "login" && <LoginPage />}
      </main>
    </div>
  );
}
