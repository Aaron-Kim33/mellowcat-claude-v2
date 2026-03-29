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
import { MCPRemotePackageService } from "./mcp-remote-package-service";

export class MCPInstallService {
  constructor(
    private readonly manifestRepository: ManifestRepository,
    private readonly pathService: PathService,
    private readonly fileService: FileService,
    private readonly catalogService: CatalogService,
    private readonly remotePackageService: MCPRemotePackageService
  ) {}

  async install(mcpId: string): Promise<void> {
    const catalogItem = await this.requireCatalogItem(mcpId);
    this.ensureInstallAllowed(catalogItem);
    const existingRecord = this.manifestRepository.listInstalled().find((item) => item.id === mcpId);
    const isRemotePackage = catalogItem.package?.source === "remote";
    const currentPath = this.pathService.getInstalledCurrentPath(mcpId);
    this.manifestRepository.upsert(
      this.buildInstallRecord(catalogItem, currentPath, {
        existingRecord,
        installState: existingRecord ? "updating" : "downloading",
        version: existingRecord?.version ?? catalogItem.latestVersion
      })
    );

    try {
    const remoteInstall = isRemotePackage
      ? await this.remotePackageService.prepareInstall(catalogItem)
      : undefined;

    const packageManifest = remoteInstall?.packageManifest ?? this.readBundledManifest(mcpId);
    this.validatePackageManifest(catalogItem, packageManifest);

    const versionPath = this.pathService.getInstalledVersionPath(mcpId, packageManifest.version);
    const bundledPackagePath = this.pathService.getBundledPackagePath(mcpId);

    this.fileService.ensureDir(this.pathService.getInstalledVersionsPath(mcpId));
    this.fileService.ensureDir(this.pathService.getInstalledDataPath(mcpId));
    this.fileService.remove(versionPath);
    if (isRemotePackage) {
      if (!remoteInstall?.sourceUrl) {
        throw new Error(`Remote MCP package URL missing for ${mcpId}`);
      }
      await this.remotePackageService.downloadAndExtract(
        mcpId,
        packageManifest.version,
        remoteInstall.sourceUrl,
        versionPath,
        remoteInstall.checksumSha256
      );
    } else {
      this.fileService.copyDirectory(bundledPackagePath, versionPath);
    }
    this.refreshCurrentVersion(versionPath, currentPath);

      this.manifestRepository.upsert(
        this.buildInstallRecord(catalogItem, currentPath, {
          existingRecord,
          installState: "installed",
          version: packageManifest.version,
          entrypoint: packageManifest.entrypoint,
          sourceUrl: remoteInstall?.sourceUrl
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Install failed.";
      this.manifestRepository.upsert(
        this.buildInstallRecord(catalogItem, currentPath, {
          existingRecord,
          installState: "error",
          version: existingRecord?.version ?? catalogItem.latestVersion,
          lastError: message
        })
      );
      throw error;
    }
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

  private ensureInstallAllowed(catalogItem: MCPCatalogItem): void {
    const entitlementStatus = catalogItem.entitlement?.status;
    if (entitlementStatus === "not_owned") {
      throw new Error(`This MCP is not owned yet. Complete purchase before installing ${catalogItem.name}.`);
    }
  }

  private refreshCurrentVersion(versionPath: string, currentPath: string): void {
    this.fileService.remove(currentPath);
    this.fileService.copyDirectory(versionPath, currentPath);
  }

  private buildInstallRecord(
    catalogItem: MCPCatalogItem,
    currentPath: string,
    options: {
      existingRecord?: InstalledMCPRecord;
      installState: InstalledMCPRecord["installState"];
      version: string;
      entrypoint?: string;
      sourceUrl?: string;
      lastError?: string;
    }
  ): InstalledMCPRecord {
    const now = new Date().toISOString();
    const existingRecord = options.existingRecord;
    const isRemotePackage = catalogItem.package?.source === "remote";

    return {
      id: catalogItem.id,
      version: options.version,
      installState: options.installState,
      enabled: existingRecord?.enabled ?? true,
      installPath: currentPath,
      entrypoint: options.entrypoint ?? existingRecord?.entrypoint,
      installedAt:
        options.installState === "installed"
          ? existingRecord?.installedAt ?? now
          : existingRecord?.installedAt,
      updatedAt: now,
      lastError: options.lastError,
      source: {
        type: isRemotePackage ? "remote" : "bundled",
        url: options.sourceUrl ?? existingRecord?.source.url
      },
      workflow: {
        ids: catalogItem.workflow?.ids ?? existingRecord?.workflow?.ids ?? []
      },
      entitlement: {
        status: catalogItem.entitlement?.status ?? existingRecord?.entitlement.status ?? "free",
        checkedAt: now
      },
      runtime: existingRecord?.runtime ?? {
        status: "stopped"
      }
    };
  }
}
