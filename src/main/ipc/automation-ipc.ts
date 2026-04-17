import { BrowserWindow, dialog, ipcMain } from "electron";
import type { OpenDialogOptions } from "electron";
import type {
  AutomationJobSnapshot,
  ShortformWorkflowConfig
} from "../../common/types/automation";
import type { SceneScriptDocument } from "../../common/types/media-generation";
import type { YouTubeUploadRequest } from "../../common/types/settings";
import type {
  AutoProcessDraftPayload,
  ManualInputCheckpointPayload,
  ManualCreateCheckpointPayload,
  ManualOutputCheckpointPayload,
  ManualProcessCheckpointPayload
} from "../../common/types/slot-workflow";
import type {
  YouTubeBreakoutDiscoveryRequest,
  YouTubeCandidateAnalysisRequest,
  YouTubeTranscriptProbeRequest
} from "../../common/types/trend";
import type { TrendCandidate } from "../../common/types/trend";
import { CheckpointWorkflowService } from "../services/automation/checkpoint-workflow-service";
import { ProductionPackageService } from "../services/automation/production-package-service";
import { ShortformScriptService } from "../services/automation/shortform-script-service";
import { TelegramControlService } from "../services/automation/telegram-control-service";
import { TrendDiscoveryService } from "../services/automation/trend-discovery-service";
import { ShortformWorkflowConfigService } from "../services/automation/shortform-workflow-config-service";
import { YouTubeAuthService } from "../services/automation/youtube-auth-service";
import { PathService } from "../services/system/path-service";

