import path from "node:path";
import { app } from "electron";
import { DEFAULT_VAULT_DIR_NAME } from "../../../common/constants/paths";

export class PathService {
  getAppDataPath(): string {
    return app.getPath("userData");
  }

  getDefaultVaultPath(): string {
    return path.join(this.getAppDataPath(), DEFAULT_VAULT_DIR_NAME);
  }

  getLocalManifestPath(): string {
    return path.join(this.getDefaultVaultPath(), "manifest.json");
  }

  getSettingsPath(): string {
    return path.join(this.getDefaultVaultPath(), "settings.json");
  }

  getSecretsPath(): string {
    return path.join(this.getDefaultVaultPath(), "secrets.json");
  }

  getAuthSessionPath(): string {
    return path.join(this.getDefaultVaultPath(), "auth-session.json");
  }

  getAutomationStatePath(fileName: string): string {
    return path.join(this.getDefaultVaultPath(), "automation", fileName);
  }

  getAutomationPackagesRootPath(): string {
    return path.join(this.getDefaultVaultPath(), "automation", "packages");
  }

  getAutomationPackagePath(jobId: string): string {
    return path.join(this.getAutomationPackagesRootPath(), jobId);
  }

  getAutomationJobsRootPath(): string {
    return this.getAutomationPackagesRootPath();
  }

  getAutomationJobPath(jobId: string): string {
    return this.getAutomationPackagePath(jobId);
  }

  getAutomationJobRecordPath(jobId: string): string {
    return path.join(this.getAutomationJobPath(jobId), "job.json");
  }

  getAutomationCheckpointPath(jobId: string, checkpointNumber: 1 | 2 | 3 | 4): string {
    return path.join(this.getAutomationJobPath(jobId), `checkpoint-${checkpointNumber}`, "checkpoint.json");
  }

  getAutomationCheckpointAttachmentsPath(
    jobId: string,
    checkpointNumber: 1 | 2 | 3 | 4
  ): string {
    return path.join(this.getAutomationJobPath(jobId), `checkpoint-${checkpointNumber}`, "attachments");
  }

  getBundledResourcesPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, "bundled")
      : path.join(app.getAppPath(), "resources", "bundled");
  }

  getBundledCatalogPath(): string {
    return path.join(this.getBundledResourcesPath(), "catalog.json");
  }

  getBundledPackagePath(mcpId: string): string {
    return path.join(this.getBundledResourcesPath(), mcpId);
  }

  getBundledToolPath(toolName: string): string {
    return path.join(this.getBundledResourcesPath(), "dev", toolName);
  }

  getBundledBackgroundPath(backgroundId: "horror" | "romance" | "community"): string {
    return path.join(this.getBundledResourcesPath(), "backgrounds", `${backgroundId}.png`);
  }

  getInstalledRootPath(mcpId: string): string {
    return path.join(this.getDefaultVaultPath(), "installed", mcpId);
  }

  getInstalledVersionsPath(mcpId: string): string {
    return path.join(this.getInstalledRootPath(mcpId), "versions");
  }

  getInstalledVersionPath(mcpId: string, version: string): string {
    return path.join(this.getInstalledVersionsPath(mcpId), version);
  }

  getInstalledCurrentPath(mcpId: string): string {
    return path.join(this.getInstalledRootPath(mcpId), "current");
  }

  getInstalledDataPath(mcpId: string): string {
    return path.join(this.getInstalledRootPath(mcpId), "data");
  }

  getGeneratedConfigPath(): string {
    return path.join(this.getDefaultVaultPath(), "generated", "mcp-settings.json");
  }

  getRemoteDownloadsRootPath(): string {
    return path.join(this.getDefaultVaultPath(), "downloads", "remote-mcp");
  }

  getRemoteDownloadTempPath(mcpId: string, version: string): string {
    return path.join(this.getRemoteDownloadsRootPath(), `${mcpId}-${version}`);
  }
}
