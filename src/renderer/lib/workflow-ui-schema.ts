export type WorkflowFieldType = "text" | "secret" | "select" | "datetime-local";

export interface WorkflowSelectOption {
  label: string;
  value: string;
}

export interface WorkflowFieldSchema {
  id: string;
  label: string;
  type: WorkflowFieldType;
  placeholder?: string;
  options?: readonly WorkflowSelectOption[];
  showWhen?: {
    fieldId: string;
    equals: string;
  };
}

export interface WorkflowActionSchema {
  id: string;
  label: string;
  tone?: "primary" | "secondary" | "danger" | "youtube" | "telegram";
}

export interface WorkflowStatusSchema {
  id: string;
  label: string;
}

export interface WorkflowSectionSchema {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  fields?: readonly WorkflowFieldSchema[];
  actions?: readonly WorkflowActionSchema[];
  actionPlacement?: "beforeFields" | "afterFields";
  statuses?: readonly WorkflowStatusSchema[];
}

export interface WorkflowUISchema {
  id: string;
  title: string;
  description?: string;
  sections: readonly WorkflowSectionSchema[];
}
