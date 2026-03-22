import path from "node:path";
import type {
  AutomationJobSnapshot,
  ShortformScriptDraft
} from "../../../common/types/automation";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";

export class ProductionPackageService {
  constructor(
    private readonly pathService: PathService,
    private readonly fileService: FileService
  ) {}

  createPackage(job: AutomationJobSnapshot, draft: ShortformScriptDraft): string {
    const packagePath = this.pathService.getAutomationPackagePath(job.id);
    this.fileService.ensureDir(packagePath);

    this.fileService.writeJsonFile(path.join(packagePath, "script.json"), {
      job,
      draft
    });

    this.fileService.writeTextFile(
      path.join(packagePath, "caption.txt"),
      `${draft.titleOptions[0]}\n\n${draft.hook}\n\n${draft.callToAction}`
    );

    this.fileService.writeTextFile(
      path.join(packagePath, "shotlist.md"),
      [
        `# Shotlist for ${job.title}`,
        "",
        "1. Open with the hook in the first 3 seconds.",
        "2. Show the core contrast or surprising point.",
        "3. Reframe for Korean audience context.",
        "4. End with CTA and curiosity gap."
      ].join("\n")
    );

    this.fileService.writeTextFile(
      path.join(packagePath, "thumbnail.txt"),
      draft.titleOptions.slice(0, 2).join("\n")
    );

    return packagePath;
  }
}
