import fs from "node:fs";
import path from "node:path";
import type {
  AutomationJobSnapshot,
  AutomationJobStage,
  ShortformScriptCategory,
  ShortformScriptDraft
} from "../../../common/types/automation";
import type { GeneratedMediaPackageManifest } from "../../../common/types/media-generation";
import type {
  CreateReadinessSnapshot,
  WorkflowCheckpointEnvelope,
  WorkflowJobSnapshot
} from "../../../common/types/slot-workflow";
import { SettingsRepository } from "../storage/settings-repository";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";
import { ShortformWorkflowConfigService } from "./shortform-workflow-config-service";
import { CheckpointWorkflowService } from "./checkpoint-workflow-service";
import { PexelsAssetService } from "./pexels-asset-service";
import { ScenePlanService } from "./scene-plan-service";
import { SubtitleService } from "./subtitle-service";
import { VoiceoverService } from "./voiceover-service";
import { MediaCompositionService } from "./media-composition-service";
import type { OperatorChannelService } from "./operator-channel-service";

export class ProductionPackageService {
  constructor(
    private readonly pathService: PathService,
    private readonly fileService: FileService,
    private readonly settingsRepository: SettingsRepository,
    private readonly workflowConfigService: ShortformWorkflowConfigService,
    private readonly checkpointWorkflowService: CheckpointWorkflowService,
    private readonly scenePlanService: ScenePlanService,
    private readonly pexelsAssetService: PexelsAssetService,
    private readonly subtitleService: SubtitleService,
    private readonly voiceoverService: VoiceoverService,
    private readonly mediaCompositionService: MediaCompositionService,
    private readonly operatorChannelService?: OperatorChannelService
  ) {}

  private writeCreateProgress(
    packagePath: string,
    stage: "scene_plan" | "asset_prep" | "voiceover" | "composition",
    status: "running" | "completed" | "failed",
    detail: string
  ) {
    this.fileService.writeJsonFile(path.join(packagePath, "create-progress.json"), {
      stage,
      status,
      detail,
      updatedAt: new Date().toISOString()
    });
  }

  getCreateReadiness(jobId: string): CreateReadinessSnapshot {
    const snapshot = this.checkpointWorkflowService.inspectJob(jobId);
    const workflowConfig = this.workflowConfigService.get();
    const settings = this.settingsRepository.get();
    const processCheckpoint = snapshot.checkpoints[2] as
      | WorkflowCheckpointEnvelope<{
          review?: {
            status?: "pending" | "approved";
          };
          scriptDraft?: ShortformScriptDraft;
        }>
      | undefined;
    const ffmpegPath =
      process.platform === "win32"
        ? this.pathService.getBundledToolPath("ffmpeg.exe")
        : this.pathService.getBundledToolPath("ffmpeg");
    const createModuleId = workflowConfig.createModuleId ?? "youtube-material-generator-mcp";
    const useBackgroundComposer = createModuleId === "background-subtitle-composer-mcp";
    const items = [
      {
        id: "job" as const,
        label: "작업 ID",
        ok: Boolean(snapshot.job),
        detail: snapshot.job
          ? `${snapshot.job.jobId}`
          : "checkpoint-1 또는 checkpoint-2가 먼저 있어야 합니다."
      },
      {
        id: "checkpoint_2" as const,
        label: "checkpoint-2",
        ok: Boolean(processCheckpoint?.payload?.scriptDraft),
        detail: processCheckpoint?.payload?.scriptDraft
          ? "스크립트 초안이 준비되었습니다."
          : "스크립트 초안이 아직 없습니다."
      },
      {
        id: "approval" as const,
        label: "운영자 승인",
        ok: processCheckpoint?.payload?.review?.status === "approved",
        detail:
          processCheckpoint?.payload?.review?.status === "approved"
            ? "2번 단계 승인이 완료되었습니다."
            : "2번 단계 승인이 아직 필요합니다."
      },
      {
        id: "pexels" as const,
        label: "Pexels API",
        ok: Boolean(workflowConfig.pexelsApiKey?.trim()),
        detail: workflowConfig.pexelsApiKey?.trim()
          ? "장면별 영상 검색 키가 준비되었습니다."
          : "03 슬롯 모듈 설정에 Pexels API Key를 입력해 주세요."
      },
      {
        id: "tts" as const,
        label: "한국어 더빙",
        ok: Boolean(
          (settings.azureSpeechKey?.trim() && settings.azureSpeechRegion?.trim()) ||
            settings.openAiApiKey?.trim() ||
            settings.secondaryOpenAiApiKey?.trim()
        ),
        detail:
          settings.azureSpeechKey?.trim() && settings.azureSpeechRegion?.trim()
            ? "Azure Speech 더빙이 준비되었습니다."
            : settings.openAiApiKey?.trim() || settings.secondaryOpenAiApiKey?.trim()
              ? "OpenAI TTS fallback이 준비되었습니다."
              : "설정 탭에서 Azure Speech Key/Region 또는 OpenAI TTS 키를 입력해 주세요."
      },
      {
        id: "ffmpeg" as const,
        label: "FFmpeg",
        ok: fs.existsSync(ffmpegPath),
        detail: fs.existsSync(ffmpegPath)
          ? `번들 FFmpeg 확인됨: ${ffmpegPath}`
          : `번들 FFmpeg가 없습니다: ${ffmpegPath}`
      }
    ];

    if (useBackgroundComposer) {
      const scriptCategory =
        (processCheckpoint?.payload?.review as { scriptCategory?: ShortformScriptCategory } | undefined)
          ?.scriptCategory ?? "community";
      const backgroundSource = this.resolveBackgroundComposerSource(
        workflowConfig.createBackgroundSourceType ?? "preset",
        workflowConfig.createBackgroundMediaPath,
        scriptCategory
      );
      const backgroundPath = backgroundSource.path ?? "";
      const assetsItem = items.find((item) => item.id === "pexels");
      if (assetsItem) {
        assetsItem.label = "배경 소스";
        assetsItem.ok = backgroundSource.exists;
        assetsItem.detail = backgroundSource.detail
          ? fs.existsSync(backgroundPath)
            ? `배경 파일 확인됨: ${backgroundPath}`
            : "입력한 배경 파일 경로를 찾을 수 없습니다."
          : "03 슬롯 모듈 설정에 배경 파일 경로를 입력해 주세요.";
      }
    }

    return {
      jobId: snapshot.job?.jobId,
      canRun: items.every((item) => item.ok),
      items
    };
  }

