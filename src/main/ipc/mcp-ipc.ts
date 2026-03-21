import { BrowserWindow, ipcMain } from "electron";
import type { MCPOutputEvent } from "../../common/types/mcp";
import { CatalogService } from "../services/catalog/catalog-service";
import { MCPInstallService } from "../services/mcp/mcp-install-service";
import { MCPRegistryService } from "../services/mcp/mcp-registry-service";
import { MCPRuntimeService } from "../services/mcp/mcp-runtime-service";
import { MCPUpdateService } from "../services/mcp/mcp-update-service";
import { MCPConfigService } from "../services/mcp/mcp-config-service";
import { ManifestRepository } from "../services/storage/manifest-repository";

interface MCPDependencies {
  catalogService: CatalogService;
  installService: MCPInstallService;
  registryService: MCPRegistryService;
  runtimeService: MCPRuntimeService;
  updateService: MCPUpdateService;
  configService: MCPConfigService;
  manifestRepository: ManifestRepository;
}

export function registerMcpIpc(deps: MCPDependencies): void {
  deps.runtimeService.on("output", (payload: MCPOutputEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("mcp:output", payload);
    });
  });

  ipcMain.handle("mcp:listInstalled", () => deps.registryService.listInstalled());
  ipcMain.handle("mcp:listCatalog", () => deps.catalogService.listCatalog());
  ipcMain.handle("mcp:install", async (_event, mcpId: string) => {
    await deps.installService.install(mcpId);
    await deps.configService.regenerateConfig();
  });
  ipcMain.handle("mcp:uninstall", async (_event, mcpId: string) => {
    await deps.installService.uninstall(mcpId);
    await deps.configService.regenerateConfig();
  });
  ipcMain.handle("mcp:enable", (_event, mcpId: string) => {
    const record = deps.manifestRepository.listInstalled().find((item) => item.id === mcpId);
    if (!record) {
      throw new Error(`MCP not installed: ${mcpId}`);
    }
    deps.manifestRepository.upsert({ ...record, enabled: true });
    return deps.configService.regenerateConfig();
  });
  ipcMain.handle("mcp:disable", (_event, mcpId: string) => {
    const record = deps.manifestRepository.listInstalled().find((item) => item.id === mcpId);
    if (!record) {
      throw new Error(`MCP not installed: ${mcpId}`);
    }
    deps.manifestRepository.upsert({ ...record, enabled: false });
    return deps.configService.regenerateConfig();
  });
  ipcMain.handle("mcp:start", (_event, mcpId: string) => deps.runtimeService.start(mcpId));
  ipcMain.handle("mcp:stop", (_event, mcpId: string) => deps.runtimeService.stop(mcpId));
  ipcMain.handle("mcp:update", async (_event, mcpId: string) => {
    await deps.updateService.update(mcpId);
    await deps.configService.regenerateConfig();
  });
}
