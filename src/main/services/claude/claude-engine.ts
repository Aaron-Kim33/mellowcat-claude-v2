import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { ClaudeSession } from "../../../common/types/claude";
import type { ClaudeOutputEvent } from "../../../common/types/claude";
import { SettingsRepository } from "../storage/settings-repository";
import { PathService } from "../system/path-service";
import { IPty, spawn } from "node-pty";

interface ClaudeRuntime {
  session: ClaudeSession;
  pty: IPty;
}

export class ClaudeEngine extends EventEmitter {
  private readonly sessions = new Map<string, ClaudeSession>();
  private readonly runtimes = new Map<string, ClaudeRuntime>();

  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly pathService: PathService
  ) {
    super();
  }

  startSession(profileId?: string): ClaudeSession {
    const runtimeCommand = this.resolveRuntimeCommand();
    const session: ClaudeSession = {
      id: randomUUID(),
      profileId,
      status: "starting",
      startedAt: new Date().toISOString(),
      lastOutput: `Launching ${runtimeCommand.transport} Claude runtime...`,
      transport: runtimeCommand.transport
    };

    this.sessions.set(session.id, session);
    this.emitOutput({
      sessionId: session.id,
      chunk: `${session.lastOutput}\r\n`,
      timestamp: new Date().toISOString()
    });
    const pty = spawn(runtimeCommand.command, runtimeCommand.args, {
      name: "xterm-color",
      cols: 120,
      rows: 32,
      cwd: process.cwd(),
      env: process.env as Record<string, string>
    });

    pty.onData((chunk) => {
      this.emitOutput({
        sessionId: session.id,
        chunk,
        timestamp: new Date().toISOString()
      });
    });

    pty.onExit(() => {
      const current = this.sessions.get(session.id);
      if (!current) {
        return;
      }

      this.sessions.set(session.id, {
        ...current,
        status: "stopped",
        stoppedAt: new Date().toISOString()
      });
      this.runtimes.delete(session.id);
    });

    this.sessions.set(session.id, {
      ...session,
      status: "running"
    });
    this.emitOutput({
      sessionId: session.id,
      chunk: `[launcher] Claude PTY started\r\n`,
      timestamp: new Date().toISOString()
    });

    this.runtimes.set(session.id, {
      session,
      pty
    });

    return session;
  }

  stopSession(sessionId: string): void {
    const runtime = this.runtimes.get(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session || !runtime) {
      return;
    }

    runtime.pty.kill();
    const nextSession: ClaudeSession = {
      ...session,
      status: "stopped",
      stoppedAt: new Date().toISOString()
    };
    this.sessions.set(sessionId, nextSession);
  }

  sendInput(sessionId: string, input: string): void {
    const runtime = this.runtimes.get(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session || !runtime) {
      throw new Error(`Claude session not found: ${sessionId}`);
    }

    runtime.pty.write(input);
    const nextSession: ClaudeSession = {
      ...session,
      lastOutput: input
    };
    this.sessions.set(sessionId, nextSession);
  }

  resizeSession(sessionId: string, cols: number, rows: number): void {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      return;
    }

    runtime.pty.resize(cols, rows);
  }

  private resolveRuntimeCommand(): {
    command: string;
    args: string[];
    transport: "mock" | "custom";
  } {
    const settings = this.settingsRepository.get();
    if (settings.claudeExecutablePath) {
      return {
        command: settings.claudeExecutablePath,
        args: settings.claudeArgs ?? [],
        transport: "custom"
      };
    }

    return {
      command: process.execPath,
      args: [this.pathService.getBundledToolPath("mock-claude.js")],
      transport: "mock"
    };
  }

  private emitOutput(payload: ClaudeOutputEvent): void {
    const session = this.sessions.get(payload.sessionId);
    if (session) {
      this.sessions.set(payload.sessionId, {
        ...session,
        lastOutput: payload.chunk
      });
    }
    this.emit("output", payload);
  }
}
