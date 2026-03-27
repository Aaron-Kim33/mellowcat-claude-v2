import { useEffect, useMemo, useState } from "react";
import { MCPCard } from "../../components/MCPCard/MCPCard";
import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";
import {
  type StorePlatform,
  detectStorePlatform,
  getPlatformTone,
  matchesStorePlatform
} from "../../lib/store-platform";

export function StorePage() {
  const {
    catalog,
    installed,
    installMcp,
    updateMcp,
    refreshStoreAccess,
    settings,
    authSession,
    createPaymentHandoff
  } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.store;
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<StorePlatform>("all");
  const [purchasePending, setPurchasePending] = useState(false);
  const [purchasePendingId, setPurchasePendingId] = useState<string>();
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const installedCount = installed.length;
  const runningCount = installed.filter((item) => item.runtime.status === "running").length;
  const platformTabs: Array<{ id: StorePlatform; label: string }> = [
    { id: "telegram", label: "Telegram" },
    { id: "instagram", label: "Instagram" },
    { id: "youtube", label: "YouTube" },
    { id: "packs", label: "Packs" },
    { id: "all", label: "All" }
  ];
  const filteredCatalog = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter((item) => {
      if (!matchesStorePlatform(item, platform)) {
        return false;
      }

      if (!normalized) {
        return true;
      }

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
  }, [catalog, platform, query]);
  const featuredPacks = useMemo(
    () => catalog.filter((item) => detectStorePlatform(item) === "packs").slice(0, 2),
    [catalog]
  );
  const filteredPieces = filteredCatalog.filter((item) => detectStorePlatform(item) !== "packs");

  useEffect(() => {
    if (!purchasePending) {
      return;
    }

    const handleFocus = () => {
      setPurchaseMessage("Refreshing your purchases...");
      void refreshStoreAccess()
        .then(() => {
          setPurchaseMessage("Purchase status refreshed.");
        })
        .finally(() => {
          setPurchasePending(false);
          setPurchasePendingId(undefined);
          window.setTimeout(() => setPurchaseMessage(""), 2500);
        });
    };

    window.addEventListener("focus", handleFocus, { once: true });
    return () => window.removeEventListener("focus", handleFocus);
  }, [purchasePending, refreshStoreAccess]);

  const handlePurchase = async (item: (typeof catalog)[number]) => {
    const baseUrl = item.commerce?.checkoutUrl ?? item.commerce?.productUrl;
    let targetUrl: string | undefined;

    if (authSession?.loggedIn && settings?.apiBaseUrl?.trim()) {
      try {
        targetUrl = await createPaymentHandoff(item.id, "launcher");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Checkout could not be started.";
        window.alert(message);
        return;
      }
    } else {
      targetUrl = baseUrl ? buildPurchaseUrl(baseUrl, item.id) : undefined;
    }

    if (!targetUrl) {
      window.alert("This item is not owned yet, but its checkout flow is not connected yet.");
      return;
    }
    setPurchasePending(true);
    setPurchasePendingId(item.id);
    setPurchaseMessage("Complete checkout, then return to MellowCat. We will refresh access automatically.");
    void window.mellowcat.app.openExternal(targetUrl);
  };

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
        <div className="store-toolbar">
          {purchaseMessage && (
            <div className="manual-install-box">
              <strong>Purchase Flow</strong>
              <span className="subtle">{purchaseMessage}</span>
            </div>
          )}
          {featuredPacks.length > 0 && (
            <div className="store-pack-intro">
              <div>
                <p className="eyebrow">Recommended Packs</p>
                <strong>Start with a ready-made workflow, then add single MCPs only when you need extra control.</strong>
              </div>
              <span className="pill">{featuredPacks.length} featured packs</span>
            </div>
          )}
          {featuredPacks.length > 0 && platform === "packs" && (
            <div className="grid compact-grid">
              {featuredPacks.map((item) => (
                <MCPCard
                  key={item.id}
                  item={item}
                  installedList={installed}
                  installed={installed.find((installedItem) => installedItem.id === item.id)}
                  onInstall={(id) => void installMcp(id)}
                  onUpdate={(id) => void updateMcp(id)}
                  onPurchase={handlePurchase}
                  purchasePending={purchasePendingId === item.id}
                />
              ))}
            </div>
          )}
          <div className="platform-tabs">
            {platformTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`platform-button ${getPlatformTone(item.id)}${platform === item.id ? " active" : ""}`}
                onClick={() => setPlatform(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            className="text-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setPurchaseMessage("Refreshing your purchases...");
              void refreshStoreAccess().finally(() =>
                window.setTimeout(() => setPurchaseMessage(""), 2500)
              );
            }}
          >
            Refresh Purchases
          </button>
        </div>
      </div>

      {filteredCatalog.length > 0 ? (
        <>
          {platform !== "packs" && filteredPieces.length > 0 && (
            <div className="card">
              <div className="card-row">
                <div>
                  <p className="eyebrow">Current Modules</p>
                  <h3>Implemented workflow pieces</h3>
                </div>
                <span className="pill">{filteredPieces.length}</span>
              </div>
              <p className="subtle">
                This list only shows workflow pieces that already exist in the current product build.
              </p>
            </div>
          )}
          <div className="grid compact-grid">
            {(platform === "packs" ? filteredCatalog : filteredPieces).map((item) => (
              <MCPCard
                key={item.id}
                item={item}
                installedList={installed}
                installed={installed.find((installedItem) => installedItem.id === item.id)}
                onInstall={(id) => void installMcp(id)}
                onUpdate={(id) => void updateMcp(id)}
                onPurchase={handlePurchase}
                purchasePending={purchasePendingId === item.id}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="card compact-empty-state">
          <strong>No MCPs in this lane yet.</strong>
          <p className="subtle">
            This tab is ready for {platform === "packs" ? "pack bundles" : `${platform} workflow pieces`} once they are added to the catalog.
          </p>
        </div>
      )}
    </section>
  );
}

function buildPurchaseUrl(baseUrl: string, productId: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("productId", productId);
    url.searchParams.set("source", "launcher");
    return url.toString();
  } catch {
    return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}productId=${encodeURIComponent(productId)}&source=launcher`;
  }
}
