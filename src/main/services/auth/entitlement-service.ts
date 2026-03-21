import type { MCPEntitlementStatus } from "../../../common/types/mcp";

export class EntitlementService {
  async getStatus(): Promise<MCPEntitlementStatus> {
    return "free";
  }
}
