import { app } from "electron";
import { WindowManager } from "./window-manager";
import { registerClaudeIpc } from "../ipc/claude-ipc";
import { registerMcpIpc } from "../ipc/mcp-ipc";
import { registerSettingsIpc } from "../ipc/settings-ipc";
import { registerAuthIpc } from "../ipc/store-ipc";
import { registerSystemIpc } from "../ipc/system-ipc";
import { registerAppIpc } from "../ipc/app-ipc";
import { registerAutomationIpc } from "../ipc/automation-ipc";
import { PathService } from "../services/system/path-service";
import { FileService } from "../services/system/file-service";
import { ManifestRepository } from "../services/storage/manifest-repository";
import { SettingsRepository } from "../services/storage/settings-repository";
import { SecretsStore } from "../services/storage/secrets-store";
import { ClaudeEngine } from "../services/claude/claude-engine";
import { ClaudeInstallationService } from "../services/claude/claude-installation-service";
import { CatalogService } from "../services/catalog/catalog-service";
import { AuthService } from "../services/auth/auth-service";
import { EntitlementService } from "../services/auth/entitlement-service";
import { MCPInstallService } from "../services/mcp/mcp-install-service";
import { MCPRegistryService } from "../services/mcp/mcp-registry-service";
import { MCPRuntimeService } from "../services/mcp/mcp-runtime-service";
import { MCPUpdateService } from "../services/mcp/mcp-update-service";
import { MCPConfigService } from "../services/mcp/mcp-config-service";
import { MCPRemotePackageService } from "../services/mcp/mcp-remote-package-service";
import { MellowCatApiClient } from "../api/mellowcat-api-client";
import { AppUpdateService } from "../services/update/app-update-service";
import { ProductionPackageService } from "../services/automation/production-package-service";
import { TelegramControlService } from "../services/automation/telegram-control-service";
import { ShortformScriptService } from "../services/automation/shortform-script-service";
import { TrendDiscoveryService } from "../services/automation/trend-discovery-service";
import { YouTubeAuthService } from "../services/automation/youtube-auth-service";
import { ShortformWorkflowConfigService } from "../services/automation/shortform-workflow-config-service";
import { CheckpointWorkflowService } from "../services/automation/checkpoint-workflow-service";
import { PexelsAssetService } from "../services/automation/pexels-asset-service";
import { ScenePlanService } from "../services/automation/scene-plan-service";
import { SubtitleService } from "../services/automation/subtitle-service";
import { VoiceoverService } from "../services/automation/voiceover-service";
import { MediaCompositionService } from "../services/automation/media-composition-service";
import type { AppSettings } from "../../common/types/settings";

export async function bootstrap(): Promise<void> {
  const pathService = new PathService();
  const fileService = new FileService();
  const manifestRepository = new ManifestRepository(pathService);
  const secretsStore = new SecretsStore(pathService);
  const settingsRepository = new SettingsRepository(pathService, secretsStore);
  const workflowConfigService = new ShortformWorkflowConfigService(pathService, secretsStore);
  const claudeInstallationService = new ClaudeInstallationService(settingsRepository);
  claudeInstallationService.detectAndPersist();
  const apiClient = new MellowCatApiClient(settingsRepository.get().apiBaseUrl);
  const claudeEngine = new ClaudeEngine(settingsRepository, pathService);
  const appUpdateService = new AppUpdateService();
  const trendDiscoveryService = new TrendDiscoveryService();
  const checkpointWorkflowService = new CheckpointWorkflowService(pathService, fileService);
  const shortformScriptService = new ShortformScriptService(
    settingsRepository,
    workflowConfigService
  );
  const pexelsAssetService = new PexelsAssetService();
  const scenePlanService = new ScenePlanService(settingsRepository, workflowConfigService);
  const subtitleService = new SubtitleService();
  const voiceoverService = new VoiceoverService(
    settingsRepository,
    workflowConfigService,
    fileService
  );
  const mediaCompositionService = new MediaCompositionService(fileService, pathService);
  const youTubeAuthService = new YouTubeAuthService(
    workflowConfigService,
    secretsStore,
    pathService,
    checkpointWorkflowService
  );
  const productionPackageService = new ProductionPackageService(
    pathService,
    fileService,
    workflowConfigService,
    checkpointWorkflowService,
    scenePlanService,
    pexelsAssetService,
    subtitleService,
    voiceoverService,
    mediaCompositionService
  );
  const telegramControlService = new TelegramControlService(
    workflowConfigService,
    pathService,
    trendDiscoveryService,
    shortformScriptService,
    productionPackageService,
    checkpointWorkflowService
  );
  const authService = new AuthService(
    apiClient,
    pathService,
    fileService,
    secretsStore
  );
  const entitlementService = new EntitlementService(apiClient);
  const catalogService = new CatalogService(
    pathService,
    fileService,
    apiClient,
    entitlementService
  );
  const remotePackageService = new MCPRemotePackageService(
    apiClient,
    pathService,
    fileService
  );
  const installService = new MCPInstallService(
    manifestRepository,
    pathService,
    fileService,
    catalogService,
    remotePackageService
  );
  const registryService = new MCPRegistryService(manifestRepository);
  const runtimeService = new MCPRuntimeService(manifestRepository);
  const configService = new MCPConfigService(manifestRepository, pathService, fileService);
  const updateService = new MCPUpdateService(
    manifestRepository,
    catalogService,
    installService,
    pathService,
    fileService
  );

  app.whenReady().then(() => {
    settingsRepository.refreshSecrets();
    workflowConfigService.migrateFromLegacySettings(settingsRepository.get());
    const workflowConfig = workflowConfigService.refreshSecrets();
    const settings = settingsRepository.get();
    const aiConnectionPatch: Partial<AppSettings> = {};

    if (!settings.scriptProvider && workflowConfig.scriptProvider) {
      aiConnectionPatch.scriptProvider = workflowConfig.scriptProvider;
    }
    if (!settings.openRouterApiKey && workflowConfig.openRouterApiKey) {
      aiConnectionPatch.openRouterApiKey = workflowConfig.openRouterApiKey;
    }
    if (!settings.openRouterModel && workflowConfig.openRouterModel) {
      aiConnectionPatch.openRouterModel = workflowConfig.openRouterModel;
    }
    if (!settings.openAiApiKey && workflowConfig.openAiApiKey) {
      aiConnectionPatch.openAiApiKey = workflowConfig.openAiApiKey;
    }
    if (!settings.openAiModel && workflowConfig.openAiModel) {
      aiConnectionPatch.openAiModel = workflowConfig.openAiModel;
    }

    if (Object.keys(aiConnectionPatch).length > 0) {
      settingsRepository.set(aiConnectionPatch);
    }
    manifestRepository.ensureManifest();
    appUpdateService.initialize();
    telegramControlService.startPolling();

    registerClaudeIpc(claudeEngine, claudeInstallationService);
    registerMcpIpc({
      catalogService,
      installService,
      registryService,
      runtimeService,
      updateService,
      configService,
      manifestRepository
    });
    registerAppIpc();
    registerSettingsIpc(settingsRepository, (settings) => {
      apiClient.setBaseUrl(settings.apiBaseUrl);
    });
    registerAuthIpc(authService);
    registerSystemIpc(appUpdateService);
    registerAutomationIpc(
      telegramControlService,
      youTubeAuthService,
      workflowConfigService,
      checkpointWorkflowService,
      productionPackageService
    );

    new WindowManager().createMainWindow();
  });
}
