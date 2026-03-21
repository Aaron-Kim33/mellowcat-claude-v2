import type { InstalledMCPRecord } from "../../../common/types/mcp";
import { ManifestRepository } from "../storage/manifest-repository";

export class MCPRegistryService {
  constructor(private readonly manifestRepository: ManifestRepository) {}

  listInstalled(): InstalledMCPRecord[] {
    return this.manifestRepository.listInstalled();
  }
}
