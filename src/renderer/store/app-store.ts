import { create } from "zustand";
import type { AppMeta } from "@common/types/app";
import type {
  ShortformWorkflowConfig,
  TelegramControlStatus
} from "@common/types/automation";
import type { AuthSession } from "@common/types/auth";
import type { ClaudeInstallationStatus, ClaudeSession } from "@common/types/claude";
import type { InstalledMCPRecord, MCPCatalogItem } from "@common/types/mcp";
import type {
  AppSettings,
  AppUpdateStatus,
  YouTubeAuthStatus,
  YouTubeUploadRequest,
  YouTubeUploadResult
} from "@common/types/settings";

interface AppState {
  catalog: MCPCatalogItem[];
  installed: InstalledMCPRecord[];
  appMeta?: AppMeta;
  telegramStatus?: TelegramControlStatus;
  settings?: AppSettings;
  workflowConfig?: ShortformWorkflowConfig;
  appUpdateStatus?: AppUpdateStatus;
  youTubeAuthStatus?: YouTubeAuthStatus;
  youTubeUploadRequest?: YouTubeUploadRequest;
  lastYouTubeUploadResult?: YouTubeUploadResult;
  authSession?: AuthSession;
  claudeSession?: ClaudeSession;
  claudeInstallation?: ClaudeInstallationStatus;
  claudeDetectionMessage?: string;
  claudeOutput: string;
  mcpOutputById: Record<string, string>;
  selectedMcpLogId?: string;
  hydrate: () => Promise<void>;
  startClaude: () => Promise<void>;
  stopClaude: (sessionId: string) => Promise<void>;
  resetClaudeSession: () => void;
  refreshClaudeInstallation: () => Promise<void>;
  detectClaudeInstallation: () => Promise<void>;
  installClaudeCode: () => Promise<void>;
  refreshTelegramStatus: () => Promise<void>;
  sendMockShortlist: () => Promise<void>;
  refreshYouTubeStatus: () => Promise<void>;
  connectYouTube: () => Promise<void>;
  disconnectYouTube: () => Promise<void>;
  refreshYouTubeUploadRequest: () => Promise<void>;
  saveYouTubeUploadRequest: (patch: Partial<YouTubeUploadRequest>) => Promise<void>;
  pickYouTubeVideoFile: () => Promise<string | undefined>;
  pickYouTubeThumbnailFile: () => Promise<string | undefined>;
  uploadLastPackageToYouTube: () => Promise<void>;
  sendClaudeInput: (sessionId: string, input: string) => Promise<void>;
  installMcp: (mcpId: string) => Promise<void>;
  uninstallMcp: (mcpId: string) => Promise<void>;
  enableMcp: (mcpId: string) => Promise<void>;
  disableMcp: (mcpId: string) => Promise<void>;
  startMcp: (mcpId: string) => Promise<void>;
  stopMcp: (mcpId: string) => Promise<void>;
  updateMcp: (mcpId: string) => Promise<void>;
  selectMcpLog: (mcpId: string) => void;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  saveWorkflowConfig: (patch: Partial<ShortformWorkflowConfig>) => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

let unsubscribeOutput: (() => void) | undefined;
let unsubscribeMcpOutput: (() => void) | undefined;
let unsubscribeUpdateStatus: (() => void) | undefined;
let claudeInstallPollTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppStore = create<AppState>((set) => ({
  catalog: [],
  installed: [],
  claudeOutput: "",
  mcpOutputById: {},
  hydrate: async () => {
    const [catalog, installed, appMeta, settings, workflowConfig, authSession, claudeInstallation, appUpdateStatus, telegramStatus, youTubeAuthStatus] =
      await Promise.all([
      window.mellowcat.mcp.listCatalog(),
      window.mellowcat.mcp.listInstalled(),
      window.mellowcat.app.getMeta(),
      window.mellowcat.settings.get(),
      window.mellowcat.automation.getWorkflowConfig(),
      window.mellowcat.auth.getSession(),
      window.mellowcat.claude.getInstallationStatus(),
      window.mellowcat.settings.getUpdateStatus(),
      window.mellowcat.automation.getTelegramStatus(),
      window.mellowcat.automation.getYouTubeStatus()
    ]);
    const youTubeUploadRequest = telegramStatus.lastPackagePath
      ? await window.mellowcat.automation
          .inspectYouTubeUploadRequest(telegramStatus.lastPackagePath)
          .catch(() => undefined)
      : undefined;

    if (!unsubscribeOutput) {
      unsubscribeOutput = window.mellowcat.claude.onOutput((event) => {
        set((state) => ({
          claudeOutput: state.claudeOutput
            ? `${state.claudeOutput}\n${event.chunk}`
            : event.chunk
        }));
      });
    }

    if (!unsubscribeMcpOutput) {
      unsubscribeMcpOutput = window.mellowcat.mcp.onOutput((event) => {
        set((state) => ({
          mcpOutputById: {
            ...state.mcpOutputById,
            [event.mcpId]: state.mcpOutputById[event.mcpId]
              ? `${state.mcpOutputById[event.mcpId]}\n${event.chunk}`
              : event.chunk
          }
        }));
      });
    }

    if (!unsubscribeUpdateStatus) {
      unsubscribeUpdateStatus = window.mellowcat.settings.onUpdateStatus((status) => {
        set({ appUpdateStatus: status });
      });
    }

    set({
      catalog,
      installed,
      appMeta,
      settings,
      workflowConfig,
      appUpdateStatus,
      telegramStatus,
      youTubeAuthStatus,
      youTubeUploadRequest,
      authSession,
      claudeInstallation,
      claudeDetectionMessage: claudeInstallation.installed
        ? `Claude detected at ${claudeInstallation.executablePath ?? "saved path"}`
        : claudeInstallation.message,
      selectedMcpLogId: installed[0]?.id
    });
  },
  startClaude: async () => {
    const claudeSession = await window.mellowcat.claude.startSession();
    set({
      claudeSession,
      claudeOutput: claudeSession.lastOutput ?? ""
    });
  },
  stopClaude: async (sessionId: string) => {
    await window.mellowcat.claude.stopSession(sessionId);
    set((state) => ({
      claudeSession: state.claudeSession
        ? { ...state.claudeSession, status: "stopped" }
        : undefined
    }));
  },
  resetClaudeSession: () => {
    set({
      claudeSession: undefined,
      claudeOutput: ""
    });
  },
  refreshClaudeInstallation: async () => {
    const [claudeInstallation, settings] = await Promise.all([
      window.mellowcat.claude.getInstallationStatus(),
      window.mellowcat.settings.get()
    ]);
    set({
      claudeInstallation,
      settings,
      claudeDetectionMessage: claudeInstallation.installed
        ? `Claude detected at ${claudeInstallation.executablePath ?? "saved path"}`
        : claudeInstallation.message
    });
    if (claudeInstallation.installInProgress) {
      if (claudeInstallPollTimer) {
        clearTimeout(claudeInstallPollTimer);
      }
      claudeInstallPollTimer = setTimeout(() => {
        void useAppStore.getState().detectClaudeInstallation();
      }, 4000);
    }
  },
  detectClaudeInstallation: async () => {
    const claudeInstallation = await window.mellowcat.claude.detectInstallation();
    const settings = await window.mellowcat.settings.get();
    set({
      claudeInstallation,
      settings,
      claudeDetectionMessage: claudeInstallation.installed
        ? `Claude detected at ${claudeInstallation.executablePath ?? "saved path"}`
        : claudeInstallation.message ?? "Claude was not detected."
    });
    if (claudeInstallation.installInProgress || !claudeInstallation.installed) {
      if (claudeInstallPollTimer) {
        clearTimeout(claudeInstallPollTimer);
      }
      if (claudeInstallation.installInProgress) {
        claudeInstallPollTimer = setTimeout(() => {
          void useAppStore.getState().detectClaudeInstallation();
        }, 4000);
      }
    }
  },
  installClaudeCode: async () => {
    const claudeInstallation = await window.mellowcat.claude.installClaudeCode();
    set({
      claudeInstallation,
      claudeDetectionMessage:
        claudeInstallation.message ?? "Claude installation task started."
    });
    if (claudeInstallPollTimer) {
      clearTimeout(claudeInstallPollTimer);
    }
    if (claudeInstallation.installInProgress) {
      claudeInstallPollTimer = setTimeout(() => {
        void useAppStore.getState().detectClaudeInstallation();
      }, 4000);
    }
  },
  refreshTelegramStatus: async () => {
    await window.mellowcat.automation.syncTelegram();
    const telegramStatus = await window.mellowcat.automation.getTelegramStatus();
    const youTubeUploadRequest = telegramStatus.lastPackagePath
      ? await window.mellowcat.automation
          .inspectYouTubeUploadRequest(telegramStatus.lastPackagePath)
          .catch(() => undefined)
      : undefined;
    set({ telegramStatus, youTubeUploadRequest });
  },
  sendMockShortlist: async () => {
    const telegramStatus = await window.mellowcat.automation.sendMockShortlist();
    set({ telegramStatus });
  },
  refreshYouTubeStatus: async () => {
    const youTubeAuthStatus = await window.mellowcat.automation.getYouTubeStatus();
    set({ youTubeAuthStatus });
  },
  connectYouTube: async () => {
    const youTubeAuthStatus = await window.mellowcat.automation.connectYouTube();
    set({ youTubeAuthStatus });
  },
  disconnectYouTube: async () => {
    const youTubeAuthStatus = await window.mellowcat.automation.disconnectYouTube();
    set({ youTubeAuthStatus });
  },
  refreshYouTubeUploadRequest: async () => {
    const packagePath = useAppStore.getState().telegramStatus?.lastPackagePath;
    if (!packagePath) {
      set({ youTubeUploadRequest: undefined });
      return;
    }

    const youTubeUploadRequest =
      await window.mellowcat.automation.inspectYouTubeUploadRequest(packagePath);
    set({ youTubeUploadRequest });
  },
  saveYouTubeUploadRequest: async (patch: Partial<YouTubeUploadRequest>) => {
    const packagePath = useAppStore.getState().telegramStatus?.lastPackagePath;
    if (!packagePath) {
      return;
    }

    const youTubeUploadRequest =
      await window.mellowcat.automation.updateYouTubeUploadRequest(packagePath, patch);
    set({ youTubeUploadRequest });
  },
  pickYouTubeVideoFile: async () => window.mellowcat.automation.pickYouTubeVideoFile(),
  pickYouTubeThumbnailFile: async () =>
    window.mellowcat.automation.pickYouTubeThumbnailFile(),
  uploadLastPackageToYouTube: async () => {
    const packagePath = useAppStore.getState().telegramStatus?.lastPackagePath;
    if (!packagePath) {
      return;
    }

    const lastYouTubeUploadResult = await window.mellowcat.automation.uploadYouTubePackage(packagePath);
    const youTubeAuthStatus = await window.mellowcat.automation.getYouTubeStatus();
    const youTubeUploadRequest =
      await window.mellowcat.automation.inspectYouTubeUploadRequest(packagePath);
    set({ lastYouTubeUploadResult, youTubeAuthStatus, youTubeUploadRequest });
  },
  sendClaudeInput: async (sessionId: string, input: string) => {
    await window.mellowcat.claude.sendInput(sessionId, input);
  },
  installMcp: async (mcpId: string) => {
    await window.mellowcat.mcp.install(mcpId);
    const installed = await window.mellowcat.mcp.listInstalled();
    set((state) => ({
      installed,
      selectedMcpLogId: state.selectedMcpLogId ?? mcpId
    }));
  },
  uninstallMcp: async (mcpId: string) => {
    await window.mellowcat.mcp.uninstall(mcpId);
    const installed = await window.mellowcat.mcp.listInstalled();
    set((state) => {
      const nextSelectedId =
        state.selectedMcpLogId === mcpId ? installed[0]?.id : state.selectedMcpLogId;
      const nextOutput = { ...state.mcpOutputById };
      delete nextOutput[mcpId];

      return {
        installed,
        selectedMcpLogId: nextSelectedId,
        mcpOutputById: nextOutput
      };
    });
  },
  enableMcp: async (mcpId: string) => {
    await window.mellowcat.mcp.enable(mcpId);
    const installed = await window.mellowcat.mcp.listInstalled();
    set({ installed });
  },
  disableMcp: async (mcpId: string) => {
    await window.mellowcat.mcp.disable(mcpId);
    const installed = await window.mellowcat.mcp.listInstalled();
    set({ installed });
  },
  startMcp: async (mcpId: string) => {
    await window.mellowcat.mcp.start(mcpId);
    const installed = await window.mellowcat.mcp.listInstalled();
    set({ installed, selectedMcpLogId: mcpId });
  },
  stopMcp: async (mcpId: string) => {
    await window.mellowcat.mcp.stop(mcpId);
    const installed = await window.mellowcat.mcp.listInstalled();
    set({ installed });
  },
  updateMcp: async (mcpId: string) => {
    await window.mellowcat.mcp.update(mcpId);
    const installed = await window.mellowcat.mcp.listInstalled();
    set({ installed });
  },
  selectMcpLog: (mcpId: string) => {
    set({ selectedMcpLogId: mcpId });
  },
  saveSettings: async (patch: Partial<AppSettings>) => {
    const [settings, claudeInstallation, telegramStatus] = await Promise.all([
      window.mellowcat.settings.set(patch),
      window.mellowcat.claude.getInstallationStatus(),
      window.mellowcat.automation.getTelegramStatus()
    ]);
    set({
      settings,
      telegramStatus,
      claudeInstallation,
      claudeDetectionMessage: claudeInstallation.installed
        ? `Claude detected at ${claudeInstallation.executablePath ?? "saved path"}`
        : claudeInstallation.message
    });
  },
  saveWorkflowConfig: async (patch: Partial<ShortformWorkflowConfig>) => {
    const [workflowConfig, telegramStatus, youTubeAuthStatus] = await Promise.all([
      window.mellowcat.automation.setWorkflowConfig(patch),
      window.mellowcat.automation.getTelegramStatus(),
      window.mellowcat.automation.getYouTubeStatus()
    ]);

    const packagePath = telegramStatus.lastPackagePath;
    const youTubeUploadRequest = packagePath
      ? await window.mellowcat.automation.inspectYouTubeUploadRequest(packagePath).catch(() => undefined)
      : undefined;

    set({
      workflowConfig,
      telegramStatus,
      youTubeAuthStatus,
      youTubeUploadRequest
    });
  },
  login: async () => {
    const authSession = await window.mellowcat.auth.loginWithBrowser();
    set({ authSession });
  },
  logout: async () => {
    await window.mellowcat.auth.logout();
    const authSession = await window.mellowcat.auth.getSession();
    set({ authSession });
  }
}));
