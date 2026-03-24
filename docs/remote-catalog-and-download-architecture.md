# Remote Catalog and Download Architecture

## Direction

The launcher is evolving toward:

1. local execution and workflow control
2. remote login and entitlement checks
3. remote catalog metadata
4. remote MCP package delivery

Claude Code remains part of the product as an embedded power-user tool for:

- direct MCP customization
- debugging local workflow pieces
- editing prompts, manifests, and scripts inside the launcher environment

## Separation of concerns

- `AuthService`: who the user is
- `EntitlementService`: what the user owns
- `CatalogService`: what the store offers
- `MCPInstallService`: how a package gets installed
- `MCPRemotePackageService`: remote package manifest and download ticket preparation

## Planned remote flow

1. user logs in
2. launcher fetches remote catalog
3. catalog item points to `package.source = "remote"`
4. install service requests a download ticket or explicit manifest URL
5. launcher downloads package archive
6. launcher verifies checksum/signature
7. launcher extracts to local installed version path
8. launcher updates installed manifest and workflow bindings

## Why this matches the current launcher

- Store already uses catalog metadata
- Installed already tracks source and workflow ids
- Workflows already render from workflow metadata instead of hardcoded screens
- MCP contracts and dependency rules already model compatible composition

## What is scaffolded now

- remote package metadata type in catalog
- API client method for MCP download tickets
- remote package preparation service
- install service branch point for remote package installs
- remote archive download
- sha256 checksum verification
- zip archive extraction into installed version paths

## What is still intentionally missing

- signed archive verification beyond checksum
- resumable downloads
- progress UI for remote installs
- pack purchase and entitlement enforcement
