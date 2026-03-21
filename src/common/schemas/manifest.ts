import type { LocalManifest } from "../types/mcp";

export const createEmptyManifest = (launcherVersion: string): LocalManifest => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  launcherVersion,
  installed: []
});
