import type { MCPCatalogItem } from "@common/types/mcp";

export type StorePlatform = "all" | "telegram" | "instagram" | "youtube" | "packs";

export function detectStorePlatform(item: MCPCatalogItem): StorePlatform {
  const haystack = `${item.id} ${item.slug} ${item.name} ${item.summary} ${item.tags.join(" ")}`
    .toLowerCase();

  if (item.tags.includes("pack") || haystack.includes("pack")) {
    return "packs";
  }

  if (haystack.includes("telegram")) {
    return "telegram";
  }

  if (haystack.includes("instagram") || haystack.includes("insta")) {
    return "instagram";
  }

  if (haystack.includes("youtube") || haystack.includes("yt")) {
    return "youtube";
  }

  return "all";
}

export function matchesStorePlatform(
  item: MCPCatalogItem,
  activePlatform: StorePlatform
): boolean {
  if (activePlatform === "all") {
    return true;
  }

  const detected = detectStorePlatform(item);

  if (activePlatform === "packs") {
    return detected === "packs";
  }

  if (detected === "packs") {
    return false;
  }

  return detected === activePlatform;
}

export function getPlatformTone(platform: StorePlatform): string {
  switch (platform) {
    case "telegram":
      return "telegram";
    case "instagram":
      return "instagram";
    case "youtube":
      return "youtube";
    case "packs":
      return "pack";
    default:
      return "neutral";
  }
}
