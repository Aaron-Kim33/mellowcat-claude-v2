import { useAppStore } from "../../store/app-store";

export function AboutPage() {
  const { appMeta } = useAppStore();

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">About</p>
          <h2>MellowCat Claude</h2>
          <p className="subtle">Desktop launcher for Claude Code and MCP workflows.</p>
        </div>
      </div>

      <div className="card">
        <div className="meta-list">
          <div className="meta-item">
            <span>App Version</span>
            <strong>{appMeta?.version ?? "-"}</strong>
          </div>
          <div className="meta-item">
            <span>Electron</span>
            <strong>{appMeta?.electronVersion ?? "-"}</strong>
          </div>
          <div className="meta-item">
            <span>Chrome</span>
            <strong>{appMeta?.chromeVersion ?? "-"}</strong>
          </div>
          <div className="meta-item">
            <span>Node.js</span>
            <strong>{appMeta?.nodeVersion ?? "-"}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
