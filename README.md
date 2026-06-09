# MellowCat Claude v2

MellowCat Claude v2 is an Electron-based Korean-first launcher and content production workspace for Claude Code, MCP packages, and shortform video operations.

The app started as a local MCP launcher, but the current product direction is a creator workflow tool: collect topics, generate scripts, produce/edit longform assets, and derive shortform videos from existing longform projects.

## Current Version

`0.3.22`

## Quick Start

```powershell
npm install
npm run dev
```

To run the packaged Electron app from the local workspace:

```powershell
cd C:\Users\User\Desktop\MCP\mellowcat-claude-v2
.\node_modules\.bin\electron.cmd .
```

## Main Features

- Claude Code and MCP package launcher with local-first storage.
- Korean script generation and automation package workflow.
- Card news and video generation workspace.
- Timeline-based editor for scenes, media, text, voice, audio, and export.
- Canvas position controls for selected elements.
- Element transitions, slow zoom in/out motion, and motion focus selection.
- ElevenLabs voiceover support alongside existing voice providers.
- Mobile safe-area guides for `16:9` and `9:16` editing.
- Longform-to-shortform extraction that reuses longform media and text timing.
- Saved shortform draft loading to avoid repeated AI calls and unnecessary cost.

## Project Structure

- `src/main`: Electron main process, IPC handlers, services, repositories.
- `src/preload`: Safe API bridge exposed to the renderer.
- `src/renderer`: React UI, pages, stores, and reusable components.
- `src/common`: Shared types, constants, and schema definitions.
- `mellowcat-vault`: Local MCP storage, downloads, cache, logs, and manifests.
- `docs`: Planning and product architecture documents.

## Version History

### v0.3.22

- Added longform-to-shortform draft workflow improvements.
- Added shortform playback speed controls with per-scene support from `1.00x` to `2.00x`.
- Fixed legacy shortform drafts where `playbackRate` changed but output duration did not shrink.
- Added `sourceDurationSec` handling so export reads the correct source range for sped-up clips.
- Added migration for older saved drafts so existing shortform projects are corrected on load/export.
- Added saved shortform draft loading so users do not need to re-run AI extraction every time.
- Added ElevenLabs voiceover settings and provider support.
- Added canvas position tools, all-apply controls, safe-area guides, transitions, media zoom, and timeline usability fixes.

### v0.3.21

- Fixed video editor export crop and timeline rendering issues.
- Split video crop handling into clearer source/frame behavior for export consistency.
- Improved media export path so preview and final render are closer in layout, crop, and timing.

### v0.3.20

- Improved media workflow inside the generation editor.
- Added AI workspace improvements for reviewing and editing generated production materials.
- Expanded editor controls around media, text, and package assets.

### v0.3.19

- Built the foundation for timeline-based media editing.
- Added core scene/media/audio/text timeline structures and editor UI groundwork.
- Connected generation packages more directly to manual editing and export operations.

### v0.3.18

- Added user-managed card news templates.
- Added source capture support for production packages.
- Improved crawling and generation package flow for repeatable content operations.

### v0.3.16

- Tuned crawling analysis with caption evidence tabs.
- Added subtitle-required filtering for better source review.

### v0.3.14

- Shipped a Telegram-first create/upload flow.
- Added background subtitle composition for generated media.

### v0.3.13

- Built the modular slot pipeline and media generation flow.
- Improved the automation handoff between source selection, script generation, media generation, and packaging.

### v0.3.12

- Tightened launcher account operations.
- Improved install UX for launcher-managed packages.

### v0.3.11

- Localized workflow configuration UI details.
- Improved Korean-first setup and editing copy across workflow controls.

### v0.3.10

- Refreshed the launcher UI with a compact Korean-first design.
- Improved navigation, page layout, and launcher copy.

## Product Direction

The launcher remains the platform layer.

The creator workflow layer is focused on:

- discovering viral topics,
- reviewing and selecting material from messenger-style flows,
- generating Koreanized scripts,
- editing longform production packages,
- extracting shortform drafts from finished longform videos,
- and exporting reusable production assets.

Planning documents:

- [Telegram control MCP](./docs/telegram-control-mcp.md)
- [MCP pack manifest](./docs/mcp-pack-manifest.md)
- [MCP contract and dependency model](./docs/mcp-contract-and-dependency-model.md)
- [Script provider architecture](./docs/script-provider-architecture.md)
- [Trend discovery MCP](./docs/trend-discovery-mcp.md)
- [Remote API contracts](./docs/remote-api-contracts.md)
- [Payment API spec](./docs/payment-api-spec.md)
- [Frontend payment flow](./docs/frontend-payment-flow.md)
- [LemonSqueezy backend setup](./docs/lemonsqueezy-backend-setup.md)
- [Railway backend deploy](./docs/railway-backend-deploy.md)
- [Supabase backend plan](./docs/supabase-backend-plan.md)
