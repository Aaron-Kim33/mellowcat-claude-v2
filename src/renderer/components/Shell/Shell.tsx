import { useEffect, useState } from "react";
import { LauncherPage } from "../../pages/LauncherPage/LauncherPage";
import { CrawlingPage } from "../../pages/CrawlingPage/CrawlingPage";
import { GenerationPage } from "../../pages/GenerationPage/GenerationPage";
import { StorePage } from "../../pages/StorePage/StorePage";
import { InstalledPage } from "../../pages/InstalledPage/InstalledPage";
import { SettingsPage } from "../../pages/SettingsPage/SettingsPage";
import { LoginPage } from "../../pages/LoginPage/LoginPage";
import { AboutPage } from "../../pages/AboutPage/AboutPage";
import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

type Tab =
  | "launcher"
  | "crawling"
  | "generation"
  | "store"
  | "installed"
  | "settings"
  | "login"
  | "about";

export function Shell() {
  const [tab, setTab] = useState<Tab>("launcher");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("mellowcat.sidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });
  const launcherLanguage = useAppStore((state) => state.settings?.launcherLanguage);
  const authSession = useAppStore((state) => state.authSession);
  const copy = getLauncherCopy(launcherLanguage);
  const isKorean = launcherLanguage === "ko";
  const tabGroups: Array<{ label: string; items: Array<{ id: Tab; label: string }> }> = [
    {
      label: copy.shell.workspaceLabel,
      items: [
        { id: "launcher", label: copy.shell.tabs.launcher },
        { id: "crawling", label: isKorean ? "크롤링" : "Crawling" },
        { id: "generation", label: copy.shell.tabs.generation },
        { id: "store", label: copy.shell.tabs.store },
        { id: "installed", label: copy.shell.tabs.installed },
        { id: "settings", label: copy.shell.tabs.settings }
      ]
    },
    {
      label: copy.shell.accountLabel,
      items: [
        { id: "login", label: copy.shell.tabs.login },
        { id: "about", label: copy.shell.tabs.about }
      ]
    }
  ];

  useEffect(() => {
    try {
      window.localStorage.setItem("mellowcat.sidebarCollapsed", String(sidebarCollapsed));
    } catch {
      // The UI can still collapse even if localStorage is unavailable.
    }
  }, [sidebarCollapsed]);

  return (
    <div className={sidebarCollapsed ? "shell shell--sidebar-collapsed" : "shell"}>
      <aside className="sidebar">
        <div className="sidebar-brand-row">
          <div className="sidebar-brand">
            <div className="brand-mark">M</div>
            <div className="sidebar-brand-copy">
              <p className="eyebrow">{copy.shell.eyebrow}</p>
              <h1>{copy.shell.title}</h1>
              <p className="subtle">{copy.shell.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={
              sidebarCollapsed
                ? isKorean
                  ? "사이드바 펼치기"
                  : "Expand sidebar"
                : isKorean
                  ? "사이드바 접기"
                  : "Collapse sidebar"
            }
            title={sidebarCollapsed ? (isKorean ? "펼치기" : "Expand") : (isKorean ? "접기" : "Collapse")}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        </div>
        <nav className="nav">
          {tabGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-group-label">{group.label}</p>
              <div className="nav-group-items">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    className={tab === item.id ? "nav-button active" : "nav-button"}
                    onClick={() => setTab(item.id)}
                    type="button"
                    title={item.label}
                  >
                    <span className="nav-button-dot" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p className="nav-group-label">{copy.shell.accountLabel}</p>
          <div className="sidebar-session-card">
            <strong>{authSession?.displayName ?? copy.pages.account.guest}</strong>
            <span className="subtle">
              {authSession?.loggedIn ? authSession.email ?? copy.pages.account.loggedIn : copy.pages.account.loggedOut}
            </span>
          </div>
        </div>
      </aside>
      <main className="content">
        {tab === "launcher" && <LauncherPage onNavigate={setTab} />}
        {tab === "crawling" && <CrawlingPage />}
        {tab === "generation" && <GenerationPage />}
        {tab === "store" && <StorePage />}
        {tab === "installed" && <InstalledPage />}
        {tab === "settings" && <SettingsPage />}
        {tab === "login" && <LoginPage />}
        {tab === "about" && <AboutPage />}
      </main>
    </div>
  );
}
