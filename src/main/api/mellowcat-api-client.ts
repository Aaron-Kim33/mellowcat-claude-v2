import type { AuthSession } from "../../common/types/auth";
import type { MCPCatalogItem } from "../../common/types/mcp";

export class MellowCatApiClient {
  constructor(private readonly baseUrl?: string) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async getCatalog(): Promise<MCPCatalogItem[]> {
    return this.request<MCPCatalogItem[]>("/catalog");
  }

  async getSession(): Promise<AuthSession> {
    return this.request<AuthSession>("/auth/session");
  }

  private async request<T>(pathname: string): Promise<T> {
    if (!this.baseUrl) {
      throw new Error("MellowCat API base URL is not configured");
    }

    const response = await fetch(new URL(pathname, this.baseUrl), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}
