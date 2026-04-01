import fs from "node:fs";
import path from "node:path";
import type { ShortformWorkflowConfig } from "../../../common/types/automation";
import type { AppSettings } from "../../../common/types/settings";
import { SecretsStore } from "../storage/secrets-store";
import { PathService } from "../system/path-service";

const SECRET_KEYS = [
  "openRouterApiKey",
  "openAiApiKey",
  "telegramBotToken",
  "pexelsApiKey",
  "youtubeOAuthClientSecret",
  "instagramAccessToken"
] as const;

export class ShortformWorkflowConfigService {
  private currentConfig: ShortformWorkflowConfig;

  constructor(
    private readonly pathService: PathService,
    private readonly secretsStore: SecretsStore
  ) {
    this.currentConfig = this.load();
  }

  get(): ShortformWorkflowConfig {
    return this.currentConfig;
  }

  migrateFromLegacySettings(settings: Partial<AppSettings>): ShortformWorkflowConfig {
    const current = this.readMergedConfig();
    const patch: Partial<ShortformWorkflowConfig> = {};

    const assignIfMissing = <K extends keyof ShortformWorkflowConfig>(
      key: K,
      value: ShortformWorkflowConfig[K] | undefined
    ) => {
      if (
        value !== undefined &&
        (current[key] === undefined || current[key] === this.getDefaults()[key])
      ) {
        patch[key] = value;
      }
    };

    assignIfMissing("trendWindow", settings.trendWindow);
    assignIfMissing("scriptProvider", settings.scriptProvider);
    assignIfMissing("inputAiConnection", "connection_1");
    assignIfMissing("processAiConnection", "connection_1");
    assignIfMissing("createAiConnection", "connection_1");
    assignIfMissing("outputAiConnection", "connection_1");
    assignIfMissing("inputAiProvider", settings.scriptProvider);
    assignIfMissing("processAiProvider", settings.scriptProvider);
    assignIfMissing("createAiProvider", settings.scriptProvider);
    assignIfMissing("outputAiProvider", settings.scriptProvider);
    assignIfMissing("inputAiModel", settings.openRouterModel ?? settings.openAiModel);
    assignIfMissing("processAiModel", settings.openRouterModel ?? settings.openAiModel);
    assignIfMissing("createAiModel", settings.openRouterModel ?? settings.openAiModel);
    assignIfMissing("outputAiModel", settings.openRouterModel ?? settings.openAiModel);
    assignIfMissing("openRouterModel", settings.openRouterModel);
    assignIfMissing("openAiModel", settings.openAiModel);
    assignIfMissing("telegramAdminChatId", settings.telegramAdminChatId);
    assignIfMissing("telegramOutputLanguage", settings.telegramOutputLanguage);
    assignIfMissing("instagramAccountHandle", settings.instagramAccountHandle);
    assignIfMissing("youtubeChannelLabel", settings.youtubeChannelLabel);
    assignIfMissing("youtubePrivacyStatus", settings.youtubePrivacyStatus);
    assignIfMissing("youtubeCategoryId", settings.youtubeCategoryId);
    assignIfMissing("youtubeAudience", settings.youtubeAudience);
    assignIfMissing("youtubeOAuthClientId", settings.youtubeOAuthClientId);
    assignIfMissing("youtubeOAuthRedirectPort", settings.youtubeOAuthRedirectPort);

    for (const key of SECRET_KEYS) {
      const workflowKey = `workflow:${key}`;
      const currentSecret = this.secretsStore.get(workflowKey);
      const legacySecret = this.secretsStore.get(key);
      const legacyValue = settings[key];

      if (!currentSecret) {
        if (legacySecret) {
          this.secretsStore.set(workflowKey, legacySecret);
        } else if (typeof legacyValue === "string" && legacyValue.trim()) {
          this.secretsStore.set(workflowKey, legacyValue);
        }
      }
    }

    if (Object.keys(patch).length > 0) {
      this.set(patch);
    } else {
      this.currentConfig = this.readMergedConfig();
    }

    return this.currentConfig;
  }

