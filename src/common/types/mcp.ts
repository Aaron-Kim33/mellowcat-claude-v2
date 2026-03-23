export type MCPDistributionType = "free" | "paid" | "private" | "bundled";
export type MCPVisibility = "public" | "unlisted" | "hidden";
export type MCPInstallState =
  | "not_installed"
  | "downloading"
  | "installed"
  | "updating"
  | "error";
export type MCPEntitlementStatus =
  | "free"
  | "owned"
  | "trial"
  | "not_owned"
  | "unknown";
export type MCPRuntimeStatus = "stopped" | "starting" | "running" | "errored";

export interface MCPCatalogItem {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description?: string;
  author: {
    id: string;
    name: string;
    verified?: boolean;
  };
  branding?: {
    iconUrl?: string;
    bannerUrl?: string;
    accentColor?: string;
  };
  distribution: {
    type: MCPDistributionType;
    priceText?: string;
    currency?: string;
    amount?: number;
  };
  latestVersion: string;
  compatibility: {
    launcherMinVersion?: string;
    os?: Array<"win32" | "darwin" | "linux">;
    claudeCode?: {
      minVersion?: string;
      maxVersion?: string;
    };
  };
  visibility: MCPVisibility;
  tags: string[];
  publishedAt?: string;
  updatedAt?: string;
  package?: {
    source: "bundled" | "remote";
    manifestPath?: string;
  };
  availability?: {
    state: "installable" | "coming_soon";
    note?: string;
  };
  workflow?: {
    ids: string[];
  };
}

export interface InstalledMCPRecord {
  id: string;
  version: string;
  installState: MCPInstallState;
  enabled: boolean;
  installPath: string;
  entrypoint?: string;
  installedAt?: string;
  updatedAt?: string;
  lastLaunchedAt?: string;
  lastError?: string;
  source: {
    type: "catalog" | "local" | "bundled";
    url?: string;
  };
  workflow?: {
    ids: string[];
  };
  entitlement: {
    status: MCPEntitlementStatus;
    checkedAt?: string;
  };
  runtime: {
    pid?: number;
    status: MCPRuntimeStatus;
    port?: number;
  };
}

export interface MCPOutputEvent {
  mcpId: string;
  chunk: string;
  timestamp: string;
  stream: "stdout" | "stderr" | "system";
}

export interface LocalManifest {
  schemaVersion: number;
  generatedAt: string;
  launcherVersion: string;
  installed: InstalledMCPRecord[];
}

export interface MCPPackageManifest {
  id: string;
  name: string;
  version: string;
  runtime: "node";
  entrypoint: string;
  permissions?: string[];
  compatibility?: {
    launcherMinVersion?: string;
  };
}
