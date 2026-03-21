import type { InstalledMCPRecord, MCPCatalogItem } from "@common/types/mcp";

interface MCPCardProps {
  item: MCPCatalogItem;
  installed?: InstalledMCPRecord;
  onInstall?: (id: string) => void;
  onUpdate?: (id: string) => void;
}

export function MCPCard({ item, installed, onInstall, onUpdate }: MCPCardProps) {
  const isInstalled = Boolean(installed);
  const isRunning = installed?.runtime.status === "running";
  const hasUpdate = installed ? installed.version !== item.latestVersion : false;

  return (
    <article className={isInstalled ? "card card-installed" : "card"}>
      <div className="card-row">
        <div>
          <p className="eyebrow">{item.distribution.priceText ?? item.distribution.type}</p>
          <h3>{item.name}</h3>
        </div>
        <span className="pill">{item.latestVersion}</span>
      </div>
      <p>{item.summary}</p>
      <div className="meta-list">
        <div className="meta-item">
          <span>Status</span>
          <strong>{isInstalled ? (isRunning ? "Running" : "Installed") : "Not installed"}</strong>
        </div>
        <div className="meta-item">
          <span>Local Version</span>
          <strong>{installed?.version ?? "-"}</strong>
        </div>
      </div>
      <div className="card-row">
        <div className="tag-row">
          {isInstalled && <span className="tag">{installed?.enabled ? "enabled" : "disabled"}</span>}
          {hasUpdate && <span className="tag">update available</span>}
          {item.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
        {installed ? (
          <button
            type="button"
            className={hasUpdate ? "primary-button" : "secondary-button"}
            onClick={() => onUpdate?.(item.id)}
          >
            {hasUpdate ? "Update Now" : "Recheck"}
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={() => onInstall?.(item.id)}>
            Install
          </button>
        )}
      </div>
    </article>
  );
}
