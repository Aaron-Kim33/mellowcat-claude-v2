import path from "node:path";
import type {
  AutomationJobSnapshot,
  AutomationJobStage,
  ShortformScriptDraft
} from "../../../common/types/automation";
import type { GeneratedMediaPackageManifest } from "../../../common/types/media-generation";
import type { WorkflowCheckpointEnvelope, WorkflowJobSnapshot } from "../../../common/types/slot-workflow";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";
import { ShortformWorkflowConfigService } from "./shortform-workflow-config-service";
import { CheckpointWorkflowService } from "./checkpoint-workflow-service";
import { PexelsAssetService } from "./pexels-asset-service";
import { ScenePlanService } from "./scene-plan-service";
import { SubtitleService } from "./subtitle-service";
import { VoiceoverService } from "./voiceover-service";
import { MediaCompositionService } from "./media-composition-service";

export class ProductionPackageService {
  constructor(
    private readonly pathService: PathService,
    private readonly fileService: FileService,
    private readonly workflowConfigService: ShortformWorkflowConfigService,
    private readonly checkpointWorkflowService: CheckpointWorkflowService,
    private readonly scenePlanService: ScenePlanService,
    private readonly pexelsAssetService: PexelsAssetService,
    private readonly subtitleService: SubtitleService,
    private readonly voiceoverService: VoiceoverService,
    private readonly mediaCompositionService: MediaCompositionService
  ) {}

  async runCreatePipeline(jobId: string): Promise<WorkflowJobSnapshot> {
    const snapshot = this.checkpointWorkflowService.inspectJob(jobId);
    if (!snapshot.job) {
      throw new Error(`Workflow job ${jobId} was not found.`);
    }

    const processCheckpoint = snapshot.checkpoints[2] as
      | WorkflowCheckpointEnvelope<{
          scriptDraft?: ShortformScriptDraft;
        }>
      | undefined;
    const draft = processCheckpoint?.payload?.scriptDraft;
    if (!draft) {
      throw new Error("checkpoint-2가 아직 없어 소재 생성을 시작할 수 없습니다.");
    }

    const now = new Date().toISOString();
    const job: AutomationJobSnapshot = {
      id: snapshot.job.jobId,
      title: snapshot.job.title,
      stage: this.resolveCreateStage(snapshot.job.currentStage),
      createdAt: snapshot.job.createdAt,
      updatedAt: now
    };

    await this.createPackage(job, draft);

    return this.checkpointWorkflowService.inspectJob(jobId);
  }

