import type {
  MCPEntitlementRecord,
  MCPEntitlementStatus
} from "../../../common/types/mcp";
import { MellowCatApiClient } from "../../api/mellowcat-api-client";

export class EntitlementService {
  constructor(private readonly apiClient: MellowCatApiClient) {}

  private entitlements: MCPEntitlementRecord[] = [];

  async listEntitlements(): Promise<MCPEntitlementRecord[]> {
    if (this.apiClient.isConfigured()) {
      try {
        this.entitlements = await this.apiClient.getEntitlements();
        return this.entitlements;
      } catch {
        return this.entitlements;
      }
    }

    return this.entitlements;
  }

  async getStatus(mcpId: string): Promise<MCPEntitlementStatus> {
    const records = await this.listEntitlements();
    return records.find((record) => record.mcpId === mcpId)?.status ?? "free";
  }
}
