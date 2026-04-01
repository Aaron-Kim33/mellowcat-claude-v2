import { BrowserWindow, dialog, ipcMain } from "electron";
import type { OpenDialogOptions } from "electron";
import type { ShortformWorkflowConfig } from "../../common/types/automation";
import type { YouTubeUploadRequest } from "../../common/types/settings";
import type {
  ManualInputCheckpointPayload,
  ManualCreateCheckpointPayload,
  ManualOutputCheckpointPayload,
  ManualProcessCheckpointPayload
} from "../../common/types/slot-workflow";
import { CheckpointWorkflowService } from "../services/automation/checkpoint-workflow-service";
import { ProductionPackageService } from "../services/automation/production-package-service";
import { TelegramControlService } from "../services/automation/telegram-control-service";
import { ShortformWorkflowConfigService } from "../services/automation/shortform-workflow-config-service";
import { YouTubeAuthService } from "../services/automation/youtube-auth-service";

export function registerAutomationIpc(
  telegramControlService: TelegramControlService,
  youTubeAuthService: YouTubeAuthService,
  workflowConfigService: ShortformWorkflowConfigService,
  checkpointWorkflowService: CheckpointWorkflowService,
  productionPackageService: ProductionPackageService
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
  ipcMain.handle("automation:youtube:uploadPackage", (_event, packagePath: string) =>
    youTubeAuthService.uploadPackage(packagePath)
  );
  ipcMain.handle("automation:workflow:inspectJob", (_event, jobId: string) =>
    checkpointWorkflowService.inspectJob(jobId)
  );
  ipcMain.handle("automation:workflow:runCreatePipeline", (_event, jobId: string) =>
    productionPackageService.runCreatePipeline(jobId)
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
