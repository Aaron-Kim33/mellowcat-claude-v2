import { CatalogService } from "../catalog/catalog-service";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";
import { ManifestRepository } from "../storage/manifest-repository";
import { MCPInstallService } from "./mcp-install-service";

export class MCPUpdateService {
  constructor(
    private readonly manifestRepository: ManifestRepository,
    private readonly catalogService: CatalogService,
    private readonly installService: MCPInstallService,
    private readonly pathService: PathService,
    private readonly fileService: FileService
  ) {}

  async update(mcpId: string): Promise<void> {
    const record = this.manifestRepository.listInstalled().find((item) => item.id === mcpId);
    if (!record) {
      throw new Error(`MCP not installed: ${mcpId}`);
    }

    const catalogItem = await this.catalogService.getCatalogItem(mcpId);
    if (!catalogItem) {
      throw new Error(`Catalog item not found: ${mcpId}`);
    }

    if (catalogItem.latestVersion === record.version) {
      this.manifestRepository.upsert({
        ...record,
        updatedAt: new Date().toISOString()
      });
      return;
    }

    this.fileService.remove(this.pathService.getInstalledCurrentPath(mcpId));
    await this.installService.install(mcpId);
  }
}
