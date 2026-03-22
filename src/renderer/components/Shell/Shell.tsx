import { useState } from "react";
import { LauncherPage } from "../../pages/LauncherPage/LauncherPage";
import { StorePage } from "../../pages/StorePage/StorePage";
import { InstalledPage } from "../../pages/InstalledPage/InstalledPage";
import { SettingsPage } from "../../pages/SettingsPage/SettingsPage";
import { LoginPage } from "../../pages/LoginPage/LoginPage";
import { AboutPage } from "../../pages/AboutPage/AboutPage";
import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

type Tab = "launcher" | "store" | "installed" | "settings" | "login" | "about";

export function Shell() {
  const [tab, setTab] = useState<Tab>("launcher");
  const launcherLanguage = useAppStore((state) => state.settings?.launcherLanguage);
  const copy = getLauncherCopy(launcherLanguage);
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "launcher", label: copy.shell.tabs.launcher },
    { id: "store", label: copy.shell.tabs.store },
    { id: "installed", label: copy.shell.tabs.installed },
    { id: "settings", label: copy.shell.tabs.settings },
    { id: "login", label: copy.shell.tabs.login },
    { id: "about", label: copy.shell.tabs.about }
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">{copy.shell.eyebrow}</p>
          <h1>{copy.shell.title}</h1>
          <p className="subtle">{copy.shell.subtitle}</p>
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
        {tab === "launcher" && <LauncherPage onNavigate={setTab} />}
        {tab === "store" && <StorePage />}
        {tab === "installed" && <InstalledPage />}
        {tab === "settings" && <SettingsPage />}
        {tab === "login" && <LoginPage />}
        {tab === "about" && <AboutPage />}
      </main>
    </div>
  );
}
