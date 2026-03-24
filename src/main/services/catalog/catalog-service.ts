import fs from "node:fs";
import type { MCPCatalogItem } from "../../../common/types/mcp";
import { MellowCatApiClient } from "../../api/mellowcat-api-client";
import { EntitlementService } from "../auth/entitlement-service";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";

export class CatalogService {
  constructor(
    private readonly pathService: PathService,
    private readonly fileService: FileService,
    private readonly apiClient: MellowCatApiClient,
    private readonly entitlementService: EntitlementService
  ) {}

  async listCatalog(): Promise<MCPCatalogItem[]> {
    let catalog: MCPCatalogItem[] = [];

    if (this.apiClient.isConfigured()) {
      try {
        catalog = await this.apiClient.getCatalog();
        return this.attachEntitlements(catalog, "remote");
      } catch (_error) {
        // Fall back to the bundled catalog so the launcher remains usable offline.
      }
    }

    const catalogPath = this.pathService.getBundledCatalogPath();
    if (!fs.existsSync(catalogPath)) {
      return [];
    }

    catalog = this.fileService.readJsonFile<MCPCatalogItem[]>(catalogPath);
    return this.attachEntitlements(catalog, "bundled");
  }

  async getCatalogItem(mcpId: string): Promise<MCPCatalogItem | undefined> {
    const catalog = await this.listCatalog();
    return catalog.find((item) => item.id === mcpId);
  }

  private async attachEntitlements(
    catalog: MCPCatalogItem[],
    source: "remote" | "bundled"
  ): Promise<MCPCatalogItem[]> {
    const entitlements = await this.entitlementService.listEntitlements();
    const entitlementById = new Map(entitlements.map((record) => [record.mcpId, record]));

    return catalog.map((item) => ({
      ...item,
      entitlement: entitlementById.get(item.id)
        ? {
            status: entitlementById.get(item.id)?.status ?? "unknown",
            source: source === "remote" ? "remote" : "bundled",
            checkedAt:
              entitlementById.get(item.id)?.checkedAt ?? new Date().toISOString()
          }
        : item.entitlement
          ? {
              ...item.entitlement,
              source: item.entitlement.source ?? (source === "remote" ? "remote" : "bundled"),
              checkedAt: item.entitlement.checkedAt ?? new Date().toISOString()
            }
          : item.distribution.type === "free" || item.distribution.type === "bundled"
            ? {
                status: "free",
                source: source === "remote" ? "remote" : "bundled",
                checkedAt: new Date().toISOString()
              }
            : {
                status: "unknown",
                source: source === "remote" ? "remote" : "bundled",
                checkedAt: new Date().toISOString()
              }
    }));
  }
}
