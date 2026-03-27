# MellowCat Claude v2

Electron-based launcher for Claude Code and installable MCP packages under the MellowCat brand.

## Goals

- Launch and monitor Claude Code sessions
- Install, enable, update, and run MCP packages
- Start with a free catalog and local-first storage
- Leave clean expansion points for auth, entitlement, and payments
- Evolve into a messenger-driven automation platform for shortform content operations

## Structure

- `src/main`: Electron main process, IPC handlers, services, repositories
- `src/preload`: Safe API bridge exposed to the renderer
- `src/renderer`: React UI, pages, stores, and reusable components
- `src/common`: Shared types, constants, and schema definitions
- `mellowcat-vault`: Local MCP storage, downloads, cache, logs, and manifest

## Next Steps

1. Install dependencies with `npm install`
2. Run `npm run dev`
3. Implement real install/update/runtime logic inside the MCP services
4. Connect catalog and auth services to real backend APIs when ready

## Product Direction

The current launcher is the platform layer.

The next product layer is a messenger-based shortform operations system:

- discover viral topics
- review and select from Telegram or KakaoTalk
- generate Koreanized scripts
- prepare production packages for manual editing or upload

Initial MCP planning for this is documented in [docs/telegram-control-mcp.md](./docs/telegram-control-mcp.md).

The sellable product layer for that direction is documented in [docs/mcp-pack-manifest.md](./docs/mcp-pack-manifest.md).

Composable MCP compatibility and dependency rules are documented in [docs/mcp-contract-and-dependency-model.md](./docs/mcp-contract-and-dependency-model.md).

Multi-provider script generation planning is documented in [docs/script-provider-architecture.md](./docs/script-provider-architecture.md).

Trend shortlist discovery planning is documented in [docs/trend-discovery-mcp.md](./docs/trend-discovery-mcp.md).

Remote catalog, entitlement, and payment flow planning is documented in:

- [docs/remote-api-contracts.md](./docs/remote-api-contracts.md)
- [docs/payment-api-spec.md](./docs/payment-api-spec.md)
- [docs/frontend-payment-flow.md](./docs/frontend-payment-flow.md)
- [docs/lemonsqueezy-backend-setup.md](./docs/lemonsqueezy-backend-setup.md)
- [docs/railway-backend-deploy.md](./docs/railway-backend-deploy.md)
