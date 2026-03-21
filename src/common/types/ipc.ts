import type { AppMeta } from "./app";
import type { AuthSession } from "./auth";
import type {
  ClaudeInstallationStatus,
  ClaudeOutputEvent,
  ClaudeSession
} from "./claude";
import type { AppSettings, AppUpdateStatus } from "./settings";
import type { InstalledMCPRecord, MCPCatalogItem, MCPOutputEvent } from "./mcp";

export interface MellowCatAPI {
  app: {
    getMeta: () => Promise<AppMeta>;
  };
  claude: {
    startSession: (profileId?: string) => Promise<ClaudeSession>;
    stopSession: (sessionId: string) => Promise<void>;
    sendInput: (sessionId: string, input: string) => Promise<void>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
    getInstallationStatus: () => Promise<ClaudeInstallationStatus>;
    detectInstallation: () => Promise<ClaudeInstallationStatus>;
    installClaudeCode: () => Promise<ClaudeInstallationStatus>;
    onOutput: (callback: (event: ClaudeOutputEvent) => void) => () => void;
  };
  mcp: {
    listInstalled: () => Promise<InstalledMCPRecord[]>;
    listCatalog: () => Promise<MCPCatalogItem[]>;
    install: (mcpId: string) => Promise<void>;
    uninstall: (mcpId: string) => Promise<void>;
    enable: (mcpId: string) => Promise<void>;
    disable: (mcpId: string) => Promise<void>;
    start: (mcpId: string) => Promise<void>;
    stop: (mcpId: string) => Promise<void>;
    update: (mcpId: string) => Promise<void>;
    onOutput: (callback: (event: MCPOutputEvent) => void) => () => void;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>;
    getUpdateStatus: () => Promise<AppUpdateStatus>;
    onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => () => void;
  };
  auth: {
    getSession: () => Promise<AuthSession>;
    loginWithBrowser: () => Promise<AuthSession>;
    logout: () => Promise<void>;
  };
}
