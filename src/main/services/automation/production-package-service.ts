import path from "node:path";
import type {
  AutomationJobSnapshot,
  ShortformScriptDraft
} from "../../../common/types/automation";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";
import { ShortformWorkflowConfigService } from "./shortform-workflow-config-service";

export class ProductionPackageService {
  constructor(
    private readonly pathService: PathService,
    private readonly fileService: FileService,
    private readonly workflowConfigService: ShortformWorkflowConfigService
  ) {}

  createPackage(job: AutomationJobSnapshot, draft: ShortformScriptDraft): string {
    const packagePath = this.pathService.getAutomationPackagePath(job.id);
    const workflowConfig = this.workflowConfigService.get();
    this.fileService.ensureDir(packagePath);
    const primaryTitle = draft.titleOptions[0] ?? job.title;
    const secondaryTitle = draft.titleOptions[1] ?? primaryTitle;
    const shortCaption = `${primaryTitle}\n\n${draft.hook}\n\n${draft.callToAction}`;
    const hashtags = this.buildHashtags(primaryTitle, draft);
    const uploadTitle = this.clamp(primaryTitle, 70);
    const uploadDescription = [
      draft.hook,
      "",
      draft.narration,
      "",
      draft.callToAction,
      "",
      hashtags
    ].join("\n");

    this.fileService.writeJsonFile(path.join(packagePath, "script.json"), {
      job,
      draft
    });

    this.fileService.writeJsonFile(path.join(packagePath, "package.json"), {
      jobId: job.id,
      title: job.title,
      createdAt: job.updatedAt,
      stage: job.stage,
      outputs: [
        "script.json",
        "caption.txt",
        "narration.txt",
        "hook.txt",
        "thumbnail.txt",
        "shotlist.md",
        "asset-prompts.md",
        "upload-metadata.json",
        "youtube-upload-request.json",
        "production-checklist.md"
      ]
    });

    this.fileService.writeTextFile(
      path.join(packagePath, "caption.txt"),
      shortCaption
    );

    this.fileService.writeTextFile(path.join(packagePath, "narration.txt"), draft.narration);
    this.fileService.writeTextFile(path.join(packagePath, "hook.txt"), draft.hook);

    this.fileService.writeTextFile(
      path.join(packagePath, "shotlist.md"),
      [
        `# Shotlist for ${job.title}`,
        "",
        "1. Hook shot (0-3s)",
        `   - On-screen line: ${draft.hook}`,
        "   - Visual: strongest emotional or contrast image first",
        "",
        "2. Context shot (3-8s)",
        "   - Show who, what, and why this situation matters",
        "   - Add Korean audience framing in subtitle copy",
        "",
        "3. Escalation shot (8-18s)",
        "   - Highlight the tension, gap, or betrayal point",
        "   - Use fast captions to keep retention high",
        "",
        "4. Payoff shot (18-25s)",
        "   - Deliver the key twist or strongest interpretation",
        "",
        "5. CTA ending (last 3s)",
        `   - Close with: ${draft.callToAction}`
      ].join("\n")
    );

    this.fileService.writeTextFile(
      path.join(packagePath, "thumbnail.txt"),
      [primaryTitle, secondaryTitle, this.buildThumbnailLine(primaryTitle)].join("\n")
    );

    this.fileService.writeTextFile(
      path.join(packagePath, "asset-prompts.md"),
      [
        "# Asset Prompts",
        "",
        "## Thumbnail prompt",
        `- Build a bold Korean shortform thumbnail around: ${primaryTitle}`,
        "- Emphasize contrast, emotion, and one dominant keyword.",
        "",
        "## B-roll prompt",
        `- Visualize the core situation behind: ${draft.hook}`,
        "- Focus on tension, reaction, and social commentary energy.",
        "",
        "## Subtitle style",
        "- Fast, high-contrast Korean subtitles",
        "- Keep each line under 18 Korean characters when possible"
      ].join("\n")
    );

    this.fileService.writeJsonFile(
      path.join(packagePath, "upload-metadata.json"),
      {
        title: uploadTitle,
        description: uploadDescription,
        hashtags: hashtags.split(" "),
        titleOptions: draft.titleOptions,
        callToAction: draft.callToAction,
        youtube: {
          channelLabel: workflowConfig.youtubeChannelLabel,
          privacyStatus: workflowConfig.youtubePrivacyStatus ?? "private",
          categoryId: workflowConfig.youtubeCategoryId ?? "22",
          selfDeclaredMadeForKids:
            (workflowConfig.youtubeAudience ?? "not_made_for_kids") === "made_for_kids"
        }
      }
    );

    this.fileService.writeJsonFile(
      path.join(packagePath, "youtube-upload-request.json"),
      {
        platform: "youtube",
        status: "draft",
        videoFilePath: "",
        thumbnailFilePath: "",
        scheduledPublishAt: "",
        metadata: {
          title: uploadTitle,
          description: uploadDescription,
          tags: hashtags.split(" "),
          categoryId: workflowConfig.youtubeCategoryId ?? "22",
          privacyStatus: workflowConfig.youtubePrivacyStatus ?? "private",
          selfDeclaredMadeForKids:
            (workflowConfig.youtubeAudience ?? "not_made_for_kids") === "made_for_kids"
        }
      }
    );

    this.fileService.writeTextFile(
      path.join(packagePath, "production-checklist.md"),
      [
        "# Production Checklist",
        "",
        "- Confirm the chosen title option",
        "- Tighten hook for first 3 seconds if needed",
        "- Add Korean subtitles with strong contrast words",
        "- Prepare thumbnail using `thumbnail.txt`",
        "- Prepare upload copy using `upload-metadata.json`",
        "- Fill in local video path and schedule in `youtube-upload-request.json`",
        "- Review CTA tone before publishing"
      ].join("\n")
    );

    return packagePath;
  }

  private buildHashtags(primaryTitle: string, draft: ShortformScriptDraft): string {
    const baseTags = ["#shorts", "#koreanshorts", "#viral", "#storytime"];
    const keywordTag = this.keywordToHashtag(primaryTitle);
    const ctaTag = this.keywordToHashtag(draft.callToAction);
    return [...new Set([...baseTags, keywordTag, ctaTag].filter(Boolean))].join(" ");
  }

  private keywordToHashtag(value: string): string {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, " ")
      .split(/\s+/)
      .find((item) => item.length >= 2);

    return normalized ? `#${normalized}` : "";
  }

  private buildThumbnailLine(title: string): string {
    if (title.length <= 18) {
      return title;
    }

    return `${title.slice(0, 15)}...`;
  }

  private clamp(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
  }
}
