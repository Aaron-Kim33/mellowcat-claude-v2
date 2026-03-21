interface LogPanelProps {
  title?: string;
  output: string;
}

export function LogPanel({ title = "Output", output }: LogPanelProps) {
  return (
    <div className="terminal-panel">
      <div className="terminal-header">{title}</div>
      <pre>{output || "No output yet."}</pre>
    </div>
  );
}
