import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { InstalledMCPRecord, LocalManifest } from "../../../common/types/mcp";
import { createEmptyManifest } from "../../../common/schemas/manifest";
import { PathService } from "../system/path-service";

export class ManifestRepository {
  constructor(private readonly pathService: PathService) {}

  ensureManifest(): LocalManifest {
    const manifestPath = this.pathService.getLocalManifestPath();
    const dir = path.dirname(manifestPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(manifestPath)) {
      const manifest = createEmptyManifest(app.getVersion());
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
      return manifest;
    }

    return this.read();
  }

  read(): LocalManifest {
    const manifestPath = this.pathService.getLocalManifestPath();
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as LocalManifest;
  }

  write(manifest: LocalManifest): LocalManifest {
    const nextManifest = {
      ...manifest,
      generatedAt: new Date().toISOString()
    };

    fs.writeFileSync(
      this.pathService.getLocalManifestPath(),
      JSON.stringify(nextManifest, null, 2),
      "utf-8"
    );

    return nextManifest;
  }

  listInstalled(): InstalledMCPRecord[] {
    return this.ensureManifest().installed;
  }

  upsert(record: InstalledMCPRecord): LocalManifest {
    const manifest = this.ensureManifest();
    const installed = manifest.installed.filter((item) => item.id !== record.id);
    installed.push(record);
    return this.write({ ...manifest, installed });
  }

  remove(id: string): LocalManifest {
    const manifest = this.ensureManifest();
    return this.write({
      ...manifest,
      installed: manifest.installed.filter((item) => item.id !== id)
    });
  }
}
