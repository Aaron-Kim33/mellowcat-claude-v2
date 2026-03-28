import type { AppMeta } from "./app";
import type { ShortformWorkflowConfig, TelegramControlStatus } from "./automation";
import type { AuthSession, PaymentHandoffResponse } from "./auth";
import type {
  ClaudeInstallationStatus,
  ClaudeOutputEvent,
  ClaudeSession
} from "./claude";
import type {
  AppSettings,
  AppUpdateStatus,
  YouTubeAuthStatus,
  YouTubeUploadRequest,
  YouTubeUploadResult
} from "./settings";
import type { InstalledMCPRecord, MCPCatalogItem, MCPOutputEvent } from "./mcp";

export interface MellowCatAPI {
  app: {
    getMeta: () => Promise<AppMeta>;
    openExternal: (url: string) => Promise<void>;
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
    cancelBrowserLogin: () => Promise<void>;
    loginWithToken: (token: string) => Promise<AuthSession>;
    createPaymentHandoff: (
      productId: string,
      source?: string
    ) => Promise<PaymentHandoffResponse>;
    logout: () => Promise<void>;
  };
  automation: {
    getWorkflowConfig: () => Promise<ShortformWorkflowConfig>;
    setWorkflowConfig: (
      patch: Partial<ShortformWorkflowConfig>
    ) => Promise<ShortformWorkflowConfig>;
    getTelegramStatus: () => Promise<TelegramControlStatus>;
    syncTelegram: () => Promise<TelegramControlStatus>;
    sendMockShortlist: () => Promise<TelegramControlStatus>;
    getYouTubeStatus: () => Promise<YouTubeAuthStatus>;
    connectYouTube: () => Promise<YouTubeAuthStatus>;
    disconnectYouTube: () => Promise<YouTubeAuthStatus>;
    inspectYouTubeUploadRequest: (packagePath: string) => Promise<YouTubeUploadRequest>;
    updateYouTubeUploadRequest: (
      packagePath: string,
      patch: Partial<YouTubeUploadRequest>
    ) => Promise<YouTubeUploadRequest>;
    pickYouTubeVideoFile: () => Promise<string | undefined>;
    pickYouTubeThumbnailFile: () => Promise<string | undefined>;
    uploadYouTubePackage: (packagePath: string) => Promise<YouTubeUploadResult>;
  };
}
