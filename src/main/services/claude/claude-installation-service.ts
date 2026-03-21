import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { ClaudeInstallationStatus } from "../../../common/types/claude";
import { SettingsRepository } from "../storage/settings-repository";

export class ClaudeInstallationService {
  private installInProgress = false;
  private installStartedAt?: number;

  constructor(private readonly settingsRepository: SettingsRepository) {}

  getStatus(): ClaudeInstallationStatus {
    const settingsPath = this.settingsRepository.get().claudeExecutablePath;
    const npmAvailable = this.hasCommand(process.platform === "win32" ? "npm.cmd" : "npm");

    if (settingsPath && fs.existsSync(settingsPath)) {
      return {
        installed: true,
        executablePath: settingsPath,
        source: "settings",
        npmAvailable,
        canAutoInstall: npmAvailable,
        installInProgress: this.installInProgress,
        manualInstallCommand: "npm install -g @anthropic-ai/claude-code",
        manualInstallUrl: "https://docs.anthropic.com/en/docs/claude-code"
      };
    }

    const detectedPath = this.detectFromPath();
    if (detectedPath) {
      return {
        installed: true,
        executablePath: detectedPath,
        source: "path",
        npmAvailable,
        canAutoInstall: npmAvailable,
        installInProgress: this.installInProgress,
        manualInstallCommand: "npm install -g @anthropic-ai/claude-code",
        manualInstallUrl: "https://docs.anthropic.com/en/docs/claude-code"
      };
    }

    const commonPath = this.detectFromCommonPaths();
    if (commonPath) {
      return {
        installed: true,
        executablePath: commonPath,
        source: "common_path",
        npmAvailable,
        canAutoInstall: npmAvailable,
        installInProgress: this.installInProgress,
        manualInstallCommand: "npm install -g @anthropic-ai/claude-code",
        manualInstallUrl: "https://docs.anthropic.com/en/docs/claude-code"
      };
    }

    return {
      installed: false,
      source: "not_found",
      npmAvailable,
      canAutoInstall: npmAvailable,
      installInProgress: this.installInProgress,
      message: npmAvailable
        ? "Claude Code was not detected. You can auto-install it."
        : "Claude Code was not detected and npm is unavailable, so manual install is required.",
      manualInstallCommand: "npm install -g @anthropic-ai/claude-code",
      manualInstallUrl: "https://docs.anthropic.com/en/docs/claude-code"
    };
  }

  detectAndPersist(): ClaudeInstallationStatus {
    const status = this.getStatus();
    if (status.installed && status.executablePath) {
      this.installInProgress = false;
      this.installStartedAt = undefined;
      this.settingsRepository.set({
        claudeExecutablePath: status.executablePath
      });
    }

    return this.getStatus();
  }

  installClaudeCode(): ClaudeInstallationStatus {
    const existing = this.detectAndPersist();
    if (existing.installed) {
      return existing;
    }

    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const npmAvailable = this.hasCommand(npmCommand);

    if (!npmAvailable) {
      return {
        installed: false,
        source: "not_found",
        npmAvailable: false,
        canAutoInstall: false,
        installInProgress: false,
        message: "npm is not available, so automatic Claude installation cannot start."
      };
    }

    this.installInProgress = true;
    this.installStartedAt = Date.now();
    const child = spawn(npmCommand, ["install", "-g", "@anthropic-ai/claude-code"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();

    return {
      installed: false,
      source: "not_found",
      npmAvailable: true,
      canAutoInstall: true,
      installInProgress: true,
      message: "Claude Code installation started in the background. The launcher will keep checking automatically.",
      manualInstallCommand: "npm install -g @anthropic-ai/claude-code",
      manualInstallUrl: "https://docs.anthropic.com/en/docs/claude-code"
    };
  }

  private detectFromPath(): string | undefined {
    const whereCommand = process.platform === "win32" ? "where.exe" : "which";
    const target = process.platform === "win32" ? "claude" : "claude";
    const result = spawnSync(whereCommand, [target], {
      encoding: "utf-8",
      windowsHide: true
    });

    if (result.status !== 0 || !result.stdout) {
      return undefined;
    }

    const candidates = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return candidates.find((candidate) => fs.existsSync(candidate));
  }

  private detectFromCommonPaths(): string | undefined {
    const userProfile = process.env.USERPROFILE ?? "";
    const appData = process.env.APPDATA ?? "";

    const candidates = [
      path.join(userProfile, ".local", "bin", "claude.exe"),
      path.join(appData, "npm", "claude.cmd"),
      path.join(appData, "npm", "claude.exe")
    ];

    return candidates.find((candidate) => candidate && fs.existsSync(candidate));
  }

  private hasCommand(command: string): boolean {
    const result = spawnSync(command, ["--version"], {
      encoding: "utf-8",
      windowsHide: true
    });
    return result.status === 0;
  }
}
