import fs from "node:fs";
import type { MCPCatalogItem } from "../../../common/types/mcp";
import { MellowCatApiClient } from "../../api/mellowcat-api-client";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";

export class CatalogService {
  constructor(
    private readonly pathService: PathService,
    private readonly fileService: FileService,
    private readonly apiClient: MellowCatApiClient
  ) {}

  async listCatalog(): Promise<MCPCatalogItem[]> {
    if (this.apiClient.isConfigured()) {
      try {
        return await this.apiClient.getCatalog();
      } catch (_error) {
        // Fall back to the bundled catalog so the launcher remains usable offline.
      }
    }

    const catalogPath = this.pathService.getBundledCatalogPath();
    if (!fs.existsSync(catalogPath)) {
      return [];
    }

    return this.fileService.readJsonFile<MCPCatalogItem[]>(catalogPath);
  }

  async getCatalogItem(mcpId: string): Promise<MCPCatalogItem | undefined> {
    const catalog = await this.listCatalog();
    return catalog.find((item) => item.id === mcpId);
  }
}
