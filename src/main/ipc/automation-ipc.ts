import { ipcMain } from "electron";
import type { ShortformWorkflowConfig } from "../../common/types/automation";
import { TelegramControlService } from "../services/automation/telegram-control-service";
import { ShortformWorkflowConfigService } from "../services/automation/shortform-workflow-config-service";
import { YouTubeAuthService } from "../services/automation/youtube-auth-service";

export function registerAutomationIpc(
  telegramControlService: TelegramControlService,
  youTubeAuthService: YouTubeAuthService,
  workflowConfigService: ShortformWorkflowConfigService
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
  ipcMain.handle("automation:youtube:uploadPackage", (_event, packagePath: string) =>
    youTubeAuthService.uploadPackage(packagePath)
  );
}
