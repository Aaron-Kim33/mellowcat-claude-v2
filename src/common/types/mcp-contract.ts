export type MCPDataContract =
  | "trend_candidates_v1"
  | "candidate_selection_v1"
  | "script_draft_v1"
  | "revision_request_v1"
  | "production_package_v1"
  | "publish_request_v1"
  | "publish_result_v1";

export type MCPExecutionMode =
  | "interactive"
  | "scheduled"
  | "on_demand"
  | "background_worker";

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
