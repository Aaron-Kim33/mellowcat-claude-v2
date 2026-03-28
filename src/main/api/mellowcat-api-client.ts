import type {
  AuthSession,
  LauncherAuthResolveResponse,
  LauncherAuthStartResponse,
  PaymentHandoffResponse
} from "../../common/types/auth";
import type { MCPCatalogItem, MCPEntitlementRecord } from "../../common/types/mcp";

export interface MCPRemoteDownloadTicket {
  mcpId: string;
  version: string;
  manifestUrl: string;
  downloadUrl: string;
  checksumSha256?: string;
}

export interface RemoteListEnvelope<T> {
  items: T[];
}

const MOCK_SESSION: AuthSession = {
  loggedIn: true,
  userId: "user_mock_remote",
  email: "creator@mellowcat.dev",
  displayName: "Mock Remote Creator",
  source: "remote",
  lastSyncedAt: "2026-03-27T09:00:00.000Z"
};

const MOCK_ENTITLEMENTS: MCPEntitlementRecord[] = [
  {
    mcpId: "filesystem-tools",
    status: "owned",
    checkedAt: "2026-03-27T09:05:00.000Z"
  },
  {
    mcpId: "youtube-publish-mcp",
    status: "not_owned",
    checkedAt: "2026-03-27T09:05:00.000Z"
  }
];

const MOCK_CATALOG: MCPCatalogItem[] = [
  {
    id: "filesystem-tools",
    slug: "filesystem-tools",
    name: "Filesystem Tools",
    summary: "Remote-installable starter MCP for local document and code operations.",
    description: "Mock remote item used to validate login, entitlements, and remote MCP installation flow.",
    author: {
      id: "mellowcat",
      name: "MellowCat",
      verified: true
    },
    distribution: {
      type: "paid",
      priceText: "$5",
      currency: "USD",
      amount: 5
    },
    commerce: {
      checkoutUrl: "https://mellowcat.xyz/payment",
      productUrl: "https://mellowcat.xyz/payment",
      ctaLabel: "Buy"
    },
    latestVersion: "0.1.0",
    compatibility: {
      launcherMinVersion: "0.2.1",
      os: ["win32", "darwin", "linux"]
    },
    visibility: "public",
    tags: ["files", "starter", "official"],
    publishedAt: "2026-03-27T00:00:00.000Z",
    updatedAt: "2026-03-27T00:00:00.000Z",
    package: {
      source: "remote",
      remote: {
        manifestUrl: "mock://manifest/filesystem-tools/0.1.0",
        downloadUrl: "mock://package/filesystem-tools/0.1.0",
        checksumSha256: "mock-filesystem-tools-010",
        requiresAuth: true
      }
    },
    availability: {
      state: "installable"
    },
    workflow: {
      ids: []
    },
    entitlement: {
      status: "owned",
      source: "remote",
      checkedAt: "2026-03-27T09:05:00.000Z"
    }
  },
  {
    id: "youtube-publish-mcp",
    slug: "youtube-publish-mcp",
    name: "YouTube Publisher",
    summary: "Paid delivery module that opens a checkout flow when not owned.",
    description: "Mock remote item used to validate Buy/Unlock CTA handling before the real backend is live.",
    author: {
      id: "mellowcat",
      name: "MellowCat",
      verified: true
    },
    distribution: {
      type: "paid",
      priceText: "$19",
      currency: "USD",
      amount: 19
    },
    commerce: {
      checkoutUrl: "https://mellowcat.xyz/payment",
      productUrl: "https://mellowcat.xyz/payment",
      ctaLabel: "Buy"
    },
    latestVersion: "1.0.0",
    compatibility: {
      launcherMinVersion: "0.2.1",
      os: ["win32", "darwin", "linux"]
    },
    visibility: "public",
    tags: ["youtube", "delivery", "publisher"],
    publishedAt: "2026-03-27T00:00:00.000Z",
    updatedAt: "2026-03-27T00:00:00.000Z",
    package: {
      source: "remote",
      remote: {
        manifestUrl: "mock://manifest/youtube-publish-mcp/1.0.0",
        downloadUrl: "mock://package/youtube-publish-mcp/1.0.0",
        checksumSha256: "mock-youtube-publish-100",
        requiresAuth: true
      }
    },
    availability: {
      state: "installable"
    },
    workflow: {
      ids: ["shortform-automation-stack", "shortform-telegram-youtube"]
    },
    entitlement: {
      status: "not_owned",
      source: "remote",
      checkedAt: "2026-03-27T09:05:00.000Z"
    }
  }
];

export class MellowCatApiClient {
  private accessToken?: string;
  private baseUrl?: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  setBaseUrl(baseUrl?: string): void {
    this.baseUrl = baseUrl?.trim() || undefined;
  }