  async createPackage(job: AutomationJobSnapshot, draft: ShortformScriptDraft): Promise<string> {
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
    const scenePlanResult = await this.scenePlanService.generateScenePlan(draft, primaryTitle);
    const scenePlan = scenePlanResult.document;

    this.fileService.writeJsonFile(path.join(packagePath, "script.json"), {
      job,
      draft
    });
    this.fileService.writeJsonFile(path.join(packagePath, "scene-plan-source.json"), {
      source: scenePlanResult.source,
      error: scenePlanResult.error ?? null
    });
    this.fileService.writeJsonFile(path.join(packagePath, "scene-plan.json"), scenePlan);

    this.fileService.writeJsonFile(path.join(packagePath, "package.json"), {
      jobId: job.id,
      title: job.title,
      createdAt: job.updatedAt,
      stage: job.stage,
      outputs: [
        "script.json",
        "scene-plan-source.json",
        "scene-plan.json",
        "asset-manifest.json",
        "voiceover-cues.json",
        "voiceover-script.txt",
        "voiceover-source.json",
        "voiceover.mp3",
        "captions.srt",
        "composition-source.json",
        "final-video.mp4",
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
    const generatedMediaManifest: GeneratedMediaPackageManifest = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      provider: "youtube-material-generator-mcp",
      language: "ko",
      totalDurationSec: scenePlan.totalDurationSec,
      scenes: scenePlan.scenes.map((scene) => ({
        sceneIndex: scene.index,
        fallbackUsed: true,
        trim: {
          sourceStartSec: 0,
          sourceEndSec: scene.durationSec
        }
      })),
      voiceoverCues: scenePlan.scenes.map((scene) => ({
        sceneIndex: scene.index,
        startSec: scene.startSec,
        endSec: scene.endSec,
        text: scene.text
      })),
      subtitles: scenePlan.scenes.map((scene, index) => ({
        index: index + 1,
        startSec: scene.startSec,
        endSec: scene.endSec,
        text: scene.text
      })),
      artifacts: {
        scenePlanPath: "scene-plan.json",
        assetsManifestPath: "asset-manifest.json",
        voiceoverPath: "",
        subtitlePath: "",
        finalVideoPath: "",
        thumbnailPath: undefined
      }
    };
    const enrichedMediaManifest = await this.pexelsAssetService.enrichManifestWithPexels(
      generatedMediaManifest,
      scenePlan,
      workflowConfig.pexelsApiKey
    );
    const subtitleContents = this.subtitleService.buildSrt(enrichedMediaManifest.subtitles);
    const voiceoverScript = this.subtitleService.buildVoiceoverScript(
      enrichedMediaManifest.voiceoverCues
    );
    this.fileService.writeJsonFile(
      path.join(packagePath, "voiceover-cues.json"),
      enrichedMediaManifest.voiceoverCues
    );
    this.fileService.writeTextFile(
      path.join(packagePath, "voiceover-script.txt"),
      voiceoverScript
    );
    this.fileService.writeTextFile(path.join(packagePath, "captions.srt"), subtitleContents);
    const voiceoverResult = await this.voiceoverService.generateVoiceover(
      enrichedMediaManifest.voiceoverCues,
      packagePath
    );
    this.fileService.writeJsonFile(path.join(packagePath, "voiceover-source.json"), {
      source: voiceoverResult.source,
      error: voiceoverResult.error ?? null
    });
    let finalizedMediaManifest: GeneratedMediaPackageManifest = {
      ...enrichedMediaManifest,
      artifacts: {
        ...enrichedMediaManifest.artifacts,
        voiceoverPath: voiceoverResult.relativePath ?? "",
        subtitlePath: "captions.srt"
      }
    };
    const compositionResult = await this.mediaCompositionService.composeFinalVideo(
      finalizedMediaManifest,
      packagePath
    );
    finalizedMediaManifest = compositionResult.manifest;
    this.fileService.writeJsonFile(path.join(packagePath, "composition-source.json"), {
      source: compositionResult.source,
      error: compositionResult.error ?? null
    });
    this.fileService.writeJsonFile(
      path.join(packagePath, "asset-manifest.json"),
      finalizedMediaManifest
    );

    const uploadRequest = {
      platform: "youtube" as const,
      status: "draft" as const,
      videoFilePath: compositionResult.relativePath
        ? path.join(packagePath, compositionResult.relativePath)
        : "",
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
    };

    this.fileService.writeJsonFile(
      path.join(packagePath, "youtube-upload-request.json"),
      uploadRequest
    );

    this.fileService.writeTextFile(
      path.join(packagePath, "production-checklist.md"),
      [
        "# Production Checklist",
        "",
        "- Review `scene-plan.json` before collecting assets",
        "- Populate `asset-manifest.json` with selected scene assets",
        "- Review `voiceover-cues.json` and `voiceover-script.txt` before TTS generation",
        "- Confirm `voiceover-source.json` and generated dubbing audio from the scene timing",
        "- Confirm `captions.srt` lines and timing from the same scene map",
        "- Confirm `composition-source.json` and the generated `final-video.mp4`",
        "- Confirm the chosen title option",
        "- Tighten hook for first 3 seconds if needed",
        "- Add Korean subtitles with strong contrast words",
        "- Prepare thumbnail using `thumbnail.txt`",
        "- Prepare upload copy using `upload-metadata.json`",
        "- Fill in local video path and schedule in `youtube-upload-request.json`",
        "- Review CTA tone before publishing"
      ].join("\n")
    );

    this.checkpointWorkflowService.writeCreateCheckpoint({
      job,
      packagePath,
      draft,
      uploadRequest
    });
    this.checkpointWorkflowService.writeOutputCheckpoint({
      job,
      uploadRequest
    });

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

  private resolveCreateStage(currentStage: string): AutomationJobStage {
    if (currentStage === "error" || currentStage === "rejected") {
      return "error";
    }
    return "ready";
  }
}