export function registerAutomationIpc(
  telegramControlService: TelegramControlService,
  trendDiscoveryService: TrendDiscoveryService,
  youTubeAuthService: YouTubeAuthService,
  workflowConfigService: ShortformWorkflowConfigService,
  checkpointWorkflowService: CheckpointWorkflowService,
  productionPackageService: ProductionPackageService,
  shortformScriptService: ShortformScriptService,
  pathService: PathService
): void {
  ipcMain.handle("automation:workflow:getConfig", () => workflowConfigService.get());
  ipcMain.handle(
    "automation:workflow:setConfig",
    (_event, patch: Partial<ShortformWorkflowConfig>) => workflowConfigService.set(patch)
  );
  ipcMain.handle("automation:telegram:getStatus", () =>
    telegramControlService.getStatus()
  );
  ipcMain.handle("automation:telegram:sync", () => telegramControlService.syncUpdates());
  ipcMain.handle("automation:telegram:sendMockShortlist", () =>
    telegramControlService.sendMockShortlist()
  );
  ipcMain.handle("automation:crawl:discoverYouTubeBreakouts", (_event, request: YouTubeBreakoutDiscoveryRequest) =>
    trendDiscoveryService.discoverYouTubeBreakoutCandidates(
      request,
      workflowConfigService.get().youtubeDataApiKey
    )
  );
  ipcMain.handle(
    "automation:crawl:analyzeYouTubeCandidate",
    (_event, request: YouTubeCandidateAnalysisRequest) =>
      shortformScriptService.analyzeYouTubeCandidate(request)
  );
  ipcMain.handle(
    "automation:crawl:probeYouTubeTranscript",
    (_event, request: YouTubeTranscriptProbeRequest) =>
      shortformScriptService.probeYouTubeTranscript(request)
  );
  ipcMain.handle("automation:youtube:getStatus", () => youTubeAuthService.getStatus());
  ipcMain.handle("automation:youtube:connect", () => youTubeAuthService.connect());
  ipcMain.handle("automation:youtube:disconnect", () => youTubeAuthService.disconnect());
  ipcMain.handle("automation:youtube:inspectUploadRequest", (_event, packagePath: string) =>
    youTubeAuthService.inspectUploadRequest(packagePath)
  );
  ipcMain.handle(
    "automation:youtube:updateUploadRequest",
    (_event, packagePath: string, patch: Partial<YouTubeUploadRequest>) =>
      youTubeAuthService.updateUploadRequest(packagePath, patch)
  );
  ipcMain.handle("automation:youtube:pickVideoFile", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        {
          name: "Video files",
          extensions: ["mp4", "mov", "webm", "mkv"]
        }
      ]
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("automation:youtube:pickThumbnailFile", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        {
          name: "Image files",
          extensions: ["png", "jpg", "jpeg", "webp"]
        }
      ]
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("automation:create:pickBackgroundFile", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        {
          name: "Media files",
          extensions: ["mp4", "mov", "webm", "mkv", "png", "jpg", "jpeg", "webp"]
        }
      ]
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("automation:youtube:pickPackageFolder", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ["openDirectory"],
      defaultPath: pathService.getAutomationPackagesRootPath()
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("automation:youtube:uploadPackage", (_event, packagePath: string) =>
    youTubeAuthService.uploadPackage(packagePath)
  );
  ipcMain.handle("automation:workflow:inspectJob", (_event, jobId: string) =>
    checkpointWorkflowService.inspectJob(jobId)
  );
  ipcMain.handle("automation:workflow:getCreateReadiness", (_event, jobId: string) =>
    productionPackageService.getCreateReadiness(jobId)
  );
  ipcMain.handle("automation:create:inspectSceneScript", (_event, packagePath: string) =>
    productionPackageService.inspectSceneScript(packagePath)
  );
  ipcMain.handle(
    "automation:create:updateSceneScript",
    (_event, packagePath: string, document: SceneScriptDocument) =>
      productionPackageService.updateSceneScript(packagePath, document)
  );
  ipcMain.handle("automation:workflow:runCreatePipeline", (_event, jobId: string) =>
    productionPackageService.runCreatePipeline(jobId)
  );
  ipcMain.handle("automation:workflow:rerenderCreateComposition", (_event, jobId: string) =>
    productionPackageService.rerenderCreateComposition(jobId)
  );
  ipcMain.handle(
    "automation:workflow:rerenderCreateScenes",
    (_event, jobId: string, sceneIndexes: number[]) =>
      productionPackageService.rerenderCreateScenes(jobId, sceneIndexes)
  );
  ipcMain.handle(
    "automation:workflow:refreshCreateAssets",
    (_event, jobId: string, sceneIndexes: number[]) =>
      productionPackageService.refreshCreateAssets(jobId, sceneIndexes)
  );
  ipcMain.handle("automation:workflow:refreshCreateVoiceover", (_event, jobId: string) =>
    productionPackageService.refreshCreateVoiceover(jobId)
  );
  ipcMain.handle("automation:workflow:refreshCreateSubtitles", (_event, jobId: string) =>
    productionPackageService.refreshCreateSubtitles(jobId)
  );
  ipcMain.handle(
    "automation:workflow:saveManualInputCheckpoint",
    (_event, payload: ManualInputCheckpointPayload) =>
      checkpointWorkflowService.saveManualInputCheckpoint(payload)
  );
  ipcMain.handle(
    "automation:workflow:saveManualProcessCheckpoint",
    (_event, payload: ManualProcessCheckpointPayload) =>
      checkpointWorkflowService.saveManualProcessCheckpoint(payload)
  );
  ipcMain.handle(
    "automation:workflow:generateProcessDraft",
    async (_event, payload: AutoProcessDraftPayload) => {
      const snapshot = checkpointWorkflowService.inspectJob(payload.jobId);
      const inputCheckpoint = snapshot.checkpoints[1] as
        | {
            payload?: {
              candidates?: TrendCandidate[];
            };
          }
        | undefined;
      const candidates = inputCheckpoint?.payload?.candidates ?? [];
      if (!candidates.length) {
        throw new Error("checkpoint-1 후보가 없습니다. 먼저 후보를 저장해 주세요.");
      }

      const selectedCandidate =
        (payload.selectedCandidateId
          ? candidates.find((candidate) => candidate.id === payload.selectedCandidateId)
          : undefined) ?? candidates[0];
      if (!selectedCandidate?.title?.trim()) {
        throw new Error("선택한 후보 정보가 비어 있습니다. 다른 후보를 선택해 주세요.");
      }

      const now = new Date().toISOString();
      const job: AutomationJobSnapshot = {
        id: payload.jobId,
        title: selectedCandidate.title.trim() || snapshot.job?.title || "Process draft job",
        stage: "awaiting_review",
        createdAt: snapshot.job?.createdAt ?? now,
        updatedAt: now
      };
      const scriptCategory = payload.scriptCategory ?? "community";
      const ideaStrategy =
        payload.ideaStrategy === "pattern_remix" ||
        payload.ideaStrategy === "series_ip" ||
        payload.ideaStrategy === "comment_gap"
          ? payload.ideaStrategy
          : "comment_gap";
      const lengthMode =
        payload.lengthMode === "shortform" ||
        payload.lengthMode === "longform" ||
        payload.lengthMode === "auto"
          ? payload.lengthMode
          : "auto";
      const draftMode =
        payload.draftMode === "manual_polish" || payload.draftMode === "auto_generate"
          ? payload.draftMode
          : workflowConfigService.get().processDraftMode ?? "manual_polish";
      const sourceDraft = payload.sourceDraft
        ? {
            headline: payload.sourceDraft.headline?.trim() || undefined,
            summary: payload.sourceDraft.summary?.trim() || undefined,
            titleOptions: Array.isArray(payload.sourceDraft.titleOptions)
              ? payload.sourceDraft.titleOptions
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .slice(0, 5)
              : undefined,
            hook: payload.sourceDraft.hook?.trim() || undefined,
            narration: payload.sourceDraft.narration?.trim() || undefined,
            callToAction: payload.sourceDraft.callToAction?.trim() || undefined,
            operatorMemo: payload.sourceDraft.operatorMemo?.trim() || undefined
          }
        : undefined;
      const revisionRequest = payload.revisionRequest?.trim() || undefined;
      const draftResult = await shortformScriptService.generateDraft(
        selectedCandidate.title.trim(),
        revisionRequest,
        scriptCategory,
        ideaStrategy,
        lengthMode,
        draftMode,
        sourceDraft
      );

      checkpointWorkflowService.writeProcessCheckpoint({
        job,
        mode: "manual",
        selectedCandidateId: selectedCandidate.id,
        selectedCandidate,
        draft: draftResult.draft,
        scriptCategory,
        ideaStrategy,
        lengthMode,
        draftMode,
        revisionRequest,
        source: draftResult.source,
        error: draftResult.error
      });

      return checkpointWorkflowService.inspectJob(payload.jobId);
    }
  );
  ipcMain.handle(
    "automation:workflow:saveManualCreateCheckpoint",
    (_event, payload: ManualCreateCheckpointPayload) =>
      checkpointWorkflowService.saveManualCreateCheckpoint(payload)
  );
  ipcMain.handle(
    "automation:workflow:saveManualOutputCheckpoint",
    (_event, payload: ManualOutputCheckpointPayload) =>
      checkpointWorkflowService.saveManualOutputCheckpoint(payload)
  );
}