  set(patch: Partial<ShortformWorkflowConfig>): ShortformWorkflowConfig {
    for (const key of SECRET_KEYS) {
      if (key in patch) {
        const value = patch[key];
        if (typeof value === "string" && value.trim()) {
          this.secretsStore.set(`workflow:${key}`, value);
        } else {
          this.secretsStore.delete(`workflow:${key}`);
        }
      }
    }

    this.currentConfig = {
      ...this.currentConfig,
      ...patch
    };
    this.write(this.currentConfig);
    this.currentConfig = this.readMergedConfig();
    return this.currentConfig;
  }

  refreshSecrets(): ShortformWorkflowConfig {
    this.currentConfig = this.readMergedConfig();
    return this.currentConfig;
  }

  private load(): ShortformWorkflowConfig {
    const defaults = this.getDefaults();
    const filePath = this.getConfigPath();
    const directory = path.dirname(filePath);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
      this.write(defaults);
      return this.readMergedConfig();
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<ShortformWorkflowConfig>;
      this.migratePlaintextSecrets(parsed);
      const merged = {
        ...defaults,
        ...parsed
      };
      this.write(merged);
      return this.readMergedConfig();
    } catch {
      this.write(defaults);
      return this.readMergedConfig();
    }
  }

  private readMergedConfig(): ShortformWorkflowConfig {
    const filePath = this.getConfigPath();
    const defaults = this.getDefaults();
    const parsed = fs.existsSync(filePath)
      ? (JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<ShortformWorkflowConfig>)
      : {};

    const merged: ShortformWorkflowConfig = {
      ...defaults,
      ...parsed
    };

    for (const key of SECRET_KEYS) {
      const secret =
        this.secretsStore.get(`workflow:${key}`) ?? this.secretsStore.get(key);
      if (secret) {
        merged[key] = secret;
      } else {
        delete merged[key];
      }
    }

    return merged;
  }

  private write(config: ShortformWorkflowConfig): void {
    fs.writeFileSync(
      this.getConfigPath(),
      JSON.stringify(this.stripSecrets(config), null, 2),
      "utf-8"
    );
  }

  private stripSecrets(config: ShortformWorkflowConfig): ShortformWorkflowConfig {
    const sanitized = { ...config };
    for (const key of SECRET_KEYS) {
      delete sanitized[key];
    }
    return sanitized;
  }

  private migratePlaintextSecrets(parsed: Partial<ShortformWorkflowConfig>): void {
    for (const key of SECRET_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) {
        this.secretsStore.set(`workflow:${key}`, value);
        delete parsed[key];
      }
    }
  }

  private getDefaults(): ShortformWorkflowConfig {
    return {
      inputMode: "auto",
      processMode: "auto",
      createMode: "auto",
      outputMode: "auto",
      inputProviderType: "builtin",
      processProviderType: "builtin",
      createProviderType: "builtin",
      outputProviderType: "builtin",
      inputAiConnection: "connection_1",
      inputAiProvider: "openrouter_api",
      inputAiModel: "openai/gpt-5.4-mini",
      processAiConnection: "connection_1",
      processAiProvider: "openrouter_api",
      processAiModel: "openai/gpt-5.4-mini",
      createAiConnection: "connection_1",
      createAiProvider: "openrouter_api",
      createAiModel: "openai/gpt-5.4-mini",
      outputAiConnection: "connection_1",
      outputAiProvider: "openrouter_api",
      outputAiModel: "openai/gpt-5.4-mini",
      inputAiSummaryEnabled: true,
      processAiGenerationEnabled: true,
      createAiGenerationEnabled: false,
      outputAiGenerationEnabled: false,
      trendWindow: "24h",
      createTargetDurationSec: 60,
      createMinimumSceneCount: 3,
      scriptProvider: "openrouter_api",
      openRouterModel: "openai/gpt-5.4-mini",
      openAiModel: "gpt-5.4-mini",
      telegramOutputLanguage: "ko",
      youtubePrivacyStatus: "private",
      youtubeCategoryId: "22",
      youtubeAudience: "not_made_for_kids",
      youtubeOAuthRedirectPort: "45123"
    };
  }

  private getConfigPath(): string {
    return this.pathService.getAutomationStatePath("shortform-workflow-config.json");
  }
}
