# MCP Contract And Dependency Model

## Why This Matters

If MellowCat is going to sell:

- `telegram-control-mcp`
- `instagram-publish-mcp`
- `youtube-publish-mcp`
- `trend-discovery-mcp`
- `asset-packager-mcp`

users must be able to combine them without guessing:

- what input each MCP expects
- what output each MCP produces
- which MCPs are optional
- which MCPs are required for a valid workflow

That means compatibility has to be explicit.

## Core Rule

An MCP should not integrate with another MCP by ad-hoc assumptions.

Each MCP should declare:

- accepted contracts
- emitted contracts
- whether each input is required or optional
- execution modes
- required dependencies
- optional dependencies
- config scope

## Recommended Contract Set

### Discovery

- `trend_candidates_v1`

### Selection / control

- `candidate_selection_v1`

### Generation

- `script_draft_v1`
- `revision_request_v1`

### Packaging

- `production_package_v1`

### Delivery

- `publish_request_v1`
- `publish_result_v1`

## Example MCPs

### telegram-control-mcp

- inputs:
  - `trend_candidates_v1` optional
  - `script_draft_v1` optional
  - `production_package_v1` optional
- outputs:
  - `candidate_selection_v1`
  - `revision_request_v1`
- modes:
  - `interactive`
  - `background_worker`

### trend-discovery-mcp

- inputs:
  - none
- outputs:
  - `trend_candidates_v1`
- modes:
  - `scheduled`
  - `on_demand`

### shortform-script-mcp

- inputs:
  - `candidate_selection_v1` required
  - `revision_request_v1` optional
- outputs:
  - `script_draft_v1`
- modes:
  - `on_demand`

### asset-packager-mcp

- inputs:
  - `script_draft_v1` required
- outputs:
  - `production_package_v1`
- modes:
  - `on_demand`

### youtube-publish-mcp

- inputs:
  - `production_package_v1` required
  - `publish_request_v1` optional
- outputs:
  - `publish_result_v1`
- modes:
  - `on_demand`
  - `scheduled`

### instagram-publish-mcp

- inputs:
  - `production_package_v1` required
  - `publish_request_v1` optional
- outputs:
  - `publish_result_v1`
- modes:
  - `on_demand`
  - `scheduled`

## Valid Product Combinations

### Telegram + Instagram

Valid if the workflow includes:

- `telegram-control-mcp`
- `shortform-script-mcp`
- `asset-packager-mcp`
- `instagram-publish-mcp`

### Telegram + YouTube

Valid if the workflow includes:

- `telegram-control-mcp`
- `shortform-script-mcp`
- `asset-packager-mcp`
- `youtube-publish-mcp`

### Discovery + Telegram only

Valid for editorial review, but not publishing.

That means:

- `trend-discovery-mcp`
- `telegram-control-mcp`
- `shortform-script-mcp`

can be sold without a publish MCP.

## Store Rules

The Store should eventually do 3 checks:

1. dependency check
2. contract compatibility check
3. execution mode check

### Example

If the user buys `instagram-publish-mcp` without `asset-packager-mcp`,
the Store should explain:

`Instagram Publisher requires a production package input. Add Asset Packager or a compatible packaging MCP.`

## Config Scope

Not every setting belongs in global Settings.

### Global Settings

- launcher language
- Claude path
- update preferences
- storage path

### Pack Settings

- shortform language
- trend window
- preferred messaging transport
- default platform mix

### MCP Settings

- Telegram bot token
- Instagram app credentials
- YouTube channel defaults
- OpenRouter / OpenAI API key

## Recommended Direction

Use:

- packs for sellable bundles
- MCP contracts for technical compatibility
- installed pack configuration for workflow setup
- per-MCP secret storage for credentials

This lets MellowCat support both:

- beginner users who buy one working pack
- advanced users who custom-build their own automation stack
