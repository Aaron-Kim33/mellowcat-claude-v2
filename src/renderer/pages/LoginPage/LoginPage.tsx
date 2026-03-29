import { useMemo, useState } from "react";
import type { AuthProvider } from "@common/types/auth";
import type { InstalledMCPRecord, MCPCatalogItem } from "@common/types/mcp";
import { getLauncherCopy } from "../../lib/launcher-copy";
import { useAppStore } from "../../store/app-store";

export function LoginPage() {
  const {
    authSession,
    authBusy,
    authStatusMessage,
    catalog,
    installed,
    settings,
    login,
    cancelLogin,
    loginWithToken,
    logout,
    refreshStoreAccess,
    installMcp,
    updateMcp
  } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.account;
  const isKorean = settings?.launcherLanguage === "ko";
  const [sessionToken, setSessionToken] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeLibraryActionId, setActiveLibraryActionId] = useState<string>();

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

  const installedById = useMemo(
    () => new Map(installed.map((item) => [item.id, item])),
    [installed]
  );
  const readyToInstallCount = ownedItems.filter((item) => !installedById.has(item.id)).length;
  const installedOwnedCount = ownedItems.filter((item) => installedById.has(item.id)).length;
  const runningOwnedCount = installed.filter((item) => {
    const isOwned =
      item.entitlement.status === "owned" || item.entitlement.status === "trial";
    return isOwned && item.runtime.status === "running";
  }).length;

  const text = {
    signInWithBrowserLabel: isKorean ? "브라우저로 로그인" : "Sign in with browser",
    cancelBrowserLoginLabel: isKorean ? "대기 취소" : "Cancel waiting",
    refreshAccessLabel: isKorean ? "접근 상태 새로고침" : "Refresh access",
    accountOverviewLabel: isKorean ? "계정 개요" : "Account overview",
    accountLibraryLabel: isKorean ? "내 라이브러리" : "Your library",
    ownedLabel: isKorean ? "소유" : "Owned",
    installedLabel: isKorean ? "설치됨" : "Installed",
    readyLabel: isKorean ? "설치 대기" : "Ready to install",
    runningLabel: isKorean ? "실행 중" : "Running",
    providerLabel: isKorean ? "로그인 방식" : "Sign-in source",
    browserAccountLabel: isKorean ? "브라우저 계정" : "Browser account",
    linkedProvidersTitle: isKorean ? "연결된 로그인 방식" : "Linked providers",
    developerAccessLabel: isKorean ? "개발자 접근" : "Developer access",
    developerHint: isKorean
      ? "로컬 테스트나 백엔드 디버깅에서만 세션 토큰을 사용하세요."
      : "Use a raw session token only for local testing or backend debugging.",
    sessionTokenLabel: isKorean ? "세션 토큰" : "Session Token",
    sessionTokenPlaceholder: isKorean
      ? "서버에서 발급된 세션 토큰을 붙여넣으세요"
      : "Paste a server-issued session token",
    useSessionTokenLabel: isKorean ? "세션 토큰 사용" : "Use Session Token",
    accountHint: isKorean
      ? "이 계정으로 구매한 상품은 여기와 마켓에서 같은 접근 상태로 반영됩니다."
      : "Products you purchase with this account will show the same access state here and in Marketplace.",
    emptyLibraryTitle: isKorean ? "아직 소유한 상품이 없습니다." : "No owned products yet.",
    emptyLibraryBody: isKorean
      ? "마켓에서 상품을 구매하면 여기에서 바로 설치 가능 여부를 확인할 수 있습니다."
      : "Buy products in Marketplace and they will show up here as soon as access refreshes.",
    accountStatusLabel: isKorean ? "계정 상태" : "Account status",
    emailVerificationLabel: isKorean ? "이메일 인증" : "Email verification",
    emailVerifiedLabel: isKorean ? "인증 완료" : "Verified",
    emailUnverifiedLabel: isKorean ? "인증 대기" : "Verification pending",
    cancelLoginErrorLabel: isKorean
      ? "브라우저 로그인 대기를 취소하지 못했습니다."
      : "Browser login could not be canceled.",
    accessCardTitle: isKorean ? "구매 및 설치 상태" : "Purchases and installs",
    accessCardHint: isKorean
      ? "구매한 상품은 여기에서 바로 설치하거나 업데이트 상태를 확인할 수 있습니다."
      : "Owned products can be installed or rechecked here without bouncing back to Marketplace."
  };

  const handleBrowserLogin = async () => {
    try {
      await login();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed.";
      window.alert(message);
    }
  };

  const handleCancelLogin = async () => {
    try {
      await cancelLogin();
    } catch (error) {
      const message = error instanceof Error ? error.message : text.cancelLoginErrorLabel;
      window.alert(message);
    }
  };

  const handleTokenLogin = async () => {
    try {
      await loginWithToken(sessionToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token login failed.";
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

  const handleInstall = async (mcpId: string) => {
    setActiveLibraryActionId(mcpId);
    try {
      await installMcp(mcpId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Install failed.";
      window.alert(message);
    } finally {
      setActiveLibraryActionId(undefined);
    }
  };

  const handleRecheck = async (mcpId: string) => {
    setActiveLibraryActionId(mcpId);
    try {
      await updateMcp(mcpId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update check failed.";
      window.alert(message);
    } finally {
      setActiveLibraryActionId(undefined);
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
          <span className="pill">{ownedItems.length} {text.ownedLabel}</span>
          <span className="pill">{installedOwnedCount} {text.installedLabel}</span>
          <span className="pill">{readyToInstallCount} {text.readyLabel}</span>
          <span className="pill">{runningOwnedCount} {text.runningLabel}</span>
        </div>
      </div>

      <div className="grid compact-grid">
        <article className="card account-panel">
          <div className="card-row">
            <div>
              <p className="eyebrow">{text.accountOverviewLabel}</p>
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
              <span>{text.providerLabel}</span>
              <strong>
                {authSession?.loggedIn
                  ? formatProviderSummary(authSession.linkedProviders, text.browserAccountLabel)
                  : "-"}
              </strong>
            </div>
            <div className="meta-item">
              <span>{copy.status}</span>
              <strong>{authSession?.loggedIn ? copy.loggedIn : copy.loggedOut}</strong>
            </div>
            <div className="meta-item">
              <span>{text.emailVerificationLabel}</span>
              <strong>
                {authSession?.loggedIn
                  ? authSession.emailVerified
                    ? text.emailVerifiedLabel
                    : text.emailUnverifiedLabel
                  : "-"}
              </strong>
            </div>
          </div>
          {authSession?.loggedIn && authSession.linkedProviders?.length ? (
            <div className="manual-install-box">
              <strong>{text.linkedProvidersTitle}</strong>
              <div className="tag-row">
                {authSession.linkedProviders.map((provider) => (
                  <span key={provider} className="tag">
                    {formatProviderLabel(provider)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <p className="subtle">{text.accountHint}</p>
          {authStatusMessage && (
            <div className="manual-install-box">
              <strong>{text.accountStatusLabel}</strong>
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
              {authBusy ? authStatusMessage ?? text.signInWithBrowserLabel : text.signInWithBrowserLabel}
            </button>
            {authBusy && (
              <button type="button" className="secondary-button" onClick={() => void handleCancelLogin()}>
                {text.cancelBrowserLoginLabel}
              </button>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleRefreshAccess()}
              disabled={refreshing || authBusy}
            >
              {refreshing ? `${text.refreshAccessLabel}...` : text.refreshAccessLabel}
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
              <summary>{text.developerAccessLabel}</summary>
              <div className="developer-access-content">
                <label className="field">
                  <span>{text.sessionTokenLabel}</span>
                  <input
                    className="text-input"
                    type="password"
                    value={sessionToken}
                    onChange={(event) => setSessionToken(event.target.value)}
                    placeholder={text.sessionTokenPlaceholder}
                  />
                  <span className="subtle">{text.developerHint}</span>
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handleTokenLogin()}
                    disabled={!sessionToken.trim() || authBusy}
                  >
                    {text.useSessionTokenLabel}
                  </button>
                </div>
              </div>
            </details>
          )}
        </article>

        <article className="card account-panel">
          <div className="card-row">
            <div>
              <p className="eyebrow">{text.accountLibraryLabel}</p>
              <h3>{text.accessCardTitle}</h3>
            </div>
            <span className="pill">{ownedItems.length}</span>
          </div>
          <p className="subtle">{text.accessCardHint}</p>
          {ownedItems.length > 0 ? (
            <div className="account-library-list">
              {ownedItems.map((item) => (
                <OwnedProductRow
                  key={item.id}
                  item={item}
                  installedRecord={installedById.get(item.id)}
                  busy={activeLibraryActionId === item.id}
                  onInstall={handleInstall}
                  onRecheck={handleRecheck}
                  isKorean={isKorean}
                />
              ))}
            </div>
          ) : (
            <div className="manual-install-box">
              <strong>{text.emptyLibraryTitle}</strong>
              <span className="subtle">{text.emptyLibraryBody}</span>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function formatProviderLabel(provider: AuthProvider): string {
  switch (provider) {
    case "google":
      return "Google";
    case "password":
      return "Email + Password";
    default:
      return provider;
  }
}

function formatProviderSummary(
  providers: AuthProvider[] | undefined,
  fallback: string
): string {
  if (!providers?.length) {
    return fallback;
  }

  return providers.map((provider) => formatProviderLabel(provider)).join(", ");
}

interface OwnedProductRowProps {
  item: MCPCatalogItem;
  installedRecord?: InstalledMCPRecord;
  busy: boolean;
  onInstall: (mcpId: string) => Promise<void>;
  onRecheck: (mcpId: string) => Promise<void>;
  isKorean: boolean;
}

function OwnedProductRow({
  item,
  installedRecord,
  busy,
  onInstall,
  onRecheck,
  isKorean
}: OwnedProductRowProps) {
  const hasUpdate = installedRecord
    ? installedRecord.version !== item.latestVersion
    : false;
  const statusLabel =
    item.entitlement?.status === "trial"
      ? isKorean
        ? "체험 접근"
        : "Trial access"
      : installedRecord
        ? installedRecord.runtime.status === "running"
          ? isKorean
            ? "설치 및 실행 중"
            : "Installed and running"
          : isKorean
            ? "로컬에 설치됨"
            : "Installed locally"
        : isKorean
          ? "설치 준비 완료"
          : "Ready to install";

  const installStateLabel = installedRecord
    ? installedRecord.lastError
      ? isKorean
        ? "설치 오류"
        : "Install error"
      : installedRecord.installState === "updating"
        ? isKorean
          ? "업데이트 중..."
          : "Updating..."
        : installedRecord.installState === "downloading"
          ? isKorean
            ? "설치 중..."
            : "Installing..."
          : hasUpdate
            ? isKorean
              ? "업데이트 가능"
              : "Update available"
            : isKorean
              ? "준비됨"
              : "Ready"
    : isKorean
      ? "준비됨"
      : "Ready";

  return (
    <div className="account-library-item">
      <div className="account-library-item-header">
        <div>
          <strong>{item.name}</strong>
          <p className="subtle">{item.summary}</p>
        </div>
        <div className="tag-row">
          <span className="tag">{item.distribution.priceText ?? item.distribution.type}</span>
          <span className="tag">{statusLabel}</span>
          <span className="tag">{isKorean ? `최신:${item.latestVersion}` : `latest:${item.latestVersion}`}</span>
          {installedRecord && (
            <span className="tag">{isKorean ? `로컬:${installedRecord.version}` : `local:${installedRecord.version}`}</span>
          )}
        </div>
      </div>
      <div className="account-library-item-footer">
        <span className="subtle">{installStateLabel}</span>
        {installedRecord ? (
          <button
            type="button"
            className={hasUpdate ? "primary-button" : "secondary-button"}
            onClick={() => void onRecheck(item.id)}
            disabled={busy}
          >
            {busy ? (isKorean ? "처리 중..." : "Working...") : hasUpdate ? (isKorean ? "지금 업데이트" : "Update Now") : isKorean ? "다시 확인" : "Recheck"}
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={() => void onInstall(item.id)}
            disabled={busy}
          >
            {busy ? (isKorean ? "설치 중..." : "Installing...") : isKorean ? "설치" : "Install"}
          </button>
        )}
      </div>
    </div>
  );
}
