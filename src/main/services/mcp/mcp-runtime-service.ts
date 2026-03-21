import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import type { MCPOutputEvent } from "../../../common/types/mcp";
import { ManifestRepository } from "../storage/manifest-repository";

interface MCPRuntimeHandle {
  mcpId: string;
  process: ChildProcessWithoutNullStreams;
}

export class MCPRuntimeService extends EventEmitter {
  private readonly runtimes = new Map<string, MCPRuntimeHandle>();

  constructor(private readonly manifestRepository: ManifestRepository) {
    super();
  }

  async start(mcpId: string): Promise<void> {
    const record = this.manifestRepository.listInstalled().find((item) => item.id === mcpId);
    if (!record) {
      throw new Error(`MCP not installed: ${mcpId}`);
    }

    if (this.runtimes.has(mcpId)) {
      this.emitOutput({
        mcpId,
        chunk: `[launcher] ${mcpId} is already running`,
        timestamp: new Date().toISOString(),
        stream: "system"
      });
      return;
    }

    if (!record.entrypoint) {
      throw new Error(`MCP entrypoint missing: ${mcpId}`);
    }

    const entrypoint = path.join(record.installPath, record.entrypoint);
    const child = spawn(process.execPath, [entrypoint], {
      stdio: "pipe",
      windowsHide: true
    });

    this.manifestRepository.upsert({
      ...record,
      runtime: {
        ...record.runtime,
        status: "starting",
        pid: child.pid
      },
      lastLaunchedAt: new Date().toISOString()
    });

    child.stdout.on("data", (chunk: Buffer) => {
      this.emitOutput({
        mcpId,
        chunk: chunk.toString(),
        timestamp: new Date().toISOString(),
        stream: "stdout"
      });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      this.emitOutput({
        mcpId,
        chunk: chunk.toString(),
        timestamp: new Date().toISOString(),
        stream: "stderr"
      });
    });

    child.on("spawn", () => {
      const current = this.manifestRepository.listInstalled().find((item) => item.id === mcpId);
      if (!current) {
        return;
      }

      this.manifestRepository.upsert({
        ...current,
        runtime: {
          ...current.runtime,
          status: "running",
          pid: child.pid
        }
      });

      this.emitOutput({
        mcpId,
        chunk: `[launcher] ${mcpId} started`,
        timestamp: new Date().toISOString(),
        stream: "system"
      });
    });

    child.on("exit", (code) => {
      const current = this.manifestRepository.listInstalled().find((item) => item.id === mcpId);
      if (current) {
        this.manifestRepository.upsert({
          ...current,
          runtime: {
            status: "stopped"
          }
        });
      }

      this.emitOutput({
        mcpId,
        chunk: `[launcher] ${mcpId} exited${code === null ? "" : ` with code ${code}`}`,
        timestamp: new Date().toISOString(),
        stream: "system"
      });
      this.runtimes.delete(mcpId);
    });

    child.on("error", (error) => {
      const current = this.manifestRepository.listInstalled().find((item) => item.id === mcpId);
      if (current) {
        this.manifestRepository.upsert({
          ...current,
          lastError: error.message,
          runtime: {
            status: "errored"
          }
        });
      }

      this.emitOutput({
        mcpId,
        chunk: `[launcher] ${error.message}`,
        timestamp: new Date().toISOString(),
        stream: "system"
      });
      this.runtimes.delete(mcpId);
    });

    this.runtimes.set(mcpId, {
      mcpId,
      process: child
    });
  }

  async stop(mcpId: string): Promise<void> {
    const runtime = this.runtimes.get(mcpId);
    const record = this.manifestRepository.listInstalled().find((item) => item.id === mcpId);
    if (!record) {
      throw new Error(`MCP not installed: ${mcpId}`);
    }

    if (!runtime) {
      this.manifestRepository.upsert({
        ...record,
        runtime: {
          status: "stopped"
        }
      });
      return;
    }

    runtime.process.kill();

    this.manifestRepository.upsert({
      ...record,
      runtime: {
        status: "stopped"
      }
    });
    this.runtimes.delete(mcpId);
    this.emitOutput({
      mcpId,
      chunk: `[launcher] ${mcpId} stop requested`,
      timestamp: new Date().toISOString(),
      stream: "system"
    });
  }

  private emitOutput(payload: MCPOutputEvent): void {
    this.emit("output", payload);
  }
}
