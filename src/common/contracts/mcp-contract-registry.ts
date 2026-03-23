import type { MCPRuntimeContract } from "../types/mcp-contract";

export const MCP_CONTRACT_REGISTRY: Record<string, MCPRuntimeContract> = {
  "telegram-control-mcp": {
    id: "telegram-control-mcp",
    name: "Telegram Control",
    category: "control",
    compatibility: {
      inputs: [
        { contract: "trend_candidates_v1", required: false },
        { contract: "script_draft_v1", required: false },
        { contract: "production_package_v1", required: false }
      ],
      outputs: [
        { contract: "candidate_selection_v1", required: true },
        { contract: "revision_request_v1", required: true }
      ],
      executionModes: ["interactive", "background_worker"]
    },
    dependencies: [],
    configScopes: ["pack", "mcp"]
  },
  "trend-discovery-mcp": {
    id: "trend-discovery-mcp",
    name: "Trend Discovery",
    category: "discovery",
    compatibility: {
      inputs: [],
      outputs: [{ contract: "trend_candidates_v1", required: true }],
      executionModes: ["scheduled", "on_demand"]
    },
    dependencies: [],
    configScopes: ["pack", "mcp"]
  },
  "shortform-script-mcp": {
    id: "shortform-script-mcp",
    name: "Shortform Script",
    category: "generation",
    compatibility: {
      inputs: [
        { contract: "candidate_selection_v1", required: true },
        { contract: "revision_request_v1", required: false }
      ],
      outputs: [{ contract: "script_draft_v1", required: true }],
      executionModes: ["on_demand"]
    },
    dependencies: [
      {
        mcpId: "telegram-control-mcp",
        reason: "Needs a control MCP that emits candidate selections and revision requests.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"]
  },
  "asset-packager-mcp": {
    id: "asset-packager-mcp",
    name: "Asset Packager",
    category: "packaging",
    compatibility: {
      inputs: [{ contract: "script_draft_v1", required: true }],
      outputs: [{ contract: "production_package_v1", required: true }],
      executionModes: ["on_demand"]
    },
    dependencies: [
      {
        mcpId: "shortform-script-mcp",
        reason: "Needs a script generator that emits structured shortform drafts.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"]
  },
  "youtube-publish-mcp": {
    id: "youtube-publish-mcp",
    name: "YouTube Publisher",
    category: "delivery",
    compatibility: {
      inputs: [
        { contract: "production_package_v1", required: true },
        { contract: "publish_request_v1", required: false }
      ],
      outputs: [{ contract: "publish_result_v1", required: true }],
      executionModes: ["on_demand", "scheduled"]
    },
    dependencies: [
      {
        mcpId: "asset-packager-mcp",
        reason: "Needs a packaging MCP that produces production-package outputs.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"]
  },
  "instagram-publish-mcp": {
    id: "instagram-publish-mcp",
    name: "Instagram Publisher",
    category: "delivery",
    compatibility: {
      inputs: [
        { contract: "production_package_v1", required: true },
        { contract: "publish_request_v1", required: false }
      ],
      outputs: [{ contract: "publish_result_v1", required: true }],
      executionModes: ["on_demand", "scheduled"]
    },
    dependencies: [
      {
        mcpId: "asset-packager-mcp",
        reason: "Needs a packaging MCP that produces production-package outputs.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"]
  }
};

export function getMcpRuntimeContract(mcpId: string): MCPRuntimeContract | undefined {
  return MCP_CONTRACT_REGISTRY[mcpId];
}
