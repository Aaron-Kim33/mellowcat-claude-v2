import type { MCPCatalogItem } from "@common/types/mcp";

export type MCPRoleTone =
  | "core"
  | "control"
  | "discovery"
  | "generation"
  | "packaging"
  | "delivery";

export interface MCPRoleBadge {
  label: string;
  tone: MCPRoleTone;
}

export function detectMcpRole(item: MCPCatalogItem): MCPRoleBadge {
  const haystack = `${item.id} ${item.slug} ${item.name} ${item.summary} ${item.tags.join(" ")}`
    .toLowerCase();

  if (haystack.includes("control")) {
    return { label: "Control", tone: "control" };
  }

  if (haystack.includes("discovery")) {
    return { label: "Discovery", tone: "discovery" };
  }

  if (haystack.includes("script") || haystack.includes("generation") || haystack.includes("llm")) {
    return { label: "Generation", tone: "generation" };
  }

  if (haystack.includes("packager") || haystack.includes("packaging")) {
    return { label: "Packaging", tone: "packaging" };
  }

  if (haystack.includes("publisher") || haystack.includes("delivery")) {
    return { label: "Delivery", tone: "delivery" };
  }

  return { label: "Core", tone: "core" };
}