  async runCreatePipeline(jobId: string): Promise<WorkflowJobSnapshot> {
    const readiness = this.getCreateReadiness(jobId);
    if (!readiness.canRun) {
      throw new Error(readiness.items.find((item) => !item.ok)?.detail ?? "Create readiness check failed.");
    }

    const snapshot = this.checkpointWorkflowService.inspectJob(jobId);
    if (!snapshot.job) {
      throw new Error(`Workflow job ${jobId} was not found.`);
    }

    const processCheckpoint = snapshot.checkpoints[2] as
      | WorkflowCheckpointEnvelope<{
          scriptDraft?: ShortformScriptDraft;
          review?: {
            status?: "pending" | "approved";
          };
        }>
      | undefined;
    const draft = processCheckpoint?.payload?.scriptDraft;
    if (!draft) {
      throw new Error("checkpoint-2가 아직 없어 소재 생성을 시작할 수 없습니다.");
    }

    if (processCheckpoint?.payload?.review?.status !== "approved") {
      throw new Error(
        "checkpoint-2ê°€ ì•„ì§ ìŠ¹ì¸ë˜ì§€ ì•Šì•„ 3ë²ˆ ì†Œìž¬ ìƒì„±ì„ ì‹œìž‘í•  ìˆ˜ ì—†ìŠµë‹ˆë‹¤."
      );
    }

    const now = new Date().toISOString();
    const job: AutomationJobSnapshot = {
      id: snapshot.job.jobId,
      title: snapshot.job.title,
      stage: this.resolveCreateStage(snapshot.job.currentStage),
      createdAt: snapshot.job.createdAt,
      updatedAt: now
    };

    await this.safeNotify({
      type: "create_started",
      jobId: job.id,
      title: job.title
    });

    try {
      const packagePath = await this.createPackage(job, draft);
      const finalVideoPath = this.fileService.readJsonFile<GeneratedMediaPackageManifest>(
        path.join(packagePath, "asset-manifest.json")
      ).artifacts.finalVideoPath;
      await this.safeNotify({
        type: "create_succeeded",
        jobId: job.id,
        title: job.title,
        packagePath,
        finalVideoPath: finalVideoPath ? path.join(packagePath, finalVideoPath) : undefined
      });
    } catch (error) {
      await this.safeNotify({
        type: "create_failed",
        jobId: job.id,
        title: job.title,
        error: error instanceof Error ? error.message : "Unknown create pipeline error."
      });
      throw error;
    }

    return this.checkpointWorkflowService.inspectJob(jobId);
  }

