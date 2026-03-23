import { getMcpRuntimeContract } from "@common/contracts/mcp-contract-registry";
import type { MCPDataContract, MCPRuntimeContract } from "@common/types/mcp-contract";

export interface MCPCompositionIssue {
  type: "missing_dependency" | "missing_input_contract";
  mcpId: string;
  message: string;
}

export interface MCPCompositionCheck {
  selectedIds: string[];
  issues: MCPCompositionIssue[];
  contractsByMcp: Record<string, MCPRuntimeContract>;
}

export function evaluateMcpComposition(selectedIds: string[]): MCPCompositionCheck {
  const uniqueIds = [...new Set(selectedIds)];
  const contractsByMcp = Object.fromEntries(
    uniqueIds
      .map((id) => [id, getMcpRuntimeContract(id)] as const)
      .filter((entry): entry is [string, MCPRuntimeContract] => Boolean(entry[1]))
  );

  const issues: MCPCompositionIssue[] = [];

  for (const [mcpId, contract] of Object.entries(contractsByMcp)) {
    for (const dependency of contract.dependencies.filter((item) => item.required)) {
      const dependencySatisfied =
        uniqueIds.includes(dependency.mcpId) ||
        dependency.satisfiesAnyOf?.some((candidateId) => uniqueIds.includes(candidateId)) ||
        false;

      if (!dependencySatisfied) {
        issues.push({
          type: "missing_dependency",
          mcpId,
          message: dependency.reason
        });
      }
    }

    for (const input of contract.compatibility.inputs.filter((item) => item.required)) {
      if (!hasProviderForContract(uniqueIds, mcpId, input.contract)) {
        issues.push({
          type: "missing_input_contract",
          mcpId,
          message: `${contract.name} needs an MCP that emits ${input.contract}.`
        });
      }
    }
  }

  return {
    selectedIds: uniqueIds,
    issues,
    contractsByMcp
  };
}

function hasProviderForContract(
  selectedIds: string[],
  targetMcpId: string,
  requiredContract: MCPDataContract
): boolean {
  return selectedIds.some((candidateId) => {
    if (candidateId === targetMcpId) {
      return false;
    }

    const candidate = getMcpRuntimeContract(candidateId);
    if (!candidate) {
      return false;
    }

    return candidate.compatibility.outputs.some(
      (output) => output.contract === requiredContract
    );
  });
}
