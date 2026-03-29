import type {
  WorkflowActionSchema,
  WorkflowFieldSchema,
  WorkflowStatusSchema,
  WorkflowUISchema
} from "../../lib/workflow-ui-schema";
import { useAppStore } from "../../store/app-store";

interface FieldBinding {
  value: string;
  onChange: (value: string) => void;
  visible?: boolean;
  onToggleVisibility?: () => void;
}

interface ActionBinding {
  onClick: () => void;
  disabled?: boolean;
}

interface StatusBinding {
  value: string;
  tone?: "default" | "warning";
  href?: string;
  linkLabel?: string;
}

interface WorkflowConfigRendererProps {
  schema: WorkflowUISchema;
  fields: Record<string, FieldBinding>;
  actions: Record<string, ActionBinding>;
  statuses: Record<string, StatusBinding>;
}

function isVisible(field: WorkflowFieldSchema, fields: Record<string, FieldBinding>) {
  if (!field.showWhen) {
    return true;
  }

  return fields[field.showWhen.fieldId]?.value === field.showWhen.equals;
}

function renderActionClass(action: WorkflowActionSchema) {
  switch (action.tone) {
    case "youtube":
      return "primary-button youtube";
    case "telegram":
      return "secondary-button telegram-soft";
    case "danger":
      return "danger-button";
    case "secondary":
      return "secondary-button";
    default:
      return "primary-button";
  }
}

function renderStatusTone(_status: WorkflowStatusSchema, binding?: StatusBinding) {
  if (binding?.tone === "warning") {
    return "warning-text";
  }

  return undefined;
}

export function WorkflowConfigRenderer({
  schema,
  fields,
  actions,
  statuses
}: WorkflowConfigRendererProps) {
  const launcherLanguage = useAppStore((state) => state.settings?.launcherLanguage);
  const isKorean = launcherLanguage === "ko";
  const renderActions = (section: WorkflowUISchema["sections"][number]) =>
    section.actions ? (
      <div className="button-row">
        {section.actions.map((action) => {
          const binding = actions[action.id];
          if (!binding) {
            return null;
          }

          return (
            <button
              key={action.id}
              type="button"
              className={renderActionClass(action)}
              onClick={binding.onClick}
              disabled={binding.disabled}
            >
              {action.label}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div className="workflow-config-layout">
      {schema.sections.map((section) => (
        <section className="workflow-config-section" key={section.id}>
          <div className="workflow-section-header">
            <p className="eyebrow">{section.eyebrow}</p>
            <h4>{section.title}</h4>
          </div>

          {section.description && <p className="subtle">{section.description}</p>}

          {section.actionPlacement === "beforeFields" && renderActions(section)}

          {section.fields && (
            <div className="form-grid">
              {section.fields
                .filter((field) => isVisible(field, fields))
                .map((field) => {
                  const binding = fields[field.id];
                  if (!binding) {
                    return null;
                  }

                  if (field.type === "select") {
                    return (
                      <label className="field" key={field.id}>
                        <span>{field.label}</span>
                        <select
                          className="text-input"
                          value={binding.value}
                          onChange={(event) => binding.onChange(event.target.value)}
                        >
                          {field.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  if (field.type === "secret") {
                    return (
                      <label className="field" key={field.id}>
                        <span>{field.label}</span>
                        <div className="secret-input">
                          <input
                            className="text-input"
                            type={binding.visible ? "text" : "password"}
                            value={binding.value}
                            onChange={(event) => binding.onChange(event.target.value)}
                            placeholder={field.placeholder}
                          />
                          <button
                            type="button"
                            className="secret-toggle"
                            onClick={binding.onToggleVisibility}
                          >
                            {binding.visible ? (isKorean ? "숨기기" : "Hide") : isKorean ? "보기" : "Show"}
                          </button>
                        </div>
                      </label>
                    );
                  }

                  if (field.type === "datetime-local") {
                    return (
                      <label className="field" key={field.id}>
                        <span>{field.label}</span>
                        <input
                          className="text-input"
                          type="datetime-local"
                          value={binding.value}
                          onChange={(event) => binding.onChange(event.target.value)}
                        />
                      </label>
                    );
                  }

                  return (
                    <label className="field" key={field.id}>
                      <span>{field.label}</span>
                      <input
                        className="text-input"
                        value={binding.value}
                        onChange={(event) => binding.onChange(event.target.value)}
                        placeholder={field.placeholder}
                      />
                    </label>
                  );
                })}
            </div>
          )}

          {section.actionPlacement !== "beforeFields" && renderActions(section)}

          {section.statuses && (
            <div className="manual-install-box">
              {section.statuses.map((status) => {
                const binding = statuses[status.id];
                if (!binding) {
                  return null;
                }

                return (
                  <div key={status.id} className="workflow-status-block">
                    <div className="settings-row">
                      <span>{status.label}</span>
                      <code className={renderStatusTone(status, binding)}>{binding.value}</code>
                    </div>
                    {binding.href && (
                      <a
                        className="inline-link"
                        href={binding.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {binding.linkLabel ?? (isKorean ? "열기" : "Open")}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
