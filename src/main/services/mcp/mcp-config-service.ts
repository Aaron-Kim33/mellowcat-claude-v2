import fs from "node:fs";
import path from "node:path";
import { ManifestRepository } from "../storage/manifest-repository";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";

export class MCPConfigService {
  constructor(
    private readonly manifestRepository: ManifestRepository,
    private readonly pathService: PathService,
    private readonly fileService: FileService
  ) {}

  async regenerateConfig(): Promise<void> {
    const enabled = this.manifestRepository
      .listInstalled()
      .filter((item) => item.enabled)
      .map((item) => ({
        id: item.id,
        version: item.version,
        installPath: item.installPath,
        entrypoint: item.entrypoint,
        runtimeStatus: item.runtime.status
      }));

    const configPath = this.pathService.getGeneratedConfigPath();
    this.fileService.ensureDir(path.dirname(configPath));
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          enabled
        },
        null,
        2
      ),
      "utf-8"
    );
  }
}
