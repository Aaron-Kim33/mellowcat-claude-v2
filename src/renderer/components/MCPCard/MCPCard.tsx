import type { InstalledMCPRecord, MCPCatalogItem } from "@common/types/mcp";
import { useAppStore } from "../../store/app-store";
import { detectStorePlatform, getPlatformTone } from "../../lib/store-platform";

interface MCPCardProps {
  item: MCPCatalogItem;
  installedList: InstalledMCPRecord[];
  installed?: InstalledMCPRecord;
  onInstall?: (id: string) => void;
  onUpdate?: (id: string) => void;
  onPurchase?: (item: MCPCatalogItem) => void;
  purchasePending?: boolean;
}

export function MCPCard({
  item,
  installedList: _installedList,
  installed,
  onInstall,
  onUpdate,
  onPurchase,
  purchasePending = false
}: MCPCardProps) {
  const launcherLanguage = useAppStore((state) => state.settings?.launcherLanguage);
  const isKorean = launcherLanguage === "ko";
  const isInstalled = Boolean(installed);
  const isRunning = installed?.runtime.status === "running";
  const installState = installed?.installState;
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
  const installStateLabelMap: Record<InstalledMCPRecord["installState"], string> = {
    not_installed: isKorean ? "설치 안 됨" : "Not installed",
    downloading: isKorean ? "설치 중..." : "Installing...",
    installed: isRunning ? (isKorean ? "실행 중" : "Running") : isKorean ? "설치됨" : "Installed",
    updating: isKorean ? "업데이트 중..." : "Updating...",
    error: isKorean ? "설치 오류" : "Install error"
  };
  const entitlementLabelMap: Record<typeof entitlementStatus, string> = {
    free: isKorean ? "무료" : "free",
    owned: isKorean ? "보유" : "owned",
    trial: isKorean ? "체험" : "trial",
    not_owned: isKorean ? "구매 필요" : "buy to unlock",
    unknown: isKorean ? "접근 확인" : "check access"
  };
  const actionLabel = requiresPurchase
    ? item.commerce?.ctaLabel ?? (isKorean ? "구매" : "Buy")
    : entitlementStatus === "trial"
      ? isKorean
        ? "체험 시작"
        : "Start Trial"
      : isKorean
        ? "설치"
        : "Install";
  const isBusy =
    purchasePending ||
    installState === "downloading" ||
    installState === "updating";

  return (
    <article className={`${isInstalled ? "card card-installed" : "card"} compact-card platform-card ${platformTone}`}>
      <div className="card-row">
        <div>
          <div className="tag-row">
            <span className={`platform-badge ${platformTone}`}>
              {platform === "all"
                ? isKorean
                  ? "핵심"
                  : "Core"
                : platform === "packs"
                  ? isKorean
                    ? "팩"
                    : "Pack"
                  : item.tags.find((tag) => tag.toLowerCase() === platform) ?? platform}
            </span>
            <span className="eyebrow">{item.distribution.priceText ?? item.distribution.type}</span>
          </div>
          <h3>{item.name}</h3>
        </div>
        <span className="pill">{item.latestVersion}</span>
      </div>
      <p>{item.summary}</p>

      <div className="meta-list">
        <div className="meta-item">
          <span>{isKorean ? "상태" : "Status"}</span>
          <strong>
            {isInstalled
              ? installStateLabelMap[installState ?? "installed"]
              : isInstallable
                ? isKorean
                  ? "설치 안 됨"
                  : "Not installed"
                : isKorean
                  ? "준비 중"
                  : "Coming soon"}
          </strong>
        </div>
        <div className="meta-item">
          <span>{isKorean ? "로컬 버전" : "Local Version"}</span>
          <strong>{installed?.version ?? "-"}</strong>
        </div>
        <div className="meta-item">
          <span>{isKorean ? "접근 권한" : "Access"}</span>
          <strong>{entitlementLabelMap[entitlementStatus]}</strong>
        </div>
      </div>

      {item.availability?.state === "coming_soon" && (
        <div className="manual-install-box">
          <span className="subtle">
            {item.availability.note ??
              (isKorean
                ? "이 모듈은 마켓에만 등록되어 있고 아직 실제 설치 패키지로 제공되지는 않습니다."
                : "This module is listed in the marketplace but is not packaged for install yet.")}
          </span>
        </div>
      )}

      {purchasePending && (
        <div className="manual-install-box">
          <strong>{isKorean ? "구매 대기 중" : "Waiting for purchase"}</strong>
          <span className="subtle">
            {isKorean
              ? "브라우저에서 결제를 마친 뒤 이 화면으로 돌아오면 접근 상태를 자동으로 새로고칩니다."
              : "Complete checkout in the browser, then return here. Access will refresh automatically."}
          </span>
        </div>
      )}

      {(installState === "downloading" || installState === "updating") && (
        <div className="manual-install-box">
          <strong>
            {installState === "downloading"
              ? isKorean
                ? "패키지 설치 중"
                : "Installing package"
              : isKorean
                ? "패키지 업데이트 중"
                : "Updating package"}
          </strong>
          <span className="subtle">
            {installState === "downloading"
              ? isKorean
                ? "패키지를 내려받고 검증한 뒤 로컬에서 사용할 수 있게 준비하고 있습니다."
                : "Downloading, verifying, and unpacking the package for local use."
              : isKorean
                ? "최신 패키지를 확인하고 로컬 사본을 새로 고치고 있습니다."
                : "Refreshing your local package with the latest version."}
          </span>
        </div>
      )}

      {!isInstalled && entitlementStatus === "owned" && (
        <div className="manual-install-box">
          <strong>{isKorean ? "설치 준비 완료" : "Ready to install"}</strong>
          <span className="subtle">
            {isKorean
              ? "이미 계정에 연결된 상품입니다. 여기서 바로 설치하면 로컬 워크플로에 추가됩니다."
              : "This product is already in your account. Install it here to add it locally."}
          </span>
        </div>
      )}

      {installState === "error" && installed?.lastError && (
        <div className="manual-install-box">
          <strong>{isKorean ? "설치 실패" : "Install failed"}</strong>
          <span className="subtle">{installed.lastError}</span>
        </div>
      )}

      <div className="card-row">
        <div className="tag-row">
          {isInstalled && (
            <span className="tag">
              {installed?.enabled ? (isKorean ? "활성화" : "enabled") : isKorean ? "비활성화" : "disabled"}
            </span>
          )}
          {hasUpdate && <span className="tag">{isKorean ? "업데이트 가능" : "update available"}</span>}
        </div>
        {installed ? (
          <button
            type="button"
            className={hasUpdate ? `primary-button ${platformTone}` : "secondary-button"}
            onClick={() => onUpdate?.(item.id)}
          >
            {hasUpdate ? (isKorean ? "지금 업데이트" : "Update Now") : isKorean ? "다시 확인" : "Recheck"}
          </button>
        ) : !isInstallable ? (
          <button type="button" className="secondary-button" disabled>
            {isKorean ? "준비 중" : "Coming Soon"}
          </button>
        ) : requiresPurchase ? (
          <button
            type="button"
            className={`primary-button ${platformTone}`}
            onClick={() => onPurchase?.(item)}
            disabled={!hasCheckout || isBusy}
            title={
              hasCheckout
                ? isKorean
                  ? "상품 상세와 구매 옵션 열기"
                  : "Open product details and purchase options"
                : isKorean
                  ? "이 상품의 구매 흐름은 아직 연결되지 않았습니다."
                  : "Purchase flow is not connected for this item yet"
            }
          >
            {hasCheckout
              ? purchasePending
                ? isKorean
                  ? "구매 대기 중"
                  : "Waiting for Purchase"
                : actionLabel
              : isKorean
                ? "구매 불가"
                : "Purchase Unavailable"}
          </button>
        ) : (
          <button
            type="button"
            className={`primary-button ${platformTone}`}
            onClick={() => canInstall && onInstall?.(item.id)}
            disabled={isBusy}
          >
            {installState === "downloading"
              ? isKorean
                ? "설치 중..."
                : "Installing..."
              : installState === "updating"
                ? isKorean
                  ? "업데이트 중..."
                  : "Updating..."
                : actionLabel}
          </button>
        )}
      </div>
    </article>
  );
}
