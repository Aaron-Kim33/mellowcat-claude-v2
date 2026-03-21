import { ipcMain } from "electron";
import { SettingsRepository } from "../services/storage/settings-repository";
import type { AppSettings } from "../../common/types/settings";

export function registerSettingsIpc(settingsRepository: SettingsRepository): void {
  ipcMain.handle("settings:get", () => settingsRepository.get());
  ipcMain.handle("settings:set", (_event, patch: Partial<AppSettings>) => settingsRepository.set(patch));
}
