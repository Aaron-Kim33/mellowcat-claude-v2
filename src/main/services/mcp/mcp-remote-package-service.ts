import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  MCPCatalogItem,
  MCPPackageManifest
} from "../../../common/types/mcp";
import { MellowCatApiClient } from "../../api/mellowcat-api-client";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";

const execFileAsync = promisify(execFile);

export interface RemoteInstallPayload {
  packageManifest: MCPPackageManifest;
  sourceUrl?: string;
  checksumSha256?: string;
}

export class MCPRemotePackageService {
  constructor(
    private readonly apiClient: MellowCatApiClient,
    private readonly pathService: PathService,
    private readonly fileService: FileService
  ) {}

  async prepareInstall(catalogItem: MCPCatalogItem): Promise<RemoteInstallPayload> {
    if (catalogItem.package?.source !== "remote") {
      throw new Error(`Catalog item ${catalogItem.id} is not marked as a remote package.`);
    }

    const remotePackage = catalogItem.package.remote;
    if (!remotePackage?.manifestUrl && !this.apiClient.isConfigured()) {
      throw new Error(
        "Remote MCP installation needs either a configured API base URL or an explicit manifest URL."
      );
    }

    if (this.apiClient.isConfigured()) {
      const ticket = await this.apiClient.getMcpDownloadTicket(
        catalogItem.id,
        catalogItem.latestVersion
      );

      return {
        packageManifest: await this.readManifest(ticket.manifestUrl),
        sourceUrl: ticket.downloadUrl,
        checksumSha256: ticket.checksumSha256
      };
    }

    return {
      packageManifest: await this.readManifest(remotePackage!.manifestUrl!),
      sourceUrl: remotePackage?.downloadUrl,
      checksumSha256: remotePackage?.checksumSha256
    };
  }

  async downloadAndExtract(
    mcpId: string,
    version: string,
    downloadUrl: string,
    targetPath: string,
    checksumSha256?: string
  ): Promise<void> {
    if (downloadUrl.startsWith("mock://package/")) {
      const parts = downloadUrl.split("/");
      const packageId = parts[3];
      this.fileService.remove(targetPath);
      this.fileService.copyDirectory(this.pathService.getBundledPackagePath(packageId), targetPath);
      return;
    }

    const tempRoot = this.pathService.getRemoteDownloadTempPath(mcpId, version);
    const archivePath = path.join(tempRoot, "package.zip");
    const extractPath = path.join(tempRoot, "unzipped");

    this.fileService.remove(tempRoot);
    this.fileService.ensureDir(tempRoot);
    this.fileService.ensureDir(extractPath);

    const response = await fetch(downloadUrl, {
      headers: {
        Accept: "application/octet-stream"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Remote MCP archive request failed: ${response.status} ${response.statusText}`
      );
    }

    const archiveBuffer = Buffer.from(await response.arrayBuffer());
    this.fileService.writeBinaryFile(archivePath, archiveBuffer);

    if (checksumSha256) {
      const actualChecksum = crypto
        .createHash("sha256")
        .update(archiveBuffer)
        .digest("hex");
      if (actualChecksum.toLowerCase() !== checksumSha256.toLowerCase()) {
        throw new Error(`Remote MCP checksum mismatch for ${mcpId}@${version}`);
      }
    }

    await this.extractArchive(archivePath, extractPath);

    const packageRoot = this.resolveExtractedPackageRoot(extractPath);
    this.fileService.remove(targetPath);
    this.fileService.copyDirectory(packageRoot, targetPath);
  }

  private async readManifest(manifestUrl: string): Promise<MCPPackageManifest> {
    if (manifestUrl.startsWith("mock://manifest/")) {
      const parts = manifestUrl.split("/");
      const packageId = parts[3];
      return this.fileService.readJsonFile<MCPPackageManifest>(
        path.join(this.pathService.getBundledPackagePath(packageId), "mcp.json")
      );
    }

    const response = await fetch(manifestUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Remote MCP manifest request failed: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as MCPPackageManifest;
  }

  private async extractArchive(archivePath: string, extractPath: string): Promise<void> {
    if (process.platform === "win32") {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${extractPath.replace(/'/g, "''")}' -Force`
      ]);
      return;
    }

    const unzipExecutable = process.platform === "darwin" || process.platform === "linux"
      ? "unzip"
      : undefined;

    if (!unzipExecutable) {
      throw new Error(`Remote MCP extraction is not supported on ${os.platform()} yet.`);
    }

    await execFileAsync(unzipExecutable, ["-o", archivePath, "-d", extractPath]);
  }

  private resolveExtractedPackageRoot(extractPath: string): string {
    const manifestAtRoot = path.join(extractPath, "mcp.json");
    if (fs.existsSync(manifestAtRoot)) {
      return extractPath;
    }

    const childEntries = fs
      .readdirSync(extractPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(extractPath, entry.name));

    for (const childPath of childEntries) {
      if (fs.existsSync(path.join(childPath, "mcp.json"))) {
        return childPath;
      }
    }

    throw new Error("Remote MCP archive did not contain an mcp.json manifest.");
  }
}