  async createPackage(job: AutomationJobSnapshot, draft: ShortformScriptDraft): Promise<string> {
    const packagePath = this.pathService.getAutomationPackagePath(job.id);
    const workflowConfig = this.workflowConfigService.get();
    const createModuleId = workflowConfig.createModuleId ?? "youtube-material-generator-mcp";
    const useBackgroundComposer = createModuleId === "background-subtitle-composer-mcp";
    const processCheckpoint = this.checkpointWorkflowService.inspectJob(job.id).checkpoints[2] as
      | WorkflowCheckpointEnvelope<{
          review?: {
            scriptCategory?: ShortformScriptCategory;
          };
        }>
      | undefined;
    const scriptCategory = processCheckpoint?.payload?.review?.scriptCategory ?? "community";
    this.fileService.ensureDir(packagePath);
    if (useBackgroundComposer) {
      this.writeCreateProgress(packagePath, "scene_plan", "running", "Scene plan generation started.");
    }
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
    if (useBackgroundComposer) {
      this.writeCreateProgress(packagePath, "scene_plan", "completed", "Scene plan generated.");
      await this.safeNotify({
        type: "create_progress",
        jobId: job.id,
        title: job.title,
        stage: "scene_plan",
        detail: "Scene plan generated."
      });
    }

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
        "captions.ass",
        "create-progress.json",
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
      provider: useBackgroundComposer
        ? "background-subtitle-composer-mcp"
        : "youtube-material-generator-mcp",
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
    const enrichedMediaManifest = useBackgroundComposer
      ? this.enrichManifestWithBackgroundAsset(
          generatedMediaManifest,
          packagePath,
          this.resolveBackgroundComposerSource(
            workflowConfig.createBackgroundSourceType ?? "preset",
            workflowConfig.createBackgroundMediaPath,
            scriptCategory
          ).path
        )
        : await this.pexelsAssetService.enrichManifestWithPexels(
          generatedMediaManifest,
          scenePlan,
          workflowConfig.pexelsApiKey
        );
    if (useBackgroundComposer) {
      this.writeCreateProgress(packagePath, "asset_prep", "completed", "Background asset prepared.");
      await this.safeNotify({
        type: "create_progress",
        jobId: job.id,
        title: job.title,
        stage: "asset_prep",
        detail: "Background asset prepared."
      });
      this.writeCreateProgress(packagePath, "voiceover", "running", "Voiceover generation started.");
    }
    const voiceoverResult = await this.voiceoverService.generateVoiceover(
      enrichedMediaManifest.voiceoverCues,
      packagePath
    );
    if (useBackgroundComposer) {
      this.writeCreateProgress(
        packagePath,
        "voiceover",
        voiceoverResult.relativePath ? "completed" : "failed",
        voiceoverResult.relativePath
          ? "Voiceover generated."
          : voiceoverResult.error ?? "Voiceover generation failed."
      );
      await this.safeNotify({
        type: "create_progress",
        jobId: job.id,
        title: job.title,
        stage: "voiceover",
        detail: voiceoverResult.relativePath
          ? "Voiceover generated."
          : voiceoverResult.error ?? "Voiceover generation failed."
      });
      this.writeCreateProgress(packagePath, "composition", "running", "Video composition started.");
    }
    this.fileService.writeJsonFile(path.join(packagePath, "voiceover-source.json"), {
      source: voiceoverResult.source,
      error: voiceoverResult.error ?? null
    });
    let finalizedMediaManifest: GeneratedMediaPackageManifest = {
      ...enrichedMediaManifest,
      artifacts: {
        ...enrichedMediaManifest.artifacts,
        voiceoverPath: voiceoverResult.relativePath ?? "",
        subtitlePath: useBackgroundComposer ? "captions.ass" : "captions.srt"
      }
    };
    const alignedTiming = this.subtitleService.retimeCues(
      enrichedMediaManifest.voiceoverCues,
      voiceoverResult.durationSec
    );
    finalizedMediaManifest = {
      ...finalizedMediaManifest,
      voiceoverCues: alignedTiming.voiceoverCues,
      subtitles: alignedTiming.subtitles
    };
    const voiceoverScript = this.subtitleService.buildVoiceoverScript(
      finalizedMediaManifest.voiceoverCues
    );
    const subtitleContents = this.subtitleService.buildSrt(finalizedMediaManifest.subtitles);
    const assSubtitleContents = this.subtitleService.buildAss(finalizedMediaManifest.subtitles);
    this.fileService.writeJsonFile(
      path.join(packagePath, "voiceover-cues.json"),
      finalizedMediaManifest.voiceoverCues
    );
    this.fileService.writeTextFile(
      path.join(packagePath, "voiceover-script.txt"),
      voiceoverScript
    );
    this.fileService.writeTextFile(path.join(packagePath, "captions.srt"), subtitleContents);
    this.fileService.writeTextFile(path.join(packagePath, "captions.ass"), assSubtitleContents);
    const compositionResult = await this.mediaCompositionService.composeFinalVideo(
      finalizedMediaManifest,
      packagePath
    );
    if (useBackgroundComposer) {
      this.writeCreateProgress(
        packagePath,
        "composition",
        compositionResult.relativePath ? "completed" : "failed",
        compositionResult.relativePath
          ? "Final video composed."
          : compositionResult.error ?? "Video composition failed."
      );
      await this.safeNotify({
        type: "create_progress",
        jobId: job.id,
        title: job.title,
        stage: "composition",
        detail: compositionResult.relativePath
          ? "Final video composed."
          : compositionResult.error ?? "Video composition failed."
      });
    }
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
      publishTarget: "video" as const,
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

  private enrichManifestWithBackgroundAsset(
    manifest: GeneratedMediaPackageManifest,
    packagePath: string,
    backgroundMediaPath?: string
  ): GeneratedMediaPackageManifest {
    if (!backgroundMediaPath?.trim() || !fs.existsSync(backgroundMediaPath.trim())) {
      return manifest;
    }

    const sourcePath = backgroundMediaPath.trim();
    const extension = path.extname(sourcePath) || ".mp4";
    const targetFileName = `background${extension}`;
    const relativePath = path.join("assets", targetFileName);
    const absoluteTargetPath = path.join(packagePath, relativePath);
    this.fileService.ensureDir(path.dirname(absoluteTargetPath));
    fs.copyFileSync(sourcePath, absoluteTargetPath);

    return {
      ...manifest,
      scenes: manifest.scenes.map((scene) => ({
        ...scene,
        selectedAsset: {
          provider: "local",
          assetType: [".jpg", ".jpeg", ".png", ".webp"].includes(extension.toLowerCase())
            ? "image"
            : "video",
          localPath: relativePath
        },
        fallbackUsed: false
      }))
    };
  }

  private resolveBackgroundComposerSource(
    sourceType: "preset" | "custom",
    customPath: string | undefined,
    scriptCategory: ShortformScriptCategory
  ): { path?: string; exists: boolean; detail: string } {
    if (sourceType === "custom") {
      const normalizedPath = customPath?.trim();
      return {
        path: normalizedPath,
        exists: Boolean(normalizedPath && fs.existsSync(normalizedPath)),
        detail: normalizedPath
          ? fs.existsSync(normalizedPath)
            ? `배경 파일 확인됨: ${normalizedPath}`
            : "입력한 배경 파일 경로를 찾을 수 없습니다."
          : "직접 파일 선택 모드입니다. 배경 파일을 골라주세요."
      };
    }

    const presetPath = this.pathService.getBundledBackgroundPath(scriptCategory);
    return {
      path: presetPath,
      exists: fs.existsSync(presetPath),
      detail: fs.existsSync(presetPath)
        ? `기본 배경 확인됨: ${presetPath}`
        : `기본 배경 파일이 없습니다: ${presetPath}`
    };
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

  private async safeNotify(event: Parameters<NonNullable<OperatorChannelService["notify"]>>[0]) {
    if (!this.operatorChannelService) {
      return;
    }

    try {
      await this.operatorChannelService.notify(event);
    } catch (error) {
      console.warn("Operator channel notify failed:", error);
    }
  }
}
