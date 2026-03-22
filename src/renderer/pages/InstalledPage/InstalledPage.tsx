import { useAppStore } from "../../store/app-store";
import { LogPanel } from "../../components/Terminal/LogPanel";
import { getLauncherCopy } from "../../lib/launcher-copy";

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
    mcpOutputById,
    settings
  } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.installed;

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
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="subtle">{copy.subtitle}</p>
        </div>
      </div>

      <div className="grid">
        {sortedInstalled.map((item) => (
          <article className="card" key={item.id}>
            <div className="card-row">
              <div>
                <h3>{item.id}</h3>
                <p className="subtle">{copy.version} {item.version}</p>
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
                <span>{copy.enabled}</span>
                <strong>{item.enabled ? "Yes" : "No"}</strong>
              </div>
              <div className="meta-item">
                <span>{copy.installPath}</span>
                <code className="meta-code">{item.installPath}</code>
              </div>
              <div className="meta-item">
                <span>{copy.entrypoint}</span>
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
                {item.enabled ? copy.disable : copy.enable}
              </button>
              <button type="button" className="danger-button" onClick={() => void uninstallMcp(item.id)}>
                {copy.remove}
              </button>
            </div>
          </article>
        ))}
      </div>

      <LogPanel
        title={copy.logsTitle}
        output={
          selectedMcpLogId
            ? selectedOutput || copy.noLogs(selectedMcpLogId)
            : copy.selectLogs
        }
      />
    </section>
  );
}
