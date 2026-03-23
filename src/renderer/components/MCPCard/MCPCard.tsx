import type { InstalledMCPRecord, MCPCatalogItem } from "@common/types/mcp";
import { evaluateMcpComposition } from "../../lib/mcp-composition";

interface MCPCardProps {
  item: MCPCatalogItem;
  installedList: InstalledMCPRecord[];
  installed?: InstalledMCPRecord;
  onInstall?: (id: string) => void;
  onUpdate?: (id: string) => void;
}

export function MCPCard({ item, installedList, installed, onInstall, onUpdate }: MCPCardProps) {
  const isInstalled = Boolean(installed);
  const isRunning = installed?.runtime.status === "running";
  const hasUpdate = installed ? installed.version !== item.latestVersion : false;
  const selectedIds = [
    ...installedList.map((installedItem) => installedItem.id),
    ...(installedList.some((installedItem) => installedItem.id === item.id) ? [] : [item.id])
  ];
  const composition = evaluateMcpComposition(selectedIds);
  const itemIssues = composition.issues.filter((issue) => issue.mcpId === item.id);

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
        {itemIssues.length > 0 && (
          <div className="meta-item">
            <span>Compatibility</span>
            <strong className="warning-text">Needs {itemIssues.length} more requirement{itemIssues.length > 1 ? "s" : ""}</strong>
          </div>
        )}
      </div>
      {itemIssues.length > 0 && (
        <div className="manual-install-box">
          {itemIssues.map((issue) => (
            <span key={issue.message} className="subtle">
              {issue.message}
            </span>
          ))}
        </div>
      )}
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
