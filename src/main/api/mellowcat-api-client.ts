import type { AuthSession } from "../../common/types/auth";
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

export class MellowCatApiClient {
  private accessToken?: string;

  constructor(private readonly baseUrl?: string) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
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

  private async request<T>(pathname: string): Promise<T> {
    if (!this.baseUrl) {
      throw new Error("MellowCat API base URL is not configured");
    }

    const response = await fetch(new URL(pathname, this.baseUrl), {
      headers: {
        Accept: "application/json",
        ...(this.accessToken
          ? { Authorization: `Bearer ${this.accessToken}` }
          : {})
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  private extractItems<T>(response: T[] | RemoteListEnvelope<T>): T[] {
    if (Array.isArray(response)) {
      return response;
    }

    return response.items;
  }
}
