import { app } from "electron";
import { WindowManager } from "./window-manager";
import { registerClaudeIpc } from "../ipc/claude-ipc";
import { registerMcpIpc } from "../ipc/mcp-ipc";
import { registerSettingsIpc } from "../ipc/settings-ipc";
import { registerAuthIpc } from "../ipc/store-ipc";
import { registerSystemIpc } from "../ipc/system-ipc";
import { PathService } from "../services/system/path-service";
import { FileService } from "../services/system/file-service";
import { ManifestRepository } from "../services/storage/manifest-repository";
import { SettingsRepository } from "../services/storage/settings-repository";
import { ClaudeEngine } from "../services/claude/claude-engine";
import { ClaudeInstallationService } from "../services/claude/claude-installation-service";
import { CatalogService } from "../services/catalog/catalog-service";
import { AuthService } from "../services/auth/auth-service";
import { MCPInstallService } from "../services/mcp/mcp-install-service";
import { MCPRegistryService } from "../services/mcp/mcp-registry-service";
import { MCPRuntimeService } from "../services/mcp/mcp-runtime-service";
import { MCPUpdateService } from "../services/mcp/mcp-update-service";
import { MCPConfigService } from "../services/mcp/mcp-config-service";
import { MellowCatApiClient } from "../api/mellowcat-api-client";
import { AppUpdateService } from "../services/update/app-update-service";

export async function bootstrap(): Promise<void> {
  const pathService = new PathService();
  const fileService = new FileService();
  const manifestRepository = new ManifestRepository(pathService);
  const settingsRepository = new SettingsRepository(pathService);
  const claudeInstallationService = new ClaudeInstallationService(settingsRepository);
  claudeInstallationService.detectAndPersist();
  const apiClient = new MellowCatApiClient(settingsRepository.get().apiBaseUrl);
  const claudeEngine = new ClaudeEngine(settingsRepository, pathService);
  const appUpdateService = new AppUpdateService();
  const catalogService = new CatalogService(pathService, fileService, apiClient);
  const authService = new AuthService(apiClient);
  const installService = new MCPInstallService(
    manifestRepository,
    pathService,
    fileService,
    catalogService
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
    manifestRepository.ensureManifest();
    appUpdateService.initialize();

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
    registerSettingsIpc(settingsRepository);
    registerAuthIpc(authService);
    registerSystemIpc(appUpdateService);

    new WindowManager().createMainWindow();
  });
}
