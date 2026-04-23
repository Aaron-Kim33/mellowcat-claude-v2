import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  AutomationJobSnapshot,
  AutomationJobStage,
  ShortformScriptCategory,
  ShortformScriptDraft
} from "../../../common/types/automation";
import type {
  GeneratedMediaPackageManifest,
  ScenePlanDocument,
  SceneScriptCategory,
  SceneScriptDocument,
  SceneScriptItem
} from "../../../common/types/media-generation";
import { getMcpRuntimeContract } from "../../../common/contracts/mcp-contract-registry";
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
import { FluxAssetService } from "./flux-asset-service";
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
    private readonly fluxAssetService: FluxAssetService,
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
    const createAssetSource =
      createModuleId === "background-subtitle-composer-mcp"
        ? "background"
        : (workflowConfig.createAssetSource ?? "pexels");
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

    if (createAssetSource === "flux") {
      const assetsItem = items.find((item) => item.id === "pexels");
      const fluxApiKey = workflowConfig.fluxApiKey?.trim();
      if (assetsItem) {
        assetsItem.label = "Flux Asset Source";
        assetsItem.ok = Boolean(fluxApiKey);
        assetsItem.detail = fluxApiKey
          ? "Flux API key is ready. Scene prompts will be generated with Flux."
          : "Enter Flux API key in Slot 03 module settings.";
      }
    }

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

  inspectSceneScript(packagePath: string): SceneScriptDocument {
    const sceneScriptPath = path.join(packagePath, "scene-script.json");
    if (!fs.existsSync(sceneScriptPath)) {
      throw new Error(`scene-script.json was not found in package path: ${packagePath}`);
    }

    return this.fileService.readJsonFile<SceneScriptDocument>(sceneScriptPath);
  }

  updateSceneScript(packagePath: string, document: SceneScriptDocument): SceneScriptDocument {
    const normalizedDocument: SceneScriptDocument = {
      ...document,
      scenes: [...document.scenes]
        .sort((a, b) => a.sceneNo - b.sceneNo)
        .map((scene, index) => ({
          ...scene,
          sceneNo: index + 1,
          assetSearchQuery: scene.assetSearchQuery?.trim() || undefined,
          durationSec: Math.max(1, Number(scene.durationSec) || 1)
        })),
      targetDurationSec: Math.max(
        1,
        Math.round(
          document.scenes.reduce(
            (total, scene) => total + Math.max(1, Number(scene.durationSec) || 1),
            0
          )
        )
      ),
      cardNews: document.cardNews ? this.normalizeCardNewsOptions(document.cardNews) : undefined
    };

    this.fileService.writeJsonFile(path.join(packagePath, "scene-script.json"), normalizedDocument);
    return normalizedDocument;
  }

  saveSceneCard(
    packagePath: string,
    document: SceneScriptDocument,
    sceneNo: number
  ): SceneScriptDocument {
    const normalizedDocument = this.updateSceneScript(packagePath, document);
    const targetScene =
      normalizedDocument.scenes.find((scene) => scene.sceneNo === sceneNo) ?? normalizedDocument.scenes[0];
    if (!targetScene) {
      throw new Error("No scene was found to save.");
    }

    const cardExportDir = path.join(packagePath, "card-drafts");
    const sceneLabel = String(targetScene.sceneNo).padStart(2, "0");
    this.fileService.writeJsonFile(path.join(cardExportDir, `card-${sceneLabel}.json`), {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      sceneNo: targetScene.sceneNo,
      scene: targetScene,
      subtitleStyle: normalizedDocument.subtitleStyle,
      cardNews: normalizedDocument.cardNews
    });

    return normalizedDocument;
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

  async rerenderCreateComposition(jobId: string): Promise<WorkflowJobSnapshot> {
    return this.rerenderComposition(jobId);
  }

  async rerenderCreateScenes(
    jobId: string,
    sceneIndexes: number[]
  ): Promise<WorkflowJobSnapshot> {
    if (sceneIndexes.length === 0) {
      throw new Error("At least one scene index is required.");
    }
    return this.rerenderComposition(jobId, sceneIndexes);
  }

  async refreshCreateAssets(
    jobId: string,
    sceneIndexes: number[]
  ): Promise<WorkflowJobSnapshot> {
    if (sceneIndexes.length === 0) {
      throw new Error("At least one scene index is required.");
    }
    const snapshot = this.checkpointWorkflowService.inspectJob(jobId);
    if (!snapshot.job) {
      throw new Error(`Workflow job ${jobId} was not found.`);
    }
    const packagePath =
      snapshot.resolvedPackagePath ?? this.pathService.getAutomationPackagePath(snapshot.job.jobId);
    const manifestPath = path.join(packagePath, "asset-manifest.json");
    const scenePlanPath = path.join(packagePath, "scene-plan.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("asset-manifest.json was not found. Run Slot 03 create first.");
    }
    const workflowConfig = this.workflowConfigService.get();
    const createModuleId = workflowConfig.createModuleId ?? "youtube-material-generator-mcp";
    const createAssetSource =
      createModuleId === "background-subtitle-composer-mcp"
        ? "background"
        : (workflowConfig.createAssetSource ?? "pexels");

    const manifest = this.applySceneScriptToManifest(
      packagePath,
      this.fileService.readJsonFile<GeneratedMediaPackageManifest>(manifestPath)
    );
    const sceneScriptPath = path.join(packagePath, "scene-script.json");
    const sceneScript = fs.existsSync(sceneScriptPath)
      ? this.fileService.readJsonFile<SceneScriptDocument>(sceneScriptPath)
      : undefined;
    const sceneQueryOverrides = this.buildSceneQueryOverrideMap(sceneScript);

    this.writeCreateProgress(
      packagePath,
      "asset_prep",
      "running",
      `Refreshing assets for scenes: ${sceneIndexes.join(", ")}.`
    );
    await this.safeNotify({
      type: "create_progress",
      jobId: snapshot.job.jobId,
      title: snapshot.job.title,
      stage: "asset_prep",
      detail: `Refreshing assets for scenes: ${sceneIndexes.join(", ")}.`
    });

    let updatedManifest: GeneratedMediaPackageManifest;
    if (createAssetSource === "flux") {
      if (!workflowConfig.fluxApiKey?.trim()) {
        throw new Error("Flux API key is missing.");
      }
      if (!sceneScript) {
        throw new Error("scene-script.json was not found. Save scene script before Flux refresh.");
      }
      updatedManifest = await this.fluxAssetService.enrichManifestWithFlux(
        manifest,
        sceneScript,
        sceneIndexes,
        {
          apiKey: workflowConfig.fluxApiKey?.trim(),
          apiBaseUrl: workflowConfig.fluxApiBaseUrl,
          model: workflowConfig.fluxModel
        }
      );
    } else {
      if (!fs.existsSync(scenePlanPath)) {
        throw new Error("scene-plan.json was not found. Run Slot 03 create first.");
      }
      if (!workflowConfig.pexelsApiKey?.trim()) {
        throw new Error("Pexels API key is missing.");
      }
      const scenePlan = this.fileService.readJsonFile<ScenePlanDocument>(scenePlanPath);
      updatedManifest = await this.pexelsAssetService.enrichManifestWithPexels(
        manifest,
        scenePlan,
        workflowConfig.pexelsApiKey,
        sceneIndexes,
        sceneQueryOverrides
      );
    }
    this.fileService.writeJsonFile(manifestPath, updatedManifest);

    this.writeCreateProgress(
      packagePath,
      "asset_prep",
      "completed",
      `Assets refreshed for scenes: ${sceneIndexes.join(", ")}.`
    );
    await this.safeNotify({
      type: "create_progress",
      jobId: snapshot.job.jobId,
      title: snapshot.job.title,
      stage: "asset_prep",
      detail: `Assets refreshed for scenes: ${sceneIndexes.join(", ")}.`
    });

    return this.checkpointWorkflowService.inspectJob(jobId);
  }

  async refreshCreateVoiceover(jobId: string): Promise<WorkflowJobSnapshot> {
    const snapshot = this.checkpointWorkflowService.inspectJob(jobId);
    if (!snapshot.job) {
      throw new Error(`Workflow job ${jobId} was not found.`);
    }
    const packagePath =
      snapshot.resolvedPackagePath ?? this.pathService.getAutomationPackagePath(snapshot.job.jobId);
    const manifestPath = path.join(packagePath, "asset-manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("asset-manifest.json was not found. Run Slot 03 create first.");
    }

    const manifest = this.applySceneScriptToManifest(
      packagePath,
      this.fileService.readJsonFile<GeneratedMediaPackageManifest>(manifestPath)
    );
    this.writeCreateProgress(packagePath, "voiceover", "running", "Voiceover refresh started.");
    await this.safeNotify({
      type: "create_progress",
      jobId: snapshot.job.jobId,
      title: snapshot.job.title,
      stage: "voiceover",
      detail: "Voiceover refresh started."
    });

    const voiceoverResult = await this.voiceoverService.generateVoiceover(
      manifest.voiceoverCues,
      packagePath,
      manifest.voiceProfile
    );
    this.fileService.writeJsonFile(path.join(packagePath, "voiceover-source.json"), {
      source: voiceoverResult.source,
      error: voiceoverResult.error ?? null
    });
    if (!voiceoverResult.relativePath) {
      this.writeCreateProgress(
        packagePath,
        "voiceover",
        "failed",
        voiceoverResult.error ?? "Voiceover refresh failed."
      );
      throw new Error(voiceoverResult.error ?? "Voiceover refresh failed.");
    }

    const aligned = this.subtitleService.retimeCues(
      manifest.voiceoverCues,
      voiceoverResult.durationSec
    );
    const subtitlePath =
      manifest.provider === "background-subtitle-composer-mcp" ? "captions.ass" : "captions.srt";
    const updatedManifest: GeneratedMediaPackageManifest = {
      ...manifest,
      voiceoverCues: aligned.voiceoverCues,
      subtitles: aligned.subtitles,
      artifacts: {
        ...manifest.artifacts,
        voiceoverPath: voiceoverResult.relativePath,
        subtitlePath
      }
    };
    this.fileService.writeTextFile(
      path.join(packagePath, "voiceover-script.txt"),
      this.subtitleService.buildVoiceoverScript(updatedManifest.voiceoverCues)
    );
    this.fileService.writeJsonFile(
      path.join(packagePath, "voiceover-cues.json"),
      updatedManifest.voiceoverCues
    );
    this.fileService.writeTextFile(
      path.join(packagePath, "captions.srt"),
      this.subtitleService.buildSrt(updatedManifest.subtitles)
    );
    this.fileService.writeTextFile(
      path.join(packagePath, "captions.ass"),
      this.subtitleService.buildAss(updatedManifest.subtitles, updatedManifest.subtitleStyle)
    );
    this.fileService.writeJsonFile(manifestPath, updatedManifest);

    this.writeCreateProgress(packagePath, "voiceover", "completed", "Voiceover refreshed.");
    await this.safeNotify({
      type: "create_progress",
      jobId: snapshot.job.jobId,
      title: snapshot.job.title,
      stage: "voiceover",
      detail: "Voiceover refreshed."
    });

    return this.checkpointWorkflowService.inspectJob(jobId);
  }

  async refreshCreateSubtitles(jobId: string): Promise<WorkflowJobSnapshot> {
    const snapshot = this.checkpointWorkflowService.inspectJob(jobId);
    if (!snapshot.job) {
      throw new Error(`Workflow job ${jobId} was not found.`);
    }
    const packagePath =
      snapshot.resolvedPackagePath ?? this.pathService.getAutomationPackagePath(snapshot.job.jobId);
    const manifestPath = path.join(packagePath, "asset-manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("asset-manifest.json was not found. Run Slot 03 create first.");
    }

    const manifest = this.applySceneScriptToManifest(
      packagePath,
      this.fileService.readJsonFile<GeneratedMediaPackageManifest>(manifestPath)
    );
    this.writeCreateProgress(packagePath, "composition", "running", "Subtitle refresh started.");
    await this.safeNotify({
      type: "create_progress",
      jobId: snapshot.job.jobId,
      title: snapshot.job.title,
      stage: "composition",
      detail: "Subtitle refresh started."
    });

    this.fileService.writeTextFile(
      path.join(packagePath, "captions.srt"),
      this.subtitleService.buildSrt(manifest.subtitles)
    );
    this.fileService.writeTextFile(
      path.join(packagePath, "captions.ass"),
      this.subtitleService.buildAss(manifest.subtitles, manifest.subtitleStyle)
    );
    const subtitlePath =
      manifest.provider === "background-subtitle-composer-mcp" ? "captions.ass" : "captions.srt";
    const updatedManifest: GeneratedMediaPackageManifest = {
      ...manifest,
      artifacts: {
        ...manifest.artifacts,
        subtitlePath
      }
    };
    this.fileService.writeJsonFile(manifestPath, updatedManifest);

    this.writeCreateProgress(packagePath, "composition", "completed", "Subtitles refreshed.");
    await this.safeNotify({
      type: "create_progress",
      jobId: snapshot.job.jobId,
      title: snapshot.job.title,
      stage: "composition",
      detail: "Subtitles refreshed."
    });

    return this.checkpointWorkflowService.inspectJob(jobId);
  }

  private async rerenderComposition(
    jobId: string,
    sceneIndexes?: number[]
  ): Promise<WorkflowJobSnapshot> {
    const snapshot = this.checkpointWorkflowService.inspectJob(jobId);
    if (!snapshot.job) {
      throw new Error(`Workflow job ${jobId} was not found.`);
    }

    const packagePath =
      snapshot.resolvedPackagePath ?? this.pathService.getAutomationPackagePath(snapshot.job.jobId);
    const manifestPath = path.join(packagePath, "asset-manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("asset-manifest.json was not found. Run Slot 03 create first.");
    }

    const manifest = this.applySceneScriptToManifest(
      packagePath,
      this.fileService.readJsonFile<GeneratedMediaPackageManifest>(manifestPath)
    );
    const rerenderLabel =
      sceneIndexes && sceneIndexes.length > 0
        ? `Scene re-render started: ${sceneIndexes.join(", ")}.`
        : "Video composition re-render started.";
    this.writeCreateProgress(packagePath, "composition", "running", rerenderLabel);
    await this.safeNotify({
      type: "create_progress",
      jobId: snapshot.job.jobId,
      title: snapshot.job.title,
      stage: "composition",
      detail: rerenderLabel
    });

    this.fileService.writeTextFile(
      path.join(packagePath, "captions.srt"),
      this.subtitleService.buildSrt(manifest.subtitles)
    );
    this.fileService.writeTextFile(
      path.join(packagePath, "captions.ass"),
      this.subtitleService.buildAss(manifest.subtitles, manifest.subtitleStyle)
    );
    const normalizedManifest: GeneratedMediaPackageManifest = {
      ...manifest,
      artifacts: {
        ...manifest.artifacts,
        subtitlePath:
          manifest.provider === "background-subtitle-composer-mcp" ? "captions.ass" : "captions.srt"
      }
    };
    const compositionResult = await this.mediaCompositionService.composeFinalVideo(
      normalizedManifest,
      packagePath,
      sceneIndexes && sceneIndexes.length > 0
        ? { rerenderSceneIndexes: sceneIndexes }
        : undefined
    );
    this.fileService.writeJsonFile(path.join(packagePath, "composition-source.json"), {
      source: compositionResult.source,
      error: compositionResult.error ?? null
    });
    this.fileService.writeJsonFile(manifestPath, compositionResult.manifest);

    const uploadRequestPath = path.join(packagePath, "youtube-upload-request.json");
    if (fs.existsSync(uploadRequestPath)) {
      const uploadRequest = this.fileService.readJsonFile<{
        videoFilePath?: string;
        [key: string]: unknown;
      }>(uploadRequestPath);
      if (compositionResult.relativePath) {
        uploadRequest.videoFilePath = path.join(packagePath, compositionResult.relativePath);
        this.fileService.writeJsonFile(uploadRequestPath, uploadRequest);
      }
    }

    this.writeCreateProgress(
      packagePath,
      "composition",
      compositionResult.relativePath ? "completed" : "failed",
      compositionResult.relativePath
        ? sceneIndexes && sceneIndexes.length > 0
          ? `Selected scenes re-rendered: ${sceneIndexes.join(", ")}.`
          : "Final video re-rendered."
        : compositionResult.error ?? "Video re-render failed."
    );
    if (compositionResult.relativePath) {
      await this.safeNotify({
        type: "create_progress",
        jobId: snapshot.job.jobId,
        title: snapshot.job.title,
        stage: "composition",
        detail:
          sceneIndexes && sceneIndexes.length > 0
            ? `Selected scenes re-rendered: ${sceneIndexes.join(", ")}.`
            : "Final video re-rendered."
      });
    } else {
      await this.safeNotify({
        type: "create_failed",
        jobId: snapshot.job.jobId,
        title: snapshot.job.title,
        error: compositionResult.error ?? "Video re-render failed."
      });
    }

    return this.checkpointWorkflowService.inspectJob(jobId);
  }

  async createPackage(job: AutomationJobSnapshot, draft: ShortformScriptDraft): Promise<string> {
    const packagePath = this.pathService.getAutomationPackagePath(job.id);
    const workflowConfig = this.workflowConfigService.get();
    const createModuleId = workflowConfig.createModuleId ?? "youtube-material-generator-mcp";
    const useBackgroundComposer = createModuleId === "background-subtitle-composer-mcp";
    const isCardNewsModule = createModuleId === "card-news-generator-mcp";
    const createAssetSource = useBackgroundComposer
      ? "background"
      : (workflowConfig.createAssetSource ?? "pexels");
    const effectiveAssetSource = isCardNewsModule ? "flux" : createAssetSource;
    const createProvider =
      createModuleId === "background-subtitle-composer-mcp"
        ? "background-subtitle-composer-mcp"
        : createModuleId === "card-news-generator-mcp"
          ? "card-news-generator-mcp"
        : createModuleId === "video-production-mcp"
          ? "video-production-mcp"
          : "youtube-material-generator-mcp";
    const videoCompositionOptions = {
      burnSubtitles: (workflowConfig.createVideoSubtitleMode ?? "hard") === "hard",
      ...(createModuleId === "video-production-mcp"
        ? {
            videoCrf: (workflowConfig.createVideoRenderQuality ?? "high") === "high" ? 16 : 18,
            videoPreset:
              ((workflowConfig.createVideoRenderQuality ?? "high") === "high"
                ? "slow"
                : "medium") as "slow" | "medium"
          }
        : {})
    };
    const processCheckpoint = this.checkpointWorkflowService.inspectJob(job.id).checkpoints[2] as
      | WorkflowCheckpointEnvelope<{
          review?: {
            scriptCategory?: ShortformScriptCategory;
          };
        }>
      | undefined;
    const scriptCategory = processCheckpoint?.payload?.review?.scriptCategory ?? "community";
    this.fileService.ensureDir(packagePath);
    this.writeCreateProgress(packagePath, "scene_plan", "running", "Scene plan generation started.");
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
    this.writeCreateProgress(packagePath, "scene_plan", "completed", "Scene plan generated.");
    await this.safeNotify({
      type: "create_progress",
      jobId: job.id,
      title: job.title,
      stage: "scene_plan",
      detail: "Scene plan generated."
    });

    this.fileService.writeJsonFile(path.join(packagePath, "script.json"), {
      job,
      draft
    });
    this.fileService.writeJsonFile(path.join(packagePath, "scene-plan-source.json"), {
      source: scenePlanResult.source,
      error: scenePlanResult.error ?? null
    });
    this.fileService.writeJsonFile(path.join(packagePath, "scene-plan.json"), scenePlan);
    const sceneScriptDocument = this.buildSceneScriptDocument(
      job.id,
      scenePlan,
      scriptCategory as ShortformScriptCategory,
      createModuleId,
      this.resolveSceneStylePreset(createModuleId, workflowConfig.createSceneStylePresetId)
    );
    const effectiveSceneScriptDocument = isCardNewsModule
      ? this.applyCardNewsCoverPrompt(sceneScriptDocument)
      : sceneScriptDocument;
    const effectiveCompositionOptions = isCardNewsModule
      ? {
          ...videoCompositionOptions,
          ...this.resolveCardNewsCompositionOptions(effectiveSceneScriptDocument.cardNews)
        }
      : videoCompositionOptions;
    this.fileService.writeJsonFile(path.join(packagePath, "scene-script.json"), effectiveSceneScriptDocument);

    this.fileService.writeJsonFile(path.join(packagePath, "package.json"), {
      jobId: job.id,
      title: job.title,
      createdAt: job.updatedAt,
      stage: job.stage,
      outputs: [
        "script.json",
        "scene-script.json",
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
        "card-news-manifest.json",
        "instagram-carousel-request.json",
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
    const generatedMediaManifest: GeneratedMediaPackageManifest = this.buildManifestFromSceneScript(
      effectiveSceneScriptDocument,
      createProvider,
      effectiveCompositionOptions
    );
    const shouldFetchCoverFromProvider = !(
      isCardNewsModule &&
      effectiveSceneScriptDocument.cardNews?.coverSource === "manual_upload" &&
      Boolean(effectiveSceneScriptDocument.cardNews.coverImagePath?.trim())
    );
    const targetSceneIndexes =
      isCardNewsModule && shouldFetchCoverFromProvider ? [1] : undefined;
    const enrichedMediaManifestBase = useBackgroundComposer
      ? this.enrichManifestWithBackgroundAsset(
          generatedMediaManifest,
          packagePath,
          this.resolveBackgroundComposerSource(
            workflowConfig.createBackgroundSourceType ?? "preset",
            workflowConfig.createBackgroundMediaPath,
            scriptCategory
          ).path
        )
      : effectiveAssetSource === "flux"
        ? await (async () => {
            if (!workflowConfig.fluxApiKey?.trim() && !isCardNewsModule) {
              throw new Error("Flux API key is missing.");
            }
            return this.fluxAssetService.enrichManifestWithFlux(
              generatedMediaManifest,
              effectiveSceneScriptDocument,
              targetSceneIndexes,
              {
                apiKey: workflowConfig.fluxApiKey?.trim(),
                apiBaseUrl: workflowConfig.fluxApiBaseUrl,
                model: workflowConfig.fluxModel
              }
            );
          })()
        : await this.pexelsAssetService.enrichManifestWithPexels(
            generatedMediaManifest,
            scenePlan,
            workflowConfig.pexelsApiKey,
            targetSceneIndexes,
            this.buildSceneQueryOverrideMap(effectiveSceneScriptDocument)
          );
    const enrichedMediaManifest = isCardNewsModule
      ? this.applyCardNewsTemplateAssets(
          enrichedMediaManifestBase,
          packagePath,
          effectiveSceneScriptDocument
        )
      : enrichedMediaManifestBase;
    this.writeCreateProgress(
      packagePath,
      "asset_prep",
      "completed",
      useBackgroundComposer
        ? "Background asset prepared."
        : effectiveAssetSource === "flux"
          ? "Flux scene assets prepared."
          : "Scene assets prepared."
    );
    await this.safeNotify({
      type: "create_progress",
      jobId: job.id,
      title: job.title,
      stage: "asset_prep",
      detail: useBackgroundComposer
        ? "Background asset prepared."
        : effectiveAssetSource === "flux"
          ? "Flux scene assets prepared."
          : "Scene assets prepared."
    });
    if (isCardNewsModule) {
      const cardNewsPrepared = await this.materializeCardNewsImages(
        enrichedMediaManifest,
        packagePath,
        effectiveSceneScriptDocument
      );
      this.fileService.writeJsonFile(
        path.join(packagePath, "asset-manifest.json"),
        cardNewsPrepared.manifest
      );
      this.fileService.writeJsonFile(path.join(packagePath, "card-news-manifest.json"), {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        outputFormat: effectiveSceneScriptDocument.cardNews?.outputFormat ?? "shorts_9_16",
        layoutPreset: effectiveSceneScriptDocument.cardNews?.layoutPreset ?? "headline_focus",
        transitionStyle: effectiveSceneScriptDocument.cardNews?.transitionStyle ?? "cut",
        cards: cardNewsPrepared.cards.map((card) => ({
          sceneIndex: card.sceneIndex,
          imagePath: card.path,
          text: card.text
        }))
      });
      this.fileService.writeJsonFile(path.join(packagePath, "instagram-carousel-request.json"), {
        platform: "instagram",
        publishTarget: "carousel",
        status: "draft",
        caption: uploadDescription,
        hashtags: hashtags.split(" "),
        images: cardNewsPrepared.cards.map((card) => path.join(packagePath, card.path))
      });
      this.writeCreateProgress(
        packagePath,
        "voiceover",
        "completed",
        "Skipped for image card news package."
      );
      this.writeCreateProgress(
        packagePath,
        "composition",
        "completed",
        "Image card news package is ready."
      );
      await this.safeNotify({
        type: "create_progress",
        jobId: job.id,
        title: job.title,
        stage: "composition",
        detail: "Card news image package is ready."
      });

      const imageCardsForCheckpoint = cardNewsPrepared.cards.map((card, index) => ({
        label: `card-${String(index + 1).padStart(2, "0")}`,
        path: card.path,
        status: "ready" as const
      }));
      const placeholderUploadRequest = {
        platform: "youtube" as const,
        publishTarget: "video" as const,
        status: "draft" as const,
        videoFilePath: "",
        thumbnailFilePath: cardNewsPrepared.cards[0]?.path
          ? path.join(packagePath, cardNewsPrepared.cards[0].path)
          : "",
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
      this.checkpointWorkflowService.writeCreateCheckpoint({
        job,
        packagePath,
        draft,
        uploadRequest: placeholderUploadRequest,
        createPayloadOverride: {
          assetPlan: {
            ttsRequired: false,
            imageGenerationRequired: true,
            videoCompositionRequired: false,
            thumbnailRequired: false
          },
          assets: {
            audio: [],
            images: imageCardsForCheckpoint,
            video: [],
            thumbnail: {
              path: "",
              status: "pending"
            }
          },
          metadata: {
            title: uploadTitle,
            description: uploadDescription,
            hashtags: hashtags.split(" ")
          }
        }
      });
      this.checkpointWorkflowService.writeOutputCheckpoint({
        job,
        uploadRequest: placeholderUploadRequest
      });

      return packagePath;
    }
    this.writeCreateProgress(packagePath, "voiceover", "running", "Voiceover generation started.");
    const voiceoverResult = await this.voiceoverService.generateVoiceover(
      enrichedMediaManifest.voiceoverCues,
      packagePath,
      enrichedMediaManifest.voiceProfile
    );
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
    const assSubtitleContents = this.subtitleService.buildAss(
      finalizedMediaManifest.subtitles,
      finalizedMediaManifest.subtitleStyle
    );
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

  private buildSceneScriptDocument(
    jobId: string,
    scenePlan: {
      totalDurationSec: number;
      scenes: Array<{ index: number; text: string; durationSec: number; keywords: string[] }>;
    },
    scriptCategory: ShortformScriptCategory,
    createModuleId: string,
    preset?: {
      subtitleStyle: SceneScriptDocument["subtitleStyle"];
      voiceProfile: SceneScriptDocument["voiceProfile"];
    }
  ): SceneScriptDocument {
    const normalizedCategory: SceneScriptCategory =
      scriptCategory === "horror" ? "horror" : scriptCategory === "romance" ? "romance" : "community";
    const buildFluxPrompt = (category: SceneScriptCategory, keywords: string[]) => {
      const keywordClause = keywords
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .slice(0, 4)
        .join(", ");
      const base =
        "8k resolution, cinematic lighting, hyper-realistic, masterpiece, vertical composition, shortform frame";
      if (category === "horror") {
        return [keywordClause, "eerie, misty, low key lighting, moody, uncanny, dramatic shadows", base]
          .filter(Boolean)
          .join(", ");
      }
      if (category === "romance") {
        return [keywordClause, "vibrant colors, soft bokeh, emotional modern drama, warm cinematic mood", base]
          .filter(Boolean)
          .join(", ");
      }
      return [keywordClause, "atmospheric documentary realism, dramatic yet natural composition", base]
        .filter(Boolean)
        .join(", ");
    };

    return {
      schemaVersion: 1,
      jobId,
      language: "ko",
      category: normalizedCategory,
      targetDurationSec: scenePlan.totalDurationSec,
      scenes: scenePlan.scenes.map((scene) => ({
        sceneNo: scene.index,
        text:
          createModuleId === "card-news-generator-mcp"
            ? this.toCardNewsCardText(scene.text, scene.index)
            : scene.text,
        fluxPrompt: buildFluxPrompt(normalizedCategory, scene.keywords),
        assetSearchQuery: scene.keywords.slice(0, 3).join(" "),
        motion: "zoom-in",
        durationSec: scene.durationSec,
        cardDesign:
          createModuleId === "card-news-generator-mcp"
            ? this.buildDefaultCardDesign(scene.index)
            : undefined,
        cardDesignBoxes:
          createModuleId === "card-news-generator-mcp"
            ? [{ ...this.buildDefaultCardDesign(scene.index), id: `box-${scene.index}-1` }]
            : undefined
      })),
      subtitleStyle:
        preset?.subtitleStyle ?? {
          mode: "outline",
          fontFamily: "Gmarket Sans",
          fontSize: 30,
          outline: 4,
          color: "#ffffff",
          outlineColor: "#000000"
        },
      voiceProfile:
        preset?.voiceProfile ?? {
          provider: "elevenlabs",
          modelId: "eleven_multilingual_v2",
          stability: 0.45,
          similarityBoost: 0.75,
          style: 0.06,
          useSpeakerBoost: true
        },
      cardNews:
        createModuleId === "card-news-generator-mcp"
          ? this.normalizeCardNewsOptions(undefined)
          : undefined
    };
  }

  private buildManifestFromSceneScript(
    sceneScriptDocument: SceneScriptDocument,
    provider: GeneratedMediaPackageManifest["provider"],
    compositionOptions?: GeneratedMediaPackageManifest["compositionOptions"]
  ): GeneratedMediaPackageManifest {
    const orderedScenes = [...sceneScriptDocument.scenes].sort((left, right) => left.sceneNo - right.sceneNo);
    let cursor = 0;
    const voiceoverCues = orderedScenes.map((scene) => {
      const durationSec = Math.max(1, Number(scene.durationSec) || 1);
      const startSec = Number(cursor.toFixed(2));
      const endSec = Number((cursor + durationSec).toFixed(2));
      cursor = endSec;
      return {
        sceneIndex: scene.sceneNo,
        startSec,
        endSec,
        text: scene.text
      };
    });

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      provider,
      language: "ko",
      totalDurationSec: Number(cursor.toFixed(2)),
      compositionOptions,
      subtitleStyle: sceneScriptDocument.subtitleStyle,
      voiceProfile: sceneScriptDocument.voiceProfile,
      scenes: orderedScenes.map((scene) => ({
        sceneIndex: scene.sceneNo,
        motion: scene.motion,
        fallbackUsed: true,
        trim: {
          sourceStartSec: 0,
          sourceEndSec: Math.max(1, Number(scene.durationSec) || 1)
        }
      })),
      voiceoverCues,
      subtitles: voiceoverCues.map((cue, index) => ({
        index: index + 1,
        startSec: cue.startSec,
        endSec: cue.endSec,
        text: cue.text
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
  }

  private applySceneScriptToManifest(
    packagePath: string,
    manifest: GeneratedMediaPackageManifest
  ): GeneratedMediaPackageManifest {
    const sceneScriptPath = path.join(packagePath, "scene-script.json");
    if (!fs.existsSync(sceneScriptPath)) {
      return manifest;
    }

    const sceneScript = this.fileService.readJsonFile<SceneScriptDocument>(sceneScriptPath);
    const orderedScenes = [...sceneScript.scenes].sort((left, right) => left.sceneNo - right.sceneNo);
    if (orderedScenes.length === 0) {
      return manifest;
    }

    const byIndex = new Map(manifest.scenes.map((scene) => [scene.sceneIndex, scene] as const));
    let cursor = 0;
    const voiceoverCues = orderedScenes.map((scene) => {
      const durationSec = Math.max(1, Number(scene.durationSec) || 1);
      const startSec = Number(cursor.toFixed(2));
      const endSec = Number((cursor + durationSec).toFixed(2));
      cursor = endSec;
      return {
        sceneIndex: scene.sceneNo,
        startSec,
        endSec,
        text: scene.text
      };
    });

    return {
      ...manifest,
      totalDurationSec: Number(cursor.toFixed(2)),
      subtitleStyle: sceneScript.subtitleStyle,
      voiceProfile: sceneScript.voiceProfile,
      scenes: orderedScenes.map((scene) => {
        const current = byIndex.get(scene.sceneNo);
        return {
          sceneIndex: scene.sceneNo,
          motion: scene.motion,
          selectedAsset: current?.selectedAsset,
          fallbackUsed: current?.fallbackUsed,
          trim: {
            sourceStartSec: 0,
            sourceEndSec: Math.max(1, Number(scene.durationSec) || 1)
          }
        };
      }),
      voiceoverCues,
      subtitles: voiceoverCues.map((cue, index) => ({
        index: index + 1,
        startSec: cue.startSec,
        endSec: cue.endSec,
        text: cue.text
      }))
    };
  }

  private resolveSceneStylePreset(
    createModuleId: string,
    presetId?: string
  ): {
    subtitleStyle: SceneScriptDocument["subtitleStyle"];
    voiceProfile: SceneScriptDocument["voiceProfile"];
  } | undefined {
    if (!presetId?.trim()) {
      return undefined;
    }

    const presets = getMcpRuntimeContract(createModuleId)?.sceneStylePresets;
    const match = presets?.find((preset) => preset.id === presetId);
    if (!match) {
      return undefined;
    }

    return {
      subtitleStyle: match.subtitleStyle,
      voiceProfile: match.voiceProfile
    };
  }

  private normalizeCardNewsOptions(
    cardNews: SceneScriptDocument["cardNews"]
  ): NonNullable<SceneScriptDocument["cardNews"]> {
    return {
      layoutPreset:
        cardNews?.layoutPreset === "split_story" || cardNews?.layoutPreset === "data_highlight"
          ? cardNews.layoutPreset
          : "headline_focus",
      transitionStyle:
        cardNews?.transitionStyle === "slide" ||
        cardNews?.transitionStyle === "fade" ||
        cardNews?.transitionStyle === "wipe"
          ? cardNews.transitionStyle
          : "cut",
      outputFormat:
        cardNews?.outputFormat === "feed_4_5" || cardNews?.outputFormat === "square_1_1"
          ? cardNews.outputFormat
          : "shorts_9_16",
      coverSource: cardNews?.coverSource === "manual_upload" ? "manual_upload" : "ai_generate",
      coverPrompt: cardNews?.coverPrompt?.trim() || undefined,
      coverImagePath: cardNews?.coverImagePath?.trim() || undefined,
      templateBackgroundPath: cardNews?.templateBackgroundPath?.trim() || undefined
    };
  }

  private applyCardNewsCoverPrompt(document: SceneScriptDocument): SceneScriptDocument {
    const cardNews = this.normalizeCardNewsOptions(document.cardNews);
    const coverPrompt = cardNews.coverPrompt?.trim();
    if (!coverPrompt) {
      return {
        ...document,
        cardNews
      };
    }

    return {
      ...document,
      cardNews,
      scenes: document.scenes.map((scene) =>
        scene.sceneNo === 1
          ? {
              ...scene,
              fluxPrompt: coverPrompt,
              assetSearchQuery: coverPrompt.slice(0, 120)
            }
          : scene
      )
    };
  }

  private resolveCardNewsCompositionOptions(
    cardNews: SceneScriptDocument["cardNews"]
  ): NonNullable<GeneratedMediaPackageManifest["compositionOptions"]> {
    const normalized = this.normalizeCardNewsOptions(cardNews);
    const output =
      normalized.outputFormat === "feed_4_5"
        ? { outputWidth: 1080, outputHeight: 1350 }
        : normalized.outputFormat === "square_1_1"
          ? { outputWidth: 1080, outputHeight: 1080 }
          : { outputWidth: 1080, outputHeight: 1920 };
    return {
      ...output
    };
  }

  private mapCardNewsTransitionToMotion(
    transitionStyle: NonNullable<SceneScriptDocument["cardNews"]>["transitionStyle"]
  ): SceneScriptItem["motion"] {
    if (transitionStyle === "slide") {
      return "pan-right";
    }
    if (transitionStyle === "wipe") {
      return "wipe-transition";
    }
    if (transitionStyle === "fade") {
      return "zoom-in";
    }
    return "none";
  }

  private toCardNewsCardText(rawText: string, sceneNo: number): string {
    const compact = rawText
      .replace(/\r?\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!compact) {
      return rawText;
    }
    const chunks = compact
      .split(/[.!?。！？]\s*/g)
      .map((item) => item.trim())
      .filter(Boolean);
    const picked = (sceneNo === 1 ? chunks.slice(0, 1) : chunks.slice(0, 2)).join(" ");
    const limit = sceneNo === 1 ? 32 : 54;
    const clamped = picked.length > limit ? `${picked.slice(0, limit - 1).trim()}…` : picked;
    const maxLineLength = sceneNo === 1 ? 14 : 18;
    const maxLines = sceneNo === 1 ? 2 : 3;
    const words = clamped.split(" ");
    const lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (nextLine.length > maxLineLength && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = nextLine;
      }
      if (lines.length >= maxLines) {
        break;
      }
    }
    if (currentLine && lines.length < maxLines) {
      lines.push(currentLine);
    }
    return lines.slice(0, maxLines).join("\n");
  }

  private buildDefaultCardDesign(sceneNo: number): NonNullable<SceneScriptItem["cardDesign"]> {
    return {
      layerOrder: 0,
      hidden: false,
      locked: false,
      xPct: 8,
      yPct: sceneNo === 1 ? 72 : 58,
      widthPct: 84,
      heightPct: sceneNo === 1 ? 20 : 30,
      align: "center",
      verticalAlign: "middle",
      fontSize: sceneNo === 1 ? 72 : 52,
      fontWeight: 700,
      textColor: "#FFFFFF",
      backgroundColor: "rgba(0,0,0,0.52)",
      lineHeight: 1.28,
      padding: 28
    };
  }

  private applyCardNewsTemplateAssets(
    manifest: GeneratedMediaPackageManifest,
    packagePath: string,
    document: SceneScriptDocument
  ): GeneratedMediaPackageManifest {
    const cardNews = this.normalizeCardNewsOptions(document.cardNews);
    const transitionMotion = this.mapCardNewsTransitionToMotion(cardNews.transitionStyle);
    const templateSourcePath = this.resolveExistingPath(
      cardNews.templateBackgroundPath,
      this.pathService.getBundledBackgroundPath("community")
    );
    const copiedTemplatePath = templateSourcePath
      ? this.copyAssetToPackage(packagePath, templateSourcePath, "card-news-template")
      : undefined;
    const copiedCoverPath =
      cardNews.coverSource === "manual_upload"
        ? this.copyAssetToPackage(packagePath, cardNews.coverImagePath, "card-news-cover")
        : undefined;

    return {
      ...manifest,
      scenes: manifest.scenes.map((scene) => {
        if (scene.sceneIndex === 1) {
          if (copiedCoverPath) {
            return {
              ...scene,
              motion: "none",
              selectedAsset: {
                provider: "local",
                assetType: "image",
                localPath: copiedCoverPath
              },
              fallbackUsed: false
            };
          }
          return {
            ...scene,
            motion: "none"
          };
        }

        if (!copiedTemplatePath) {
          return scene;
        }
        return {
          ...scene,
          motion: transitionMotion,
          selectedAsset: {
            provider: "local",
            assetType: "image",
            localPath: copiedTemplatePath
          },
          fallbackUsed: false
        };
      })
    };
  }

  private resolveExistingPath(...candidates: Array<string | undefined>): string | undefined {
    for (const candidate of candidates) {
      const resolved = candidate?.trim();
      if (!resolved) {
        continue;
      }
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
    return undefined;
  }

  private copyAssetToPackage(
    packagePath: string,
    sourcePath?: string,
    targetStem?: string
  ): string | undefined {
    const resolvedSource = sourcePath?.trim();
    if (!resolvedSource || !fs.existsSync(resolvedSource)) {
      return undefined;
    }
    const extension = path.extname(resolvedSource) || ".png";
    const safeStem = (targetStem ?? "asset").replace(/[^\w.-]+/g, "_");
    const relativePath = path.join("assets", `${safeStem}${extension}`);
    const absoluteTargetPath = path.join(packagePath, relativePath);
    this.fileService.ensureDir(path.dirname(absoluteTargetPath));
    fs.copyFileSync(resolvedSource, absoluteTargetPath);
    return relativePath;
  }

  private async materializeCardNewsImages(
    manifest: GeneratedMediaPackageManifest,
    packagePath: string,
    sceneScript: SceneScriptDocument
  ): Promise<{
    manifest: GeneratedMediaPackageManifest;
    cards: Array<{ sceneIndex: number; path: string; text: string }>;
  }> {
    const assetDir = path.join(packagePath, "assets");
    this.fileService.ensureDir(assetDir);
    const cards: Array<{ sceneIndex: number; path: string; text: string }> = [];
    const sceneByIndex = new Map(
      sceneScript.scenes.map((scene) => [scene.sceneNo, scene] as const)
    );
    const scenes = await Promise.all(
      manifest.scenes.map(async (scene) => {
        const selected = scene.selectedAsset;
        const targetName = `card-${String(scene.sceneIndex).padStart(2, "0")}.jpg`;
        const relativeTargetPath = path.join("assets", targetName);
        const absoluteTargetPath = path.join(packagePath, relativeTargetPath);
        const sceneScriptItem = sceneByIndex.get(scene.sceneIndex);
        const cardText = sceneScriptItem?.text ?? "";
        const cardDesignBoxes = this.normalizeCardDesignBoxes(sceneScriptItem, scene.sceneIndex);
        let materialized = false;

        if (selected?.localPath) {
          const absoluteLocalPath = path.join(packagePath, selected.localPath);
          if (fs.existsSync(absoluteLocalPath)) {
            if (path.resolve(absoluteLocalPath) !== path.resolve(absoluteTargetPath)) {
              fs.copyFileSync(absoluteLocalPath, absoluteTargetPath);
            }
            materialized = true;
          }
        }

        if (!materialized && !selected?.sourceUrl) {
          return scene;
        }

        if (!materialized) {
          const decoded = this.decodeDataImageSource(selected?.sourceUrl);
          if (decoded) {
            this.fileService.writeBinaryFile(path.join(assetDir, targetName), decoded);
          } else {
            const response = await fetch(selected?.sourceUrl ?? "");
            if (!response.ok) {
              throw new Error(`Card image download failed: HTTP ${response.status}`);
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            this.fileService.writeBinaryFile(path.join(assetDir, targetName), buffer);
          }
          materialized = true;
        }

        if (materialized && scene.sceneIndex > 1) {
          await this.renderCardTextOverlays(
            absoluteTargetPath,
            absoluteTargetPath,
            cardText,
            cardDesignBoxes
          );
        }

        cards.push({
          sceneIndex: scene.sceneIndex,
          path: relativeTargetPath,
          text: cardText
        });
        return {
          ...scene,
          selectedAsset: {
            ...(selected ?? {
              provider: "local",
              assetType: "image"
            }),
            provider: "local" as const,
            assetType: "image" as const,
            localPath: relativeTargetPath
          }
        };
      })
    );

    return {
      manifest: {
        ...manifest,
        scenes
      },
      cards: cards.sort((left, right) => left.sceneIndex - right.sceneIndex)
    };
  }

  private normalizeCardDesignBoxes(
    sceneScriptItem: SceneScriptItem | undefined,
    sceneIndex: number
  ): Array<NonNullable<SceneScriptItem["cardDesign"]>> {
    const fallback = this.buildDefaultCardDesign(sceneIndex);
    const rawBoxes =
      sceneScriptItem?.cardDesignBoxes && sceneScriptItem.cardDesignBoxes.length > 0
        ? sceneScriptItem.cardDesignBoxes
        : [sceneScriptItem?.cardDesign ?? fallback];
    return rawBoxes
      .map((box, index) => ({
        ...fallback,
        ...(box ?? {}),
        text: box?.text?.trim() || undefined,
        layerOrder: box?.layerOrder ?? index,
        hidden: Boolean(box?.hidden),
        locked: Boolean(box?.locked)
      }))
      .sort((left, right) => (left.layerOrder ?? 0) - (right.layerOrder ?? 0));
  }

  private async renderCardTextOverlays(
    inputImagePath: string,
    outputImagePath: string,
    fallbackText: string,
    designs: Array<NonNullable<SceneScriptItem["cardDesign"]>>
  ): Promise<void> {
    const ffmpegExecutable = this.resolveBundledFfmpegExecutable();
    if (!ffmpegExecutable) {
      throw new Error("Bundled FFmpeg was not found for card image text rendering.");
    }
    const fontFile = this.resolveCardNewsFontFile();
    const escapedFont = fontFile
      ? fontFile.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'")
      : "";
    const filters = designs
      .filter((design) => !design.hidden)
      .map((design, index) => {
        const textSource = design.text?.trim() || (index === 0 ? fallbackText : "");
        if (!textSource) {
          return "";
        }
        const escapedText = this.escapeFfmpegDrawtext(textSource);
        const textAlign = design.align;
        const xExpr =
          textAlign === "left"
            ? `w*${(design.xPct / 100).toFixed(4)}+${design.padding}`
            : textAlign === "right"
              ? `w*${((design.xPct + design.widthPct) / 100).toFixed(4)}-text_w-${design.padding}`
              : `w*${(design.xPct / 100).toFixed(4)}+(w*${(design.widthPct / 100).toFixed(4)}-text_w)/2`;
        const yExpr =
          design.verticalAlign === "top"
            ? `h*${(design.yPct / 100).toFixed(4)}+${design.padding}`
            : design.verticalAlign === "bottom"
              ? `h*${((design.yPct + design.heightPct) / 100).toFixed(4)}-text_h-${design.padding}`
              : `h*${(design.yPct / 100).toFixed(4)}+(h*${(design.heightPct / 100).toFixed(4)}-text_h)/2`;
        const bgAlpha = this.extractRgbaAlpha(design.backgroundColor);
        return [
          `drawbox=x=w*${(design.xPct / 100).toFixed(4)}:y=h*${(design.yPct / 100).toFixed(4)}:w=w*${(design.widthPct / 100).toFixed(4)}:h=h*${(design.heightPct / 100).toFixed(4)}:color=black@${bgAlpha}:t=fill`,
          `drawtext=${fontFile ? `fontfile='${escapedFont}':` : ""}text='${escapedText}':fontcolor=${this.toFfmpegColor(design.textColor)}:fontsize=${Math.max(20, Math.round(design.fontSize))}:line_spacing=${Math.max(0, Math.round((design.lineHeight - 1) * design.fontSize))}:x=${xExpr}:y=${yExpr}`
        ].join(",");
      })
      .filter(Boolean);
    if (filters.length === 0) {
      return;
    }
    const filter = filters.join(",");
    const samePath = path.resolve(inputImagePath) === path.resolve(outputImagePath);
    const resolvedOutputPath = samePath
      ? path.join(path.dirname(outputImagePath), `${path.basename(outputImagePath, path.extname(outputImagePath))}.overlay${path.extname(outputImagePath)}`)
      : outputImagePath;

    await this.runFfmpegSingleFrame(ffmpegExecutable, [
      "-y",
      "-i",
      inputImagePath,
      "-vf",
      filter,
      "-frames:v",
      "1",
      resolvedOutputPath
    ]);
    if (samePath) {
      fs.copyFileSync(resolvedOutputPath, outputImagePath);
      fs.unlinkSync(resolvedOutputPath);
    }
  }

  private runFfmpegSingleFrame(ffmpegExecutable: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(ffmpegExecutable, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stderr = "";
      let stdout = "";
      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `ffmpeg exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
  }

  private resolveBundledFfmpegExecutable(): string | undefined {
    const candidates =
      process.platform === "win32"
        ? [
            this.pathService.getBundledToolPath("ffmpeg.exe"),
            this.pathService.getBundledToolPath("ffmpeg")
          ]
        : [
            this.pathService.getBundledToolPath("ffmpeg"),
            this.pathService.getBundledToolPath("ffmpeg.exe")
          ];
    return candidates.find((candidate) => fs.existsSync(candidate));
  }

  private resolveCardNewsFontFile(): string | undefined {
    const fontsDir = this.pathService.getBundledFontsPath();
    if (!fs.existsSync(fontsDir)) {
      return undefined;
    }
    const preferred = ["GmarketSansTTFMedium.ttf", "GmarketSansTTFBold.ttf"];
    for (const fileName of preferred) {
      const candidate = path.join(fontsDir, fileName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    const fallback = fs
      .readdirSync(fontsDir)
      .find((name) => /\.(ttf|otf)$/i.test(name));
    return fallback ? path.join(fontsDir, fallback) : undefined;
  }

  private escapeFfmpegDrawtext(text: string): string {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/:/g, "\\:")
      .replace(/,/g, "\\,")
      .replace(/'/g, "\\'")
      .replace(/%/g, "\\%")
      .replace(/\r?\n/g, "\\n");
  }

  private toFfmpegColor(value: string): string {
    const raw = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) {
      return raw;
    }
    return "#FFFFFF";
  }

  private extractRgbaAlpha(value: string): string {
    const match = value.match(/rgba?\([^)]*?([0-9.]+)\s*\)$/i);
    if (!match) {
      return "0.52";
    }
    const alpha = Number.parseFloat(match[1]);
    if (!Number.isFinite(alpha)) {
      return "0.52";
    }
    if (alpha > 1) {
      return "1";
    }
    if (alpha < 0) {
      return "0";
    }
    return alpha.toFixed(2);
  }

  private decodeDataImageSource(sourceUrl?: string): Buffer | undefined {
    if (!sourceUrl || !sourceUrl.startsWith("data:image/")) {
      return undefined;
    }

    const splitIndex = sourceUrl.indexOf(",");
    if (splitIndex <= 0) {
      return undefined;
    }

    const header = sourceUrl.slice(0, splitIndex).toLowerCase();
    if (!header.includes(";base64")) {
      return undefined;
    }

    try {
      const encoded = sourceUrl.slice(splitIndex + 1);
      const buffer = Buffer.from(encoded, "base64");
      return buffer.length ? buffer : undefined;
    } catch {
      return undefined;
    }
  }

  private buildSceneQueryOverrideMap(document?: SceneScriptDocument): Record<number, string> | undefined {
    if (!document) {
      return undefined;
    }

    const entries = document.scenes
      .map((scene) => [scene.sceneNo, scene.assetSearchQuery?.trim()] as const)
      .filter((entry): entry is readonly [number, string] => Boolean(entry[1]));

    if (entries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(entries);
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
