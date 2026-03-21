# MellowCat Claude v2

Electron-based launcher for Claude Code and installable MCP packages under the MellowCat brand.

## Goals

- Launch and monitor Claude Code sessions
- Install, enable, update, and run MCP packages
- Start with a free catalog and local-first storage
- Leave clean expansion points for auth, entitlement, and payments

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
