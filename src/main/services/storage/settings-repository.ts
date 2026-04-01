import fs from "node:fs";
import path from "node:path";
import type { AppSettings } from "../../../common/types/settings";
import { PathService } from "../system/path-service";
import { SecretsStore } from "./secrets-store";

const SECRET_KEYS = [
  "openRouterApiKey",
  "openAiApiKey",
  "secondaryOpenRouterApiKey",
  "secondaryOpenAiApiKey",
  "telegramBotToken",
  "pexelsApiKey",
  "azureSpeechKey",
  "youtubeOAuthClientSecret",
  "instagramAccessToken"
] as const;

export class SettingsRepository {
  private currentSettings: AppSettings;

  constructor(
    private readonly pathService: PathService,
    private readonly secretsStore: SecretsStore
  ) {
    this.currentSettings = this.load();
  }

  get(): AppSettings {
    return this.currentSettings;
  }

  refreshSecrets(): AppSettings {
    this.currentSettings = this.readMergedSettings();
    return this.currentSettings;
  }

  set(patch: Partial<AppSettings>): AppSettings {
    for (const secretKey of SECRET_KEYS) {
      if (secretKey in patch) {
        const secretValue = patch[secretKey];
        if (typeof secretValue === "string" && secretValue.trim()) {
          this.secretsStore.set(secretKey, secretValue);
        } else {
          this.secretsStore.delete(secretKey);
        }
      }
    }

    this.currentSettings = {
      ...this.currentSettings,
      ...patch
    };
    this.write(this.currentSettings);
    this.currentSettings = this.readMergedSettings();
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
      this.safeWrite(defaults);
      return defaults;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Partial<AppSettings>;
      this.migratePlaintextSecrets(parsed);
      const merged = {
        ...defaults,
        ...parsed
      };
      this.safeWrite(merged);
      return this.readMergedSettings();
    } catch {
      this.safeWrite(defaults);
      return this.readMergedSettings();
    }
  }

  private write(settings: AppSettings): void {
    const sanitized = this.stripSecrets(settings);
    fs.writeFileSync(
      this.pathService.getSettingsPath(),
      JSON.stringify(sanitized, null, 2),
      "utf-8"
    );
  }

  private safeWrite(settings: AppSettings): void {
    try {
      this.write(settings);
    } catch (error) {
      console.error("Failed to write settings file:", error);
    }
  }

  private getDefaults(): AppSettings {
    return {
      vaultPath: this.pathService.getDefaultVaultPath(),
      generatedMcpConfigPath: this.pathService.getGeneratedConfigPath(),
      autoUpdate: true,
      launchOnStartup: false,
      launcherLanguage: "ko",
      trendWindow: "24h",
      apiBaseUrl: process.env.MELLOWCAT_API_URL,
      claudeArgs: [],
      scriptProvider: "openrouter_api",
      openRouterModel: "openai/gpt-5.4-mini",
      openAiModel: "gpt-5.4-mini",
      secondaryScriptProvider: "openai_api",
      secondaryOpenRouterModel: "anthropic/claude-sonnet-4.6",
      secondaryOpenAiModel: "gpt-5.4",
      telegramOutputLanguage: "ko",
      instagramAccountHandle: "",
      azureSpeechVoice: "ko-KR-SunHiNeural",
      youtubePrivacyStatus: "private",
      youtubeCategoryId: "22",
      youtubeAudience: "not_made_for_kids",
      youtubeOAuthRedirectPort: "45123",
      mediaAnalysisPolicy: "text_only"
    };
  }

  private readMergedSettings(): AppSettings {
    const settingsPath = this.pathService.getSettingsPath();
    const defaults = this.getDefaults();
    let parsed: Partial<AppSettings> = {};

    try {
      parsed = fs.existsSync(settingsPath)
        ? (JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Partial<AppSettings>)
        : {};
    } catch (error) {
      console.error("Failed to read settings file:", error);
    }

    const merged: AppSettings = {
      ...defaults,
      ...parsed
    };

    for (const secretKey of SECRET_KEYS) {
      const secretValue = this.secretsStore.get(secretKey);
      if (secretValue) {
        merged[secretKey] = secretValue;
      } else {
        delete merged[secretKey];
      }
    }

    return merged;
  }

  private stripSecrets(settings: AppSettings): AppSettings {
    const sanitized = { ...settings };
    for (const secretKey of SECRET_KEYS) {
      delete sanitized[secretKey];
    }
    return sanitized;
  }

  private migratePlaintextSecrets(parsed: Partial<AppSettings>): void {
    for (const secretKey of SECRET_KEYS) {
      const value = parsed[secretKey];
      if (typeof value === "string" && value.trim()) {
        this.secretsStore.set(secretKey, value);
        delete parsed[secretKey];
      }
    }
  }
}
