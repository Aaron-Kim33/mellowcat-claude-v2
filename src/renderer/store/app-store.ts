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
import type {
  CreateReadinessSnapshot,
  ManualInputCheckpointPayload,
  ManualCreateCheckpointPayload,
  ManualOutputCheckpointPayload,
  ManualProcessCheckpointPayload,
  WorkflowJobSnapshot
} from "@common/types/slot-workflow";

interface AppState {
  catalog: MCPCatalogItem[];
  installed: InstalledMCPRecord[];
  appMeta?: AppMeta;
  telegramStatus?: TelegramControlStatus;
  settings?: AppSettings;
  workflowConfig?: ShortformWorkflowConfig;
  workflowJobSnapshot?: WorkflowJobSnapshot;
  createReadiness?: CreateReadinessSnapshot;
  appUpdateStatus?: AppUpdateStatus;
  youTubeAuthStatus?: YouTubeAuthStatus;
  youTubeUploadRequest?: YouTubeUploadRequest;
  lastYouTubeUploadResult?: YouTubeUploadResult;
  authSession?: AuthSession;
  authBusy: boolean;
  authStatusMessage?: string;
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
  pickCreateBackgroundFile: () => Promise<string | undefined>;
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
  refreshWorkflowJobSnapshot: (jobId: string) => Promise<void>;
  refreshCreateReadiness: (jobId: string) => Promise<void>;
  runCreatePipeline: (jobId: string) => Promise<void>;
  saveManualInputCheckpoint: (payload: ManualInputCheckpointPayload) => Promise<void>;
  saveManualProcessCheckpoint: (payload: ManualProcessCheckpointPayload) => Promise<void>;
  saveManualCreateCheckpoint: (payload: ManualCreateCheckpointPayload) => Promise<void>;
  saveManualOutputCheckpoint: (payload: ManualOutputCheckpointPayload) => Promise<void>;
  refreshStoreAccess: () => Promise<void>;
  login: () => Promise<void>;
  cancelLogin: () => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  createPaymentHandoff: (productId: string, source?: string) => Promise<string>;
  sendVerificationEmail: () => Promise<{ emailSent?: boolean; verificationUrl?: string | null }>;
  changeEmail: (
    email: string
  ) => Promise<{ emailSent?: boolean; verificationUrl?: string | null }>;
  unlinkProvider: (provider: string) => Promise<string[]>;
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
  authBusy: false,
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
    const packagePath =
      useAppStore.getState().telegramStatus?.lastPackagePath ??
      useAppStore.getState().workflowJobSnapshot?.resolvedPackagePath;
    if (!packagePath) {
      set({ youTubeUploadRequest: undefined });
      return;
    }

