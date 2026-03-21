import { useMemo, useState } from "react";
import { MCPCard } from "../../components/MCPCard/MCPCard";
import { useAppStore } from "../../store/app-store";

export function StorePage() {
  const { catalog, installed, installMcp, updateMcp } = useAppStore();
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
          <p className="eyebrow">Store</p>
          <h2>Free-first MCP catalog</h2>
          <p className="subtle">This page is structured for future paid entitlement checks, but stays frictionless for free distribution today.</p>
        </div>
        <div className="hero-stats">
          <span className="pill">{installedCount} installed</span>
          <span className="pill">{runningCount} running</span>
        </div>
      </div>

      <div className="card">
        <div className="settings-row">
          <span>Search</span>
          <input
            className="text-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search MCPs by name, summary, or tag"
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
