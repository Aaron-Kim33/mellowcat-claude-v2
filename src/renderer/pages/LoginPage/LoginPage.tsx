import { useEffect, useMemo, useState } from "react";
import type { AuthProvider } from "@common/types/auth";
import type { InstalledMCPRecord, MCPCatalogItem } from "@common/types/mcp";
import { getFriendlyErrorMessage } from "../../lib/launcher-error";
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
    sendVerificationEmail,
    changeEmail,
    unlinkProvider,
    installMcp,
    updateMcp
  } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.account;
  const isKorean = settings?.launcherLanguage === "ko";
  const [sessionToken, setSessionToken] = useState("");
  const [nextEmail, setNextEmail] = useState(authSession?.email ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const [activeLibraryActionId, setActiveLibraryActionId] = useState<string>();
  const [accountBusyAction, setAccountBusyAction] = useState<
    "verify" | "changeEmail" | "unlink-password" | "unlink-google" | undefined
  >();

  useEffect(() => {
    setNextEmail(authSession?.email ?? "");
  }, [authSession?.email]);

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
  const sortedOwnedItems = useMemo(
    () =>
      [...ownedItems].sort((left, right) => {
        const leftInstalled = installedById.get(left.id);
        const rightInstalled = installedById.get(right.id);
        const score = (record?: InstalledMCPRecord) => {
          if (!record) {
            return 40;
          }
          if (record.installState === "error") {
            return 35;
          }
          if (record.installState === "updating") {
            return 30;
          }
          if (record.installState === "downloading") {
            return 25;
          }
          if (record.runtime.status === "running") {
            return 20;
          }
          return 10;
        };

        const scoreDelta = score(rightInstalled) - score(leftInstalled);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }

        return left.name.localeCompare(right.name);
      }),
    [installedById, ownedItems]
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
    ownedLabel: isKorean ? "보유" : "Owned",
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
    emptyLibraryTitle: isKorean ? "아직 보유한 상품이 없습니다." : "No owned products yet.",
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
      : "Owned products can be installed or rechecked here without bouncing back to Marketplace.",
    accessPriorityHint: isKorean
      ? "설치 대기, 오류, 업데이트가 필요한 항목이 먼저 보이도록 정렬됩니다."
      : "Items needing install, recovery, or update are shown first.",
    changeEmailTitle: isKorean ? "이메일 변경" : "Change email",
    changeEmailHint: isKorean
      ? "이메일을 바꾸면 새 주소로 인증 메일을 다시 보냅니다."
      : "Changing your email sends a new verification email to the updated address.",
    changeEmailButton: isKorean ? "이메일 변경" : "Update email",
    resendVerificationButton: isKorean ? "인증 메일 다시 보내기" : "Resend verification",
    verificationSentNotice: isKorean
      ? "인증 메일을 보냈어요. 메일함을 확인해 주세요."
      : "Verification email sent. Check your inbox.",
    emailChangedNotice: isKorean
      ? "이메일을 변경했어요. 새 주소로 보낸 인증 메일을 확인해 주세요."
      : "Email updated. Check the new inbox for a verification email.",
    emailInputLabel: isKorean ? "새 이메일 주소" : "New email address",
    unlinkProviderLabel: isKorean ? "연결 해제" : "Unlink",
    unlinkProviderHint: isKorean
      ? "마지막 로그인 방식은 삭제할 수 없습니다."
      : "At least one sign-in method must remain linked."
  };

  const handleBrowserLogin = async () => {
    try {
      await login();
    } catch (error) {
      window.alert(getFriendlyErrorMessage(error, { isKorean, context: "auth" }));
    }
  };

  const handleCancelLogin = async () => {
    try {
      await cancelLogin();
    } catch (error) {
      window.alert(
        getFriendlyErrorMessage(error, { isKorean, context: "auth" }) ||
          text.cancelLoginErrorLabel
      );
    }
  };

  const handleTokenLogin = async () => {
    try {
      await loginWithToken(sessionToken);
    } catch (error) {
      window.alert(getFriendlyErrorMessage(error, { isKorean, context: "auth" }));
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      window.alert(getFriendlyErrorMessage(error, { isKorean, context: "auth" }));
    }
  };

  const handleRefreshAccess = async () => {
    setRefreshing(true);
    try {
      await refreshStoreAccess();
    } catch (error) {
      window.alert(getFriendlyErrorMessage(error, { isKorean, context: "network" }));
    } finally {
      setRefreshing(false);
    }
  };

  const handleInstall = async (mcpId: string) => {
    setActiveLibraryActionId(mcpId);
    try {
      await installMcp(mcpId);
    } catch (error) {
      window.alert(getFriendlyErrorMessage(error, { isKorean, context: "install" }));
    } finally {
      setActiveLibraryActionId(undefined);
    }
  };

  const handleRecheck = async (mcpId: string) => {
    setActiveLibraryActionId(mcpId);
    try {
      await updateMcp(mcpId);
    } catch (error) {
      window.alert(getFriendlyErrorMessage(error, { isKorean, context: "update" }));
    } finally {
      setActiveLibraryActionId(undefined);
    }
  };

  const handleSendVerification = async () => {
    setAccountBusyAction("verify");
    try {
      const response = await sendVerificationEmail();
      if (response.verificationUrl) {
        window.alert(`${text.verificationSentNotice}\n\n${response.verificationUrl}`);
      } else {
        window.alert(text.verificationSentNotice);
      }
    } catch (error) {
      window.alert(getFriendlyErrorMessage(error, { isKorean, context: "auth" }));
    } finally {
      setAccountBusyAction(undefined);
    }
  };

  const handleChangeEmail = async () => {
    setAccountBusyAction("changeEmail");
    try {
      const response = await changeEmail(nextEmail);
      if (response.verificationUrl) {
        window.alert(`${text.emailChangedNotice}\n\n${response.verificationUrl}`);
      } else {
        window.alert(text.emailChangedNotice);
      }
    } catch (error) {
      window.alert(getFriendlyErrorMessage(error, { isKorean, context: "auth" }));
    } finally {
      setAccountBusyAction(undefined);
    }
  };

  const handleUnlinkProvider = async (provider: AuthProvider) => {
    const actionId = `unlink-${provider}` as const;
    setAccountBusyAction(actionId);
    try {
      await unlinkProvider(provider);
    } catch (error) {
      window.alert(getFriendlyErrorMessage(error, { isKorean, context: "auth" }));
    } finally {
      setAccountBusyAction(undefined);
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
              {authSession.linkedProviders.length > 1 ? (
                <div className="button-row">
                  {authSession.linkedProviders.map((provider) => (
                    <button
                      key={`unlink-${provider}`}
                      type="button"
                      className="secondary-button"
                      onClick={() => void handleUnlinkProvider(provider)}
                      disabled={accountBusyAction !== undefined}
                    >
                      {accountBusyAction === (`unlink-${provider}` as const)
                        ? `${text.unlinkProviderLabel}...`
                        : `${formatProviderLabel(provider)} ${text.unlinkProviderLabel}`}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="subtle">{text.unlinkProviderHint}</span>
              )}
            </div>
          ) : null}
          {authSession?.loggedIn ? (
            <div className="manual-install-box">
              <strong>{text.changeEmailTitle}</strong>
              <span className="subtle">{text.changeEmailHint}</span>
              <label className="field">
                <span>{text.emailInputLabel}</span>
                <input
                  className="text-input"
                  type="email"
                  value={nextEmail}
                  onChange={(event) => setNextEmail(event.target.value)}
                  placeholder="hello@mellowcat.xyz"
                />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleSendVerification()}
                  disabled={accountBusyAction !== undefined || authSession.emailVerified}
                >
                  {accountBusyAction === "verify"
                    ? `${text.resendVerificationButton}...`
                    : text.resendVerificationButton}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleChangeEmail()}
                  disabled={
                    accountBusyAction !== undefined ||
                    !nextEmail.trim() ||
                    nextEmail.trim().toLowerCase() === authSession.email?.toLowerCase()
                  }
                >
                  {accountBusyAction === "changeEmail"
                    ? `${text.changeEmailButton}...`
                    : text.changeEmailButton}
                </button>
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
              {authBusy
                ? authStatusMessage ?? text.signInWithBrowserLabel
                : text.signInWithBrowserLabel}
            </button>
            {authBusy && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleCancelLogin()}
              >
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
          <p className="subtle">{text.accessPriorityHint}</p>
          {ownedItems.length > 0 ? (
            <div className="account-library-list">
              {sortedOwnedItems.map((item) => (
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
  const statusLabel = (() => {
    if (item.entitlement?.status === "trial") {
      return isKorean ? "체험 접근" : "Trial access";
    }

    if (!installedRecord) {
      return isKorean ? "설치 준비 완료" : "Ready to install";
    }

    if (installedRecord.installState === "error") {
      return isKorean ? "복구 필요" : "Needs attention";
    }

    if (installedRecord.installState === "updating") {
      return isKorean ? "업데이트 중" : "Updating";
    }

    if (installedRecord.installState === "downloading") {
      return isKorean ? "설치 중" : "Installing";
    }

    if (installedRecord.runtime.status === "running") {
      return isKorean ? "설치 및 실행 중" : "Installed and running";
    }

    return isKorean ? "로컬에 설치됨" : "Installed locally";
  })();

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
  const detailLabel = installedRecord?.lastError
    ? installedRecord.lastError
    : installedRecord
      ? installedRecord.installState === "updating"
        ? isKorean
          ? "최신 패키지를 받아 로컬 사본을 새로 고치는 중입니다."
          : "Refreshing your local package with the latest build."
        : installedRecord.installState === "downloading"
          ? isKorean
            ? "계정에 연결된 패키지를 내려받고 검증하는 중입니다."
            : "Downloading and verifying the package tied to your account."
          : hasUpdate
            ? isKorean
              ? "새 버전이 준비되어 있습니다. 다시 확인을 눌러 업데이트할 수 있습니다."
              : "A newer package is ready. Recheck to apply the update."
            : isKorean
              ? "로컬 사본이 최신 상태입니다."
              : "Your local copy is up to date."
      : isKorean
        ? "아직 설치하지 않았습니다. 계정에 연결된 권한으로 바로 설치할 수 있습니다."
        : "Not installed yet. You can install immediately with your account access.";

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
        <div>
          <span className="subtle">{installStateLabel}</span>
          <p className="subtle">{detailLabel}</p>
        </div>
        {installedRecord ? (
          <button
            type="button"
            className={hasUpdate ? "primary-button" : "secondary-button"}
            onClick={() => void onRecheck(item.id)}
            disabled={busy}
          >
            {busy
              ? isKorean
                ? "처리 중..."
                : "Working..."
              : hasUpdate
                ? isKorean
                  ? "지금 업데이트"
                  : "Update Now"
                : isKorean
                  ? "다시 확인"
                  : "Recheck"}
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={() => void onInstall(item.id)}
            disabled={busy}
          >
            {busy
              ? isKorean
                ? "설치 중..."
                : "Installing..."
              : isKorean
                ? "설치"
                : "Install"}
          </button>
        )}
      </div>
    </div>
  );
}
