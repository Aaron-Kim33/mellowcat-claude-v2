import type {
  MCPDataContract,
  MCPDependencyRule,
  MCPExecutionMode
} from "./mcp-contract";

export type MCPPackDistributionType = "free" | "paid" | "private" | "bundled";
export type MCPPackInstallState = "not_installed" | "installing" | "installed" | "error";

export interface MCPPackConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "textarea" | "number" | "select";
  description?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  options?: Array<{
    label: string;
    value: string;
  }>;
}

export interface MCPPackOnboardingStep {
  id: string;
  title: string;
  description: string;
  action:
    | "open_settings"
    | "run_detection"
    | "open_store"
    | "start_pack"
    | "custom";
  ctaLabel: string;
}

export interface MCPPackIncludedMCP {
  id: string;
  version?: string;
  required: boolean;
  autoEnable?: boolean;
  role: "control" | "discovery" | "generation" | "packaging" | "delivery" | "support";
  contracts?: {
    accepts?: MCPDataContract[];
    emits?: MCPDataContract[];
  };
  executionModes?: MCPExecutionMode[];
  dependencies?: MCPDependencyRule[];
}

export interface MCPPackManifest {
  id: string;
  slug: string;
  name: string;
  version: string;
  summary: string;
  description?: string;
  category: "automation" | "assistant" | "workflow";
  distribution: {
    type: MCPPackDistributionType;
    priceText?: string;
  };
  branding?: {
    iconUrl?: string;
    bannerUrl?: string;
    accentColor?: string;
  };
  includes: MCPPackIncludedMCP[];
  config: {
    fields: MCPPackConfigField[];
  };
  workflow?: {
    ids: string[];
  };
  onboarding: {
    steps: MCPPackOnboardingStep[];
  };
  compatibility?: {
    launcherMinVersion?: string;
    os?: Array<"win32" | "darwin" | "linux">;
  };
  tags: string[];
}

export interface InstalledMCPPackRecord {
  id: string;
  version: string;
  installState: MCPPackInstallState;
  enabled: boolean;
  installedAt?: string;
  updatedAt?: string;
  configValues?: Record<string, string | number>;
}
