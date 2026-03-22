import { useAppStore } from "../../store/app-store";
import { getLauncherCopy } from "../../lib/launcher-copy";

export function AboutPage() {
  const { appMeta, settings } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.about;

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="subtle">{copy.subtitle}</p>
        </div>
      </div>

      <div className="card">
        <div className="meta-list">
          <div className="meta-item">
            <span>{copy.appVersion}</span>
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
