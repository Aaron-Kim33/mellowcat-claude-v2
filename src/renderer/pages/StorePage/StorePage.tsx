import { useMemo, useState } from "react";
import { MCPCard } from "../../components/MCPCard/MCPCard";
import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

export function StorePage() {
  const { catalog, installed, installMcp, updateMcp, settings } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.store;
  const [query, setQuery] = useState("");
  const installedCount = installed.length;
  const runningCount = installed.filter((item) => item.runtime.status === "running").length;
  const filteredCatalog = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return catalog;
    }

    return catalog.filter((item) => {
      const haystack = [
        item.name,
        item.summary,
        item.description ?? "",
        item.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [catalog, query]);

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="subtle">{copy.subtitle}</p>
        </div>
        <div className="hero-stats">
          <span className="pill">{installedCount} {copy.installed}</span>
          <span className="pill">{runningCount} {copy.running}</span>
        </div>
      </div>

      <div className="card">
        <div className="settings-row">
          <span>{copy.search}</span>
          <input
            className="text-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
          />
        </div>
      </div>

      <div className="grid">
        {filteredCatalog.map((item) => (
          <MCPCard
            key={item.id}
            item={item}
            installed={installed.find((installedItem) => installedItem.id === item.id)}
            onInstall={(id) => void installMcp(id)}
            onUpdate={(id) => void updateMcp(id)}
          />
        ))}
      </div>
    </section>
  );
}