  isMockMode(): boolean {
    return this.baseUrl?.trim().toLowerCase() === "mock://remote";
  }

  setAccessToken(accessToken?: string): void {
    this.accessToken = accessToken?.trim() || undefined;
  }

  async getCatalog(): Promise<MCPCatalogItem[]> {
    const response = await this.request<MCPCatalogItem[] | RemoteListEnvelope<MCPCatalogItem>>(
      "/catalog"
    );
    return this.extractItems(response);
  }

  async getEntitlements(): Promise<MCPEntitlementRecord[]> {
    const response = await this.request<
      MCPEntitlementRecord[] | RemoteListEnvelope<MCPEntitlementRecord>
    >("/auth/entitlements");
    return this.extractItems(response);
  }

  async getSession(): Promise<AuthSession> {
    return this.request<AuthSession>("/auth/session");
  }

  async getMcpDownloadTicket(mcpId: string, version: string): Promise<MCPRemoteDownloadTicket> {
    return this.request<MCPRemoteDownloadTicket>(
      `/mcp/${encodeURIComponent(mcpId)}/download-ticket?version=${encodeURIComponent(version)}`
    );
  }

  async createPaymentHandoff(
    productId: string,
    source = "launcher"
  ): Promise<PaymentHandoffResponse> {
    return this.request<PaymentHandoffResponse>("/api/payment/handoff", {
      method: "POST",
      body: {
        productId,
        source
      }
    });
  }

  async startLauncherAuth(): Promise<LauncherAuthStartResponse> {
    return this.request<LauncherAuthStartResponse>("/api/auth/launcher/start", {
      method: "POST"
    });
  }

  async resolveLauncherAuth(requestId: string): Promise<LauncherAuthResolveResponse> {
    return this.request<LauncherAuthResolveResponse>("/api/auth/launcher/resolve", {
      method: "POST",
      body: {
        requestId
      }
    });
  }

  private async request<T>(
    pathname: string,
    init?: {
      method?: "GET" | "POST";
      body?: unknown;
    }
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error("MellowCat API base URL is not configured");
    }

    if (this.isMockMode()) {
      return this.handleMockRequest<T>(pathname, init);
    }

    const response = await fetch(new URL(pathname, this.baseUrl), {
      method: init?.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(this.accessToken
          ? { Authorization: `Bearer ${this.accessToken}` }
          : {})
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {})
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const detail = responseText.trim()
        ? ` ${responseText.trim().slice(0, 400)}`
        : "";
      throw new Error(`API request failed: ${response.status} ${response.statusText}${detail}`);
    }

    return (await response.json()) as T;
  }

  private handleMockRequest<T>(
    pathname: string,
    init?: {
      method?: "GET" | "POST";
      body?: unknown;
    }
  ): T {
    if (!this.accessToken?.trim()) {
      throw new Error("Mock remote mode requires a session token.");
    }

    if (pathname === "/catalog") {
      return { items: MOCK_CATALOG } as T;
    }

    if (pathname === "/auth/entitlements") {
      return { items: MOCK_ENTITLEMENTS } as T;
    }

    if (pathname === "/auth/session") {
      return {
        ...MOCK_SESSION,
        lastSyncedAt: new Date().toISOString()
      } as T;
    }

    if (pathname === "/payment/handoff" && init?.method === "POST") {
      const body = (init.body ?? {}) as { productId?: string };
      const productId = body.productId?.trim();
      if (!productId) {
        throw new Error("Mock payment handoff requires a productId.");
      }

      return {
        ok: true,
        handoffToken: `mock_handoff_${productId}`,
        paymentUrl: `https://mellowcat.xyz/payment?handoff=${encodeURIComponent(
          `mock_handoff_${productId}`
        )}`,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      } as T;
    }

    const downloadTicketMatch = pathname.match(
      /^\/mcp\/([^/]+)\/download-ticket\?version=(.+)$/
    );
    if (downloadTicketMatch) {
      const [, encodedId, encodedVersion] = downloadTicketMatch;
      const mcpId = decodeURIComponent(encodedId);
      const version = decodeURIComponent(encodedVersion);
      const catalogItem = MOCK_CATALOG.find((item) => item.id === mcpId);
      const remote = catalogItem?.package?.remote;
      if (!catalogItem || !remote?.manifestUrl || !remote.downloadUrl) {
        throw new Error(`Mock download ticket missing for ${mcpId}@${version}`);
      }

      return {
        mcpId,
        version,
        manifestUrl: remote.manifestUrl,
        downloadUrl: remote.downloadUrl,
        checksumSha256: remote.checksumSha256
      } as T;
    }

    throw new Error(`Unhandled mock API request: ${pathname}`);
  }

  private extractItems<T>(response: T[] | RemoteListEnvelope<T>): T[] {
    if (Array.isArray(response)) {
      return response;
    }

    return response.items;
  }
}
