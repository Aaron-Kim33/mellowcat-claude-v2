import { useAppStore } from "../../store/app-store";
import { LogPanel } from "../../components/Terminal/LogPanel";

export function InstalledPage() {
  const {
    installed,
    enableMcp,
    disableMcp,
    startMcp,
    stopMcp,
    uninstallMcp,
    selectedMcpLogId,
    selectMcpLog,
    mcpOutputById
  } = useAppStore();

  const selectedOutput = selectedMcpLogId ? mcpOutputById[selectedMcpLogId] ?? "" : "";
  const sortedInstalled = [...installed].sort((left, right) => {
    const leftScore =
      (left.runtime.status === "running" ? 20 : 0) +
      (left.enabled ? 10 : 0);
    const rightScore =
      (right.runtime.status === "running" ? 20 : 0) +
      (right.enabled ? 10 : 0);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return left.id.localeCompare(right.id);
  });

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">Installed</p>
          <h2>Local MCP registry</h2>
          <p className="subtle">Installed MCPs are tracked locally so the app can later sync account entitlements without changing the core model.</p>
        </div>
      </div>

      <div className="grid">
        {sortedInstalled.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-row">
              <div>
                <h3>{item.id}</h3>
                <p className="subtle">Version {item.version}</p>
              </div>
              <button
                type="button"
                className={selectedMcpLogId === item.id ? "pill-button active" : "pill-button"}
                onClick={() => selectMcpLog(item.id)}
              >
                {item.runtime.status}
              </button>
            </div>
            <div className="meta-list">
              <div className="meta-item">
                <span>Enabled</span>
                <strong>{item.enabled ? "Yes" : "No"}</strong>
              </div>
              <div className="meta-item">
                <span>Install Path</span>
                <code className="meta-code">{item.installPath}</code>
              </div>
              <div className="meta-item">
                <span>Entrypoint</span>
                <code className="meta-code">{item.entrypoint ?? "-"}</code>
              </div>
            </div>
            <div className="button-row">
              <button
                type="button"
                className={item.runtime.status === "running" ? "secondary-button" : "primary-button"}
                onClick={() => void startMcp(item.id)}
              >
                Start
              </button>
              <button type="button" className="secondary-button" onClick={() => void stopMcp(item.id)}>
                Stop
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void (item.enabled ? disableMcp(item.id) : enableMcp(item.id))}
              >
                {item.enabled ? "Disable" : "Enable"}
              </button>
              <button type="button" className="danger-button" onClick={() => void uninstallMcp(item.id)}>
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>

      <LogPanel
        title="MCP Logs"
        output={
          selectedMcpLogId
            ? selectedOutput || `No logs yet for ${selectedMcpLogId}.`
            : "Select an installed MCP to inspect its runtime logs."
        }
      />
    </section>
  );
}
