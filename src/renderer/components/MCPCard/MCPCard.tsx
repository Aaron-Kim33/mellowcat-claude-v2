import type { InstalledMCPRecord, MCPCatalogItem } from "@common/types/mcp";
import { evaluateMcpComposition } from "../../lib/mcp-composition";
import { detectMcpRole } from "../../lib/mcp-role";
import { detectStorePlatform, getPlatformTone } from "../../lib/store-platform";

interface MCPCardProps {
  item: MCPCatalogItem;
  installedList: InstalledMCPRecord[];
  installed?: InstalledMCPRecord;
  onInstall?: (id: string) => void;
  onUpdate?: (id: string) => void;
  onPurchase?: (item: MCPCatalogItem) => void;
}

export function MCPCard({
  item,
  installedList,
  installed,
  onInstall,
  onUpdate,
  onPurchase
}: MCPCardProps) {
  const isInstalled = Boolean(installed);
  const isRunning = installed?.runtime.status === "running";
  const hasUpdate = installed ? installed.version !== item.latestVersion : false;
  const isInstallable = item.availability?.state !== "coming_soon";
  const entitlementStatus = item.entitlement?.status ?? installed?.entitlement.status ?? "unknown";
  const canInstall =
    entitlementStatus === "free" ||
    entitlementStatus === "owned" ||
    entitlementStatus === "trial" ||
    entitlementStatus === "unknown";
  const requiresPurchase = entitlementStatus === "not_owned";
  const hasCheckout = Boolean(item.commerce?.checkoutUrl || item.commerce?.productUrl);
  const platform = detectStorePlatform(item);
  const platformTone = getPlatformTone(platform);
  const role = detectMcpRole(item);
  const selectedIds = [
    ...installedList.map((installedItem) => installedItem.id),
    ...(installedList.some((installedItem) => installedItem.id === item.id) ? [] : [item.id])
  ];
  const composition = evaluateMcpComposition(selectedIds);
  const itemIssues = composition.issues.filter((issue) => issue.mcpId === item.id);
  const entitlementLabelMap: Record<typeof entitlementStatus, string> = {
    free: "free",
    owned: "owned",
    trial: "trial",
    not_owned: "buy to unlock",
    unknown: "check access"
  };
  const actionLabel = requiresPurchase
    ? item.commerce?.ctaLabel ?? "Buy"
    : entitlementStatus === "trial"
      ? "Start Trial"
      : "Install";

  return (
    <article className={`${isInstalled ? "card card-installed" : "card"} compact-card platform-card ${platformTone}`}>
      <div className="card-row">
        <div>
          <div className="tag-row">
            <span className={`platform-badge ${platformTone}`}>
              {platform === "all" ? "Core" : platform === "packs" ? "Pack" : item.tags.find((tag) => tag.toLowerCase() === platform) ?? platform}
            </span>
            <span className={`role-badge ${role.tone}`}>{role.label}</span>
            <span className="eyebrow">{item.distribution.priceText ?? item.distribution.type}</span>
          </div>
          <h3>{item.name}</h3>
        </div>
        <span className="pill">{item.latestVersion}</span>
      </div>
      <p>{item.summary}</p>
      <div className="meta-list">
        <div className="meta-item">
          <span>Status</span>
          <strong>
            {isInstalled
              ? isRunning
                ? "Running"
                : "Installed"
              : isInstallable
                ? "Not installed"
                : "Coming soon"}
          </strong>
        </div>
        <div className="meta-item">
          <span>Local Version</span>
          <strong>{installed?.version ?? "-"}</strong>
        </div>
        <div className="meta-item">
          <span>Access</span>
          <strong>{entitlementLabelMap[entitlementStatus]}</strong>
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
      {item.availability?.state === "coming_soon" && (
        <div className="manual-install-box">
          <span className="subtle">
            {item.availability.note ??
              "This workflow piece is mapped out in the marketplace but not bundled yet."}
          </span>
        </div>
      )}
      <div className="card-row">
        <div className="tag-row">
          {isInstalled && <span className="tag">{installed?.enabled ? "enabled" : "disabled"}</span>}
          {hasUpdate && <span className="tag">update available</span>}
          <span className="tag">access:{entitlementStatus}</span>
          {item.workflow?.ids?.map((workflowId) => (
            <span key={workflowId} className="tag">
              workflow:{workflowId}
            </span>
          ))}
          {item.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
        {installed ? (
          <button
            type="button"
            className={hasUpdate ? `primary-button ${platformTone}` : "secondary-button"}
            onClick={() => onUpdate?.(item.id)}
          >
            {hasUpdate ? "Update Now" : "Recheck"}
          </button>
        ) : !isInstallable ? (
          <button type="button" className="secondary-button" disabled>
            Coming Soon
          </button>
        ) : requiresPurchase ? (
          <button
            type="button"
            className={`primary-button ${platformTone}`}
            onClick={() => onPurchase?.(item)}
            disabled={!hasCheckout}
            title={
              hasCheckout
                ? "Open product details and purchase options"
                : "Purchase flow is not connected for this item yet"
            }
          >
            {hasCheckout ? actionLabel : "Purchase Unavailable"}
          </button>
        ) : (
          <button
            type="button"
            className={`primary-button ${platformTone}`}
            onClick={() => canInstall && onInstall?.(item.id)}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </article>
  );
}
