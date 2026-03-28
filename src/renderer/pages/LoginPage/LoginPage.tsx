import { useMemo, useState } from "react";
import type { MCPCatalogItem } from "@common/types/mcp";
import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

export function LoginPage() {
  const {
    authSession,
    authBusy,
    authStatusMessage,
    catalog,
    installed,
    settings,
    login,
    loginWithToken,
    logout,
    refreshStoreAccess
  } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.account;
  const isKorean = settings?.launcherLanguage === "ko";
  const [sessionToken, setSessionToken] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const isDeveloperMode =
    settings?.apiBaseUrl?.startsWith("http://127.0.0.1") ||
    settings?.apiBaseUrl?.startsWith("http://localhost") ||
    settings?.apiBaseUrl === "mock://remote";

  const ownedItems = useMemo(
    () =>
      catalog.filter((item) => {
        const entitlementStatus = item.entitlement?.status;
        return entitlementStatus === "owned" || entitlementStatus === "trial";
      }),
    [catalog]
  );

  const installedIds = useMemo(
    () => new Set(installed.map((item) => item.id)),
    [installed]
  );
  const readyToInstallCount = ownedItems.filter((item) => !installedIds.has(item.id)).length;
  const installedOwnedCount = ownedItems.filter((item) => installedIds.has(item.id)).length;
  const runningOwnedCount = installed.filter((item) => {
    const isOwned =
      item.entitlement.status === "owned" || item.entitlement.status === "trial";
    return isOwned && item.runtime.status === "running";
  }).length;

  const signInWithBrowserLabel = isKorean ? "브라우저로 로그인" : "Sign in with browser";
  const refreshAccessLabel = isKorean ? "접근 상태 새로고침" : "Refresh access";
  const accountOverviewLabel = isKorean ? "계정 개요" : "Account overview";
  const accountLibraryLabel = isKorean ? "내 라이브러리" : "Your library";
  const ownedLabel = isKorean ? "소유" : "Owned";
  const installedLabel = isKorean ? "설치됨" : "Installed";
  const readyLabel = isKorean ? "설치 대기" : "Ready to install";
  const runningLabel = isKorean ? "실행 중" : "Running";
  const providerLabel = isKorean ? "로그인 방식" : "Sign-in source";
  const browserAccountLabel = isKorean ? "브라우저 계정" : "Browser account";
  const developerAccessLabel = isKorean ? "개발자 접근" : "Developer access";
  const developerHint = isKorean
    ? "로컬 테스트나 백엔드 디버깅에서만 세션 토큰을 사용하세요."
    : "Use a raw session token only for local testing or backend debugging.";
  const sessionTokenLabel = isKorean ? "세션 토큰" : "Session Token";
  const sessionTokenPlaceholder = isKorean
    ? "서버에서 발급된 세션 토큰을 붙여넣으세요"
    : "Paste a server-issued session token";
  const useSessionTokenLabel = isKorean ? "세션 토큰 사용" : "Use Session Token";
  const accountHint = isKorean
    ? "이 계정으로 구매한 상품은 여기와 Marketplace에서 같은 접근 상태로 반영됩니다."
    : "Products you purchase with this account will show the same access state here and in Marketplace.";
  const emptyLibraryTitle = isKorean ? "아직 소유한 상품이 없습니다." : "No owned products yet.";
  const emptyLibraryBody = isKorean
    ? "Marketplace에서 상품을 구매하면 여기에서 바로 설치 가능 여부를 확인할 수 있습니다."
    : "Buy products in Marketplace and they will show up here as soon as access refreshes.";

  const handleBrowserLogin = async () => {
    try {
      await login();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed.";
      window.alert(message);
    }
  };

  const handleTokenLogin = async () => {
    try {
      await loginWithToken(sessionToken);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Token login failed.";
      window.alert(message);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Logout failed.";
      window.alert(message);
    }
  };

  const handleRefreshAccess = async () => {
    setRefreshing(true);
    try {
      await refreshStoreAccess();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Access refresh failed.";
      window.alert(message);
    } finally {
      setRefreshing(false);
    }
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
          <span className="pill">{ownedItems.length} {ownedLabel}</span>
          <span className="pill">{installedOwnedCount} {installedLabel}</span>
          <span className="pill">{readyToInstallCount} {readyLabel}</span>
          <span className="pill">{runningOwnedCount} {runningLabel}</span>
        </div>
      </div>

      <div className="grid compact-grid">
        <article className="card account-panel">
          <div className="card-row">
            <div>
              <p className="eyebrow">{accountOverviewLabel}</p>
              <h3>{authSession?.displayName ?? copy.guest}</h3>
            </div>
            <span className={`pill ${authSession?.loggedIn ? "account-pill-live" : ""}`}>
              {authSession?.loggedIn ? copy.loggedIn : copy.loggedOut}
            </span>
          </div>
          <div className="meta-list">
            <div className="meta-item">
              <span>{copy.user}</span>
              <strong>{authSession?.displayName ?? copy.guest}</strong>
            </div>
            <div className="meta-item">
              <span>Email</span>
              <strong>{authSession?.email ?? "-"}</strong>
            </div>
            <div className="meta-item">
              <span>{providerLabel}</span>
              <strong>{authSession?.loggedIn ? browserAccountLabel : "-"}</strong>
            </div>
            <div className="meta-item">
              <span>{copy.status}</span>
              <strong>{authSession?.loggedIn ? copy.loggedIn : copy.loggedOut}</strong>
            </div>
          </div>
          <p className="subtle">{accountHint}</p>
          {authStatusMessage && (
            <div className="manual-install-box">
              <strong>{isKorean ? "계정 상태" : "Account status"}</strong>
              <span className="subtle">{authStatusMessage}</span>
            </div>
          )}
          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleBrowserLogin()}
              disabled={authBusy}
            >
              {authBusy ? authStatusMessage ?? signInWithBrowserLabel : signInWithBrowserLabel}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleRefreshAccess()}
              disabled={refreshing || authBusy}
            >
              {refreshing ? `${refreshAccessLabel}...` : refreshAccessLabel}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleLogout()}
              disabled={authBusy}
            >
              {copy.logout}
            </button>
          </div>
          {isDeveloperMode && (
            <details className="developer-access-box">
              <summary>{developerAccessLabel}</summary>
              <div className="developer-access-content">
                <label className="field">
                  <span>{sessionTokenLabel}</span>
                  <input
                    className="text-input"
                    type="password"
                    value={sessionToken}
                    onChange={(event) => setSessionToken(event.target.value)}
                    placeholder={sessionTokenPlaceholder}
                  />
                  <span className="subtle">{developerHint}</span>
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handleTokenLogin()}
                    disabled={!sessionToken.trim() || authBusy}
                  >
                    {useSessionTokenLabel}
                  </button>
                </div>
              </div>
            </details>
          )}
        </article>

        <article className="card account-panel">
          <div className="card-row">
            <div>
              <p className="eyebrow">{accountLibraryLabel}</p>
              <h3>{isKorean ? "구매 및 설치 상태" : "Purchases and installs"}</h3>
            </div>
            <span className="pill">{ownedItems.length}</span>
          </div>
          {ownedItems.length > 0 ? (
            <div className="account-library-list">
              {ownedItems.map((item) => (
                <OwnedProductRow
                  key={item.id}
                  item={item}
                  isInstalled={installedIds.has(item.id)}
                />
              ))}
            </div>
          ) : (
            <div className="manual-install-box">
              <strong>{emptyLibraryTitle}</strong>
              <span className="subtle">{emptyLibraryBody}</span>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

interface OwnedProductRowProps {
  item: MCPCatalogItem;
  isInstalled: boolean;
}

function OwnedProductRow({ item, isInstalled }: OwnedProductRowProps) {
  const statusLabel =
    item.entitlement?.status === "trial"
      ? "Trial access"
      : isInstalled
        ? "Installed locally"
        : "Ready to install";

  return (
    <div className="account-library-item">
      <div>
        <strong>{item.name}</strong>
        <p className="subtle">{item.summary}</p>
      </div>
      <div className="tag-row">
        <span className="tag">{item.distribution.priceText ?? item.distribution.type}</span>
        <span className="tag">{statusLabel}</span>
      </div>
    </div>
  );
}
