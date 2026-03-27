import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { LemonSqueezyConfig } from "./lemonsqueezy";

const ROOT_DIR = path.resolve(__dirname, "../..");
const DATA_DIR = path.resolve(ROOT_DIR, "backend", "data");
const VARIANT_MAP_PATH = path.resolve(DATA_DIR, "lemonsqueezy-variants.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function seedVariantMapFile(): void {
  ensureDataDir();
  if (existsSync(VARIANT_MAP_PATH)) {
    return;
  }

  writeFileSync(
    VARIANT_MAP_PATH,
    JSON.stringify(
      {
        "youtube-publish-mcp": 0,
        "filesystem-tools": 0
      },
      null,
      2
    ),
    "utf8"
  );
}

function readVariantMap(): Record<string, number> {
  seedVariantMapFile();
  const json = JSON.parse(readFileSync(VARIANT_MAP_PATH, "utf8")) as Record<string, number>;
  return Object.fromEntries(
    Object.entries(json).filter((entry): entry is [string, number] => {
      const [, value] = entry;
      return Number.isFinite(value) && value > 0;
    })
  );
}

export function getLemonSqueezyConfig(): LemonSqueezyConfig {
  return {
    apiKey: process.env.MELLOWCAT_LEMON_SQUEEZY_API_KEY,
    storeId: process.env.MELLOWCAT_LEMON_SQUEEZY_STORE_ID,
    webhookSecret: process.env.MELLOWCAT_LEMON_SQUEEZY_WEBHOOK_SECRET,
    variantMap: readVariantMap()
  };
}
