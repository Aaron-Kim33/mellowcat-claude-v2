import fs from "node:fs";
import path from "node:path";
import type { AppSettings } from "../../../common/types/settings";
import { PathService } from "../system/path-service";

export class SettingsRepository {
  private currentSettings: AppSettings;

  constructor(private readonly pathService: PathService) {
    this.currentSettings = this.load();
  }

  get(): AppSettings {
    return this.currentSettings;
  }

  set(patch: Partial<AppSettings>): AppSettings {
    this.currentSettings = {
      ...this.currentSettings,
      ...patch
    };
    this.write(this.currentSettings);
    return this.currentSettings;
  }

  private load(): AppSettings {
    const defaults = this.getDefaults();
    const settingsPath = this.pathService.getSettingsPath();
    const settingsDir = path.dirname(settingsPath);

    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }

    if (!fs.existsSync(settingsPath)) {
      fs.writeFileSync(settingsPath, JSON.stringify(defaults, null, 2), "utf-8");
      return defaults;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Partial<AppSettings>;
      const merged = {
        ...defaults,
        ...parsed
      };
      this.write(merged);
      return merged;
    } catch {
      this.write(defaults);
      return defaults;
    }
  }

  private write(settings: AppSettings): void {
    fs.writeFileSync(
      this.pathService.getSettingsPath(),
      JSON.stringify(settings, null, 2),
      "utf-8"
    );
  }

  private getDefaults(): AppSettings {
    return {
      vaultPath: this.pathService.getDefaultVaultPath(),
      generatedMcpConfigPath: this.pathService.getGeneratedConfigPath(),
      autoUpdate: true,
      launchOnStartup: false,
      launcherLanguage: "en",
      trendWindow: "24h",
      apiBaseUrl: process.env.MELLOWCAT_API_URL,
      claudeArgs: [],
      scriptProvider: "openrouter_api",
      openRouterModel: "openai/gpt-4o-mini",
      openAiModel: "gpt-5-mini",
      telegramOutputLanguage: "en",
      mediaAnalysisPolicy: "text_only"
    };
  }
}
