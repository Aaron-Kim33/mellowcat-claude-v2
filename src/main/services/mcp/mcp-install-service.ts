import fs from "node:fs";
import path from "node:path";
import type {
  InstalledMCPRecord,
  MCPCatalogItem,
  MCPPackageManifest
} from "../../../common/types/mcp";
import { CatalogService } from "../catalog/catalog-service";
import { FileService } from "../system/file-service";
import { ManifestRepository } from "../storage/manifest-repository";
import { PathService } from "../system/path-service";

export class MCPInstallService {
  constructor(
    private readonly manifestRepository: ManifestRepository,
    private readonly pathService: PathService,
    private readonly fileService: FileService,
    private readonly catalogService: CatalogService
  ) {}

  async install(mcpId: string): Promise<void> {
    const catalogItem = await this.requireCatalogItem(mcpId);
    const packageManifest = this.readBundledManifest(mcpId);
    this.validatePackageManifest(catalogItem, packageManifest);

    const versionPath = this.pathService.getInstalledVersionPath(mcpId, packageManifest.version);
    const currentPath = this.pathService.getInstalledCurrentPath(mcpId);
    const bundledPackagePath = this.pathService.getBundledPackagePath(mcpId);

    this.fileService.ensureDir(this.pathService.getInstalledVersionsPath(mcpId));
    this.fileService.ensureDir(this.pathService.getInstalledDataPath(mcpId));
    this.fileService.remove(versionPath);
    this.fileService.copyDirectory(bundledPackagePath, versionPath);
    this.refreshCurrentVersion(versionPath, currentPath);

    const record: InstalledMCPRecord = {
      id: mcpId,
      version: packageManifest.version,
      installState: "installed",
      enabled: true,
      installPath: currentPath,
      entrypoint: packageManifest.entrypoint,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: {
        type: "bundled"
      },
      entitlement: {
        status: "free",
        checkedAt: new Date().toISOString()
      },
      runtime: {
        status: "stopped"
      }
    };

    this.manifestRepository.upsert(record);
  }

  async uninstall(mcpId: string): Promise<void> {
    this.fileService.remove(this.pathService.getInstalledRootPath(mcpId));
    this.manifestRepository.remove(mcpId);
  }

  private async requireCatalogItem(mcpId: string): Promise<MCPCatalogItem> {
    const catalogItem = await this.catalogService.getCatalogItem(mcpId);
    if (!catalogItem) {
      throw new Error(`Catalog item not found: ${mcpId}`);
    }
    return catalogItem;
  }

  private readBundledManifest(mcpId: string): MCPPackageManifest {
    const manifestPath = path.join(this.pathService.getBundledPackagePath(mcpId), "mcp.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Bundled MCP manifest missing for ${mcpId}`);
    }
    return this.fileService.readJsonFile<MCPPackageManifest>(manifestPath);
  }

  private validatePackageManifest(
    catalogItem: MCPCatalogItem,
    packageManifest: MCPPackageManifest
  ): void {
    if (catalogItem.id !== packageManifest.id) {
      throw new Error(`Catalog/package mismatch for ${catalogItem.id}`);
    }

    if (!packageManifest.entrypoint) {
      throw new Error(`Package entrypoint missing for ${catalogItem.id}`);
    }
  }

  private refreshCurrentVersion(versionPath: string, currentPath: string): void {
    this.fileService.remove(currentPath);
    this.fileService.copyDirectory(versionPath, currentPath);
  }
}
