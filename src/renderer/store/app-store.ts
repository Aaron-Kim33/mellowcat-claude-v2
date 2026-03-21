import { create } from "zustand";
import type { AuthSession } from "@common/types/auth";
import type { ClaudeInstallationStatus, ClaudeSession } from "@common/types/claude";
import type { InstalledMCPRecord, MCPCatalogItem } from "@common/types/mcp";
import type { AppSettings } from "@common/types/settings";

interface AppState {
  catalog: MCPCatalogItem[];
  installed: InstalledMCPRecord[];
  settings?: AppSettings;
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
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

let unsubscribeOutput: (() => void) | undefined;
let unsubscribeMcpOutput: (() => void) | undefined;
let claudeInstallPollTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppStore = create<AppState>((set) => ({
  catalog: [],
  installed: [],
  claudeOutput: "",
  mcpOutputById: {},
  hydrate: async () => {
    const [catalog, installed, settings, authSession, claudeInstallation] = await Promise.all([
      window.mellowcat.mcp.listCatalog(),
      window.mellowcat.mcp.listInstalled(),
      window.mellowcat.settings.get(),
      window.mellowcat.auth.getSession(),
      window.mellowcat.claude.getInstallationStatus()
    ]);

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

    set({
      catalog,
      installed,
      settings,
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
    const settings = await window.mellowcat.settings.set(patch);
    const claudeInstallation = await window.mellowcat.claude.getInstallationStatus();
    set({
      settings,
      claudeInstallation,
      claudeDetectionMessage: claudeInstallation.installed
        ? `Claude detected at ${claudeInstallation.executablePath ?? "saved path"}`
        : claudeInstallation.message
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
