export type MCPDataContract =
  | "trend_candidates_v1"
  | "candidate_selection_v1"
  | "script_draft_v1"
  | "revision_request_v1"
  | "scene_plan_v1"
  | "production_package_v1"
  | "publish_request_v1"
  | "publish_result_v1";

export type MCPExecutionMode =
  | "interactive"
  | "scheduled"
  | "on_demand"
  | "background_worker";

export type MCPSlotId = "input" | "process" | "create" | "output";

export type MCPSlotFieldType =
  | "text"
  | "textarea"
  | "secret"
  | "select"
  | "checkbox"
  | "file"
  | "datetime";

export interface MCPSlotFieldOption {
  value: string;
  label: string;
}

export interface MCPSlotFieldSchema {
  id: string;
  label: string;
  type: MCPSlotFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: MCPSlotFieldOption[];
  advanced?: boolean;
  width?: "full" | "half";
}

export interface MCPSlotActionSchema {
  id: string;
  label: string;
  kind: "primary" | "secondary" | "danger";
  helpText?: string;
}

export interface MCPSlotUiSchema {
  slot: MCPSlotId;
  title?: string;
  description?: string;
  fields: MCPSlotFieldSchema[];
  actions: MCPSlotActionSchema[];
}

export interface MCPContractPort {
  contract: MCPDataContract;
  required: boolean;
  multiple?: boolean;
}

export interface MCPDependencyRule {
  mcpId: string;
  reason: string;
  required: boolean;
  satisfiesAnyOf?: string[];
}

export interface MCPCompatibilityRule {
  inputs: MCPContractPort[];
  outputs: MCPContractPort[];
  executionModes: MCPExecutionMode[];
}

export interface MCPRuntimeContract {
  id: string;
  name: string;
  aiCapable?: boolean;
  builtinAvailable?: boolean;
  slot: MCPSlotId;
  category:
    | "control"
    | "discovery"
    | "generation"
    | "packaging"
    | "delivery"
    | "support";
  compatibility: MCPCompatibilityRule;
  dependencies: MCPDependencyRule[];
  configScopes: Array<"global" | "pack" | "mcp">;
  slotUi?: Partial<Record<MCPSlotId, MCPSlotUiSchema>>;
}

export interface MCPWorkflowEdge {
  from: string;
  to: string;
  contract: MCPDataContract;
  required: boolean;
}

export interface MCPWorkflowBlueprint {
  id: string;
  name: string;
  description: string;
  nodes: string[];
  edges: MCPWorkflowEdge[];
}
