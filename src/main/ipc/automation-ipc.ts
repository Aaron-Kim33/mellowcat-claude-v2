import { ipcMain } from "electron";
import { TelegramControlService } from "../services/automation/telegram-control-service";

export function registerAutomationIpc(
  telegramControlService: TelegramControlService
): void {
  ipcMain.handle("automation:telegram:getStatus", () =>
    telegramControlService.getStatus()
  );
  ipcMain.handle("automation:telegram:sync", () => telegramControlService.syncUpdates());
  ipcMain.handle("automation:telegram:sendMockShortlist", () =>
    telegramControlService.sendMockShortlist()
  );
}