    const youTubeUploadRequest =
      await window.mellowcat.automation.inspectYouTubeUploadRequest(packagePath);
    set({ youTubeUploadRequest });
  },
  saveYouTubeUploadRequest: async (patch: Partial<YouTubeUploadRequest>) => {
    const packagePath =
      useAppStore.getState().telegramStatus?.lastPackagePath ??
      useAppStore.getState().workflowJobSnapshot?.resolvedPackagePath;
    if (!packagePath) {
      return;
    }

    const youTubeUploadRequest =
      await window.mellowcat.automation.updateYouTubeUploadRequest(packagePath, patch);
    set({ youTubeUploadRequest });
  },
  pickCreateBackgroundFile: async () => window.mellowcat.automation.pickCreateBackgroundFile(),
  pickYouTubeVideoFile: async () => window.mellowcat.automation.pickYouTubeVideoFile(),
  pickYouTubeThumbnailFile: async () =>
    window.mellowcat.automation.pickYouTubeThumbnailFile(),
  uploadLastPackageToYouTube: async () => {
    const packagePath =
      useAppStore.getState().telegramStatus?.lastPackagePath ??
      useAppStore.getState().workflowJobSnapshot?.resolvedPackagePath;
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
    const { catalog, installed } = useAppStore.getState();
    const catalogItem = catalog.find((item) => item.id === mcpId);
    const existingRecord = installed.find((item) => item.id === mcpId);
    const optimisticRecord: InstalledMCPRecord | undefined = catalogItem
      ? {
          id: mcpId,
          version: existingRecord?.version ?? catalogItem.latestVersion,
          installState: existingRecord ? "updating" : "downloading",
          enabled: existingRecord?.enabled ?? true,
          installPath: existingRecord?.installPath ?? "",
          entrypoint: existingRecord?.entrypoint,
          installedAt: existingRecord?.installedAt,
          updatedAt: new Date().toISOString(),
          lastError: undefined,
          source: existingRecord?.source ?? {
            type: catalogItem.package?.source === "remote" ? "remote" : "bundled"
          },
          workflow: {
            ids: catalogItem.workflow?.ids ?? existingRecord?.workflow?.ids ?? []
          },
          entitlement: {
            status: catalogItem.entitlement?.status ?? existingRecord?.entitlement.status ?? "free",
            checkedAt: new Date().toISOString()
          },
          runtime: existingRecord?.runtime ?? {
            status: "stopped"
          }
        }
      : undefined;

    if (optimisticRecord) {
      set((state) => ({
        installed: [
          ...state.installed.filter((item) => item.id !== mcpId),
          optimisticRecord
        ],
        selectedMcpLogId: state.selectedMcpLogId ?? mcpId
      }));
    }

    try {
      await window.mellowcat.mcp.install(mcpId);
      const nextInstalled = await window.mellowcat.mcp.listInstalled();
      set((state) => ({
        installed: nextInstalled,
        selectedMcpLogId: state.selectedMcpLogId ?? mcpId
      }));
    } catch (error) {
      if (optimisticRecord) {
        const message = error instanceof Error ? error.message : "Install failed.";
        set((state) => ({
          installed: [
            ...state.installed.filter((item) => item.id !== mcpId),
            {
              ...optimisticRecord,
              installState: "error",
              lastError: message
            }
          ]
        }));
      }
      throw error;
    }
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
    const existingRecord = useAppStore.getState().installed.find((item) => item.id === mcpId);
    if (existingRecord) {
      set((state) => ({
        installed: state.installed.map((item) =>
          item.id === mcpId
            ? {
                ...item,
                installState: "updating",
                lastError: undefined,
                updatedAt: new Date().toISOString()
              }
            : item
        )
      }));
    }

    try {
      await window.mellowcat.mcp.update(mcpId);
      const installed = await window.mellowcat.mcp.listInstalled();
      set({ installed });
    } catch (error) {
      if (existingRecord) {
        const message = error instanceof Error ? error.message : "Update check failed.";
        set((state) => ({
          installed: state.installed.map((item) =>
            item.id === mcpId
              ? {
                  ...item,
                  installState: "error",
                  lastError: message
                }
              : item
          )
        }));
      }
      throw error;
    }
  },
  selectMcpLog: (mcpId: string) => {
    set({ selectedMcpLogId: mcpId });
  },
  saveSettings: async (patch: Partial<AppSettings>) => {
    const [settings, claudeInstallation, telegramStatus, catalog, authSession] = await Promise.all([
      window.mellowcat.settings.set(patch),
      window.mellowcat.claude.getInstallationStatus(),
      window.mellowcat.automation.getTelegramStatus(),
      window.mellowcat.mcp.listCatalog(),
      window.mellowcat.auth.getSession()
    ]);
    set({
      catalog,
      authSession,
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
  refreshWorkflowJobSnapshot: async (jobId: string) => {
    const workflowJobSnapshot = await window.mellowcat.automation.inspectWorkflowJob(jobId);
    set({ workflowJobSnapshot });
  },
  refreshCreateReadiness: async (jobId: string) => {
    const createReadiness = await window.mellowcat.automation.getCreateReadiness(jobId);
    set({ createReadiness });
  },
  runCreatePipeline: async (jobId: string) => {
    const workflowJobSnapshot = await window.mellowcat.automation.runCreatePipeline(jobId);
    const createReadiness = await window.mellowcat.automation.getCreateReadiness(jobId);
    const packagePath =
      workflowJobSnapshot.resolvedPackagePath ??
      useAppStore.getState().telegramStatus?.lastPackagePath;
    const [youTubeAuthStatus, youTubeUploadRequest] = await Promise.all([
      window.mellowcat.automation.getYouTubeStatus(),
      packagePath
        ? window.mellowcat.automation
            .inspectYouTubeUploadRequest(packagePath)
            .catch(() => undefined)
        : Promise.resolve(undefined)
    ]);
    set({
      workflowJobSnapshot,
      createReadiness,
      youTubeAuthStatus,
      youTubeUploadRequest
    });
  },
  saveManualInputCheckpoint: async (payload) => {
    const workflowJobSnapshot = await window.mellowcat.automation.saveManualInputCheckpoint(payload);
    set({ workflowJobSnapshot });
  },
  saveManualProcessCheckpoint: async (payload) => {
    const workflowJobSnapshot = await window.mellowcat.automation.saveManualProcessCheckpoint(payload);
    set({ workflowJobSnapshot });
  },
  saveManualCreateCheckpoint: async (payload) => {
    const workflowJobSnapshot = await window.mellowcat.automation.saveManualCreateCheckpoint(payload);
    set({ workflowJobSnapshot });
  },
  saveManualOutputCheckpoint: async (payload) => {
    const workflowJobSnapshot = await window.mellowcat.automation.saveManualOutputCheckpoint(payload);
    set({ workflowJobSnapshot });
  },
  refreshStoreAccess: async () => {
    const [authSession, catalog, installed] = await Promise.all([
      window.mellowcat.auth.getSession(),
      window.mellowcat.mcp.listCatalog(),
      window.mellowcat.mcp.listInstalled()
    ]);
    set({ authSession, catalog, installed });
  },
  login: async () => {
    set({ authBusy: true, authStatusMessage: "Waiting for browser sign-in..." });
    try {
      const authSession = await window.mellowcat.auth.loginWithBrowser();
      const catalog = await window.mellowcat.mcp.listCatalog();
      set({
        authSession,
        catalog,
        authBusy: false,
        authStatusMessage: undefined
      });
    } catch (error) {
      set({
        authBusy: false,
        authStatusMessage: undefined
      });
      throw error;
    }
  },
  cancelLogin: async () => {
    await window.mellowcat.auth.cancelBrowserLogin();
    set({
      authBusy: false,
      authStatusMessage: undefined
    });
  },
  loginWithToken: async (token: string) => {
    set({ authBusy: true, authStatusMessage: "Finalizing your launcher session..." });
    try {
      const authSession = await window.mellowcat.auth.loginWithToken(token);
      const catalog = await window.mellowcat.mcp.listCatalog();
      set({
        authSession,
        catalog,
        authBusy: false,
        authStatusMessage: undefined
      });
    } catch (error) {
      set({
        authBusy: false,
        authStatusMessage: undefined
      });
      throw error;
    }
  },
  createPaymentHandoff: async (productId: string, source = "launcher") => {
    const response = await window.mellowcat.auth.createPaymentHandoff(productId, source);
    return response.paymentUrl;
  },
  sendVerificationEmail: async () => {
    const response = await window.mellowcat.auth.sendVerificationEmail();
    const authSession = await window.mellowcat.auth.getSession();
    set({ authSession });
    return {
      emailSent: response.emailSent,
      verificationUrl: response.verificationUrl
    };
  },
  changeEmail: async (email: string) => {
    const response = await window.mellowcat.auth.changeEmail(email);
    const [authSession, catalog] = await Promise.all([
      window.mellowcat.auth.getSession(),
      window.mellowcat.mcp.listCatalog()
    ]);
    set({
      authSession,
      catalog
    });
    return {
      emailSent: response.emailSent,
      verificationUrl: response.verificationUrl
    };
  },
  unlinkProvider: async (provider: string) => {
    const response = await window.mellowcat.auth.unlinkProvider(provider);
    const [authSession, catalog] = await Promise.all([
      window.mellowcat.auth.getSession(),
      window.mellowcat.mcp.listCatalog()
    ]);
    set({
      authSession,
      catalog
    });
    return response.linkedProviders;
  },
  logout: async () => {
    await window.mellowcat.auth.logout();
    const [authSession, catalog] = await Promise.all([
      window.mellowcat.auth.getSession(),
      window.mellowcat.mcp.listCatalog()
    ]);
    set({
      authSession,
      catalog,
      authBusy: false,
      authStatusMessage: undefined
    });
  }
}));
