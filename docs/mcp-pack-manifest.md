# MCP Pack Manifest

## Purpose

An MCP pack is the sellable product layer on top of individual MCPs.

Users should not need to understand:

- which MCPs are included
- what order they run in
- which config fields belong to which internal component

They should install one product and complete one guided setup.

## Product Model

### Internal reality

A shortform assistant product may contain:

- `trend-discovery-mcp`
- `telegram-control-mcp`
- `shortform-script-mcp`
- `asset-packager-mcp`

### User-facing reality

The user sees one installable product:

`Shortform Assistant Pack`

That is the main reason the pack layer exists.

## Pack Responsibilities

A pack manifest should define:

- product identity
- included MCPs
- required config fields
- onboarding steps
- compatibility rules
- default activation behavior

It should not contain the full internal logic of each MCP.

## Recommended Shape

```ts
interface MCPPackManifest {
  id: string;
  slug: string;
  name: string;
  version: string;
  summary: string;
  description?: string;
  category: "automation" | "assistant" | "workflow";
  distribution: {
    type: "free" | "paid" | "private" | "bundled";
    priceText?: string;
  };
  branding?: {
    iconUrl?: string;
    bannerUrl?: string;
    accentColor?: string;
  };
  includes: Array<{
    id: string;
    version?: string;
    required: boolean;
    autoEnable?: boolean;
    role: "control" | "discovery" | "generation" | "packaging" | "delivery" | "support";
  }>;
  config: {
    fields: Array<{
      key: string;
      label: string;
      type: "text" | "password" | "textarea" | "number" | "select";
      description?: string;
      required?: boolean;
      placeholder?: string;
      defaultValue?: string | number;
    }>;
  };
  onboarding: {
    steps: Array<{
      id: string;
      title: string;
      description: string;
      action: "open_settings" | "run_detection" | "open_store" | "start_pack" | "custom";
      ctaLabel: string;
    }>;
  };
  compatibility?: {
    launcherMinVersion?: string;
    os?: Array<"win32" | "darwin" | "linux">;
  };
  tags: string[];
}
```

## Example: Shortform Assistant Pack

```json
{
  "id": "shortform-assistant-pack",
  "slug": "shortform-assistant",
  "name": "Shortform Assistant",
  "version": "0.1.0",
  "summary": "Messenger-based shortform operations system for trend discovery, script review, and production prep.",
  "category": "automation",
  "distribution": {
    "type": "bundled",
    "priceText": "Free beta"
  },
  "includes": [
    {
      "id": "trend-discovery-mcp",
      "required": true,
      "autoEnable": true,
      "role": "discovery"
    },
    {
      "id": "telegram-control-mcp",
      "required": true,
      "autoEnable": true,
      "role": "control"
    },
    {
      "id": "shortform-script-mcp",
      "required": true,
      "autoEnable": true,
      "role": "generation"
    },
    {
      "id": "asset-packager-mcp",
      "required": true,
      "autoEnable": true,
      "role": "packaging"
    }
  ],
  "config": {
    "fields": [
      {
        "key": "telegramBotToken",
        "label": "Telegram Bot Token",
        "type": "password",
        "required": true
      },
      {
        "key": "telegramAdminChatId",
        "label": "Telegram Admin Chat ID",
        "type": "text",
        "required": true
      },
      {
        "key": "contentLanguage",
        "label": "Content Language",
        "type": "select",
        "defaultValue": "ko"
      }
    ]
  },
  "onboarding": {
    "steps": [
      {
        "id": "connect-telegram",
        "title": "Connect Telegram",
        "description": "Add your bot token and admin chat id.",
        "action": "open_settings",
        "ctaLabel": "Open Settings"
      },
      {
        "id": "start-pack",
        "title": "Start Shortform Assistant",
        "description": "Run the pack and send the first trend shortlist.",
        "action": "start_pack",
        "ctaLabel": "Start Assistant"
      }
    ]
  },
  "compatibility": {
    "launcherMinVersion": "0.1.4",
    "os": ["win32", "darwin"]
  },
  "tags": ["shortform", "telegram", "automation", "content-ops"]
}
```

## Install Behavior

Installing a pack should:

1. install all required MCPs
2. enable MCPs marked `autoEnable`
3. generate a pack-level config record
4. open the onboarding flow

The user should not need to install each MCP separately.

## Runtime Behavior

The pack itself can remain a logical product record.

At runtime:

- pack status is derived from child MCP states
- pack setup completeness is derived from config and onboarding progress
- pack health is derived from whether required MCPs are installed and running

## Storage Recommendation

Add pack state alongside the existing local manifest model.

Suggested future file:

- `mellowcat-vault/packs/manifest.json`

This can later merge into a DB-backed repository if needed.

## Why This Matters Before Telegram

If the pack layer is defined first:

- `telegram-control-mcp` can be built to fit a product
- setup fields can be modeled in the right place
- onboarding can be pack-first instead of MCP-first
- pricing and entitlement can target packs later

This avoids designing Telegram as a loose standalone utility and then reworking it into a product.
