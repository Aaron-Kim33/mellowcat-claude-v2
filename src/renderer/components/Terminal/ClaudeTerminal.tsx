import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";

interface ClaudeTerminalProps {
  sessionId?: string;
}

export function ClaudeTerminal({ sessionId }: ClaudeTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | undefined>(sessionId);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (!hostRef.current || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: 14,
      theme: {
        background: "#10151d",
        foreground: "#f5f7fb"
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    fitAddon.fit();

    const handleResize = () => {
      fitAddon.fit();
      if (sessionIdRef.current) {
        void window.mellowcat.claude.resize(
          sessionIdRef.current,
          terminal.cols,
          terminal.rows
        );
      }
    };

    terminal.onData((data) => {
      if (sessionIdRef.current) {
        void window.mellowcat.claude.sendInput(sessionIdRef.current, data);
      }
    });

    window.addEventListener("resize", handleResize);
    terminal.focus();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      window.removeEventListener("resize", handleResize);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.clear();
    terminal.focus();

    if (sessionId && fitAddonRef.current) {
      fitAddonRef.current.fit();
      void window.mellowcat.claude.resize(sessionId, terminal.cols, terminal.rows);
    }
  }, [sessionId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    return window.mellowcat.claude.onOutput((event) => {
      if (sessionIdRef.current && event.sessionId === sessionIdRef.current) {
        terminal.write(event.chunk);
      }
    });
  }, []);

  return (
    <div className="terminal-panel">
      <div className="terminal-header">Claude Terminal</div>
      <div ref={hostRef} className="xterm-host" />
    </div>
  );
}
