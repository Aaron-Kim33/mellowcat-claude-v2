# macOS Release Signing

## Why mac builds showed "damaged"

macOS Gatekeeper commonly shows `"App is damaged and can't be opened"` when an Electron app is:

- unsigned
- signed without a valid Developer ID Application certificate
- not notarized by Apple
- missing hardened runtime / entitlements expected by Electron apps

This project now includes:

- mac hardened runtime
- mac entitlements
- an `afterSign` notarization hook
- GitHub Actions wiring for mac release secrets

Files involved:

- [electron-builder.yml](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/electron-builder.yml)
- [scripts/notarize.cjs](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/scripts/notarize.cjs)
- [build/entitlements.mac.plist](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/build/entitlements.mac.plist)
- [build/entitlements.mac.inherit.plist](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/build/entitlements.mac.inherit.plist)
- [.github/workflows/release.yml](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/.github/workflows/release.yml)

## Required GitHub Secrets

Set these repository secrets before creating a mac release build:

- `CSC_LINK`
  - Base64 or file link for the exported Developer ID Application certificate (`.p12`)
- `CSC_KEY_PASSWORD`
  - Password for the certificate
- `APPLE_ID`
  - Apple Developer account email
- `APPLE_APP_SPECIFIC_PASSWORD`
  - App-specific password from Apple ID settings
- `APPLE_TEAM_ID`
  - Apple Developer Team ID

Optional:

- `APPLE_ID_PASSWORD`
  - Legacy fallback if you want to use this name instead of `APPLE_APP_SPECIFIC_PASSWORD`

## Certificate Requirements

Use a **Developer ID Application** certificate, not a Mac App Store certificate.

Typical flow:

1. Create/export Developer ID Application certificate on macOS Keychain Access
2. Export as `.p12`
3. Upload the certificate into GitHub secrets as `CSC_LINK`
4. Store the certificate password in `CSC_KEY_PASSWORD`

## Release Workflow

The release workflow now builds:

- Windows NSIS
- macOS DMG
- macOS ZIP

macOS release uses:

- `npm run dist:mac`
- `electron-builder --mac dmg zip --publish always`

## Local mac Build Expectations

For a fully trusted mac app, build on macOS with the same secrets available:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`

If Apple credentials are missing, notarization is skipped intentionally and the app may still be blocked by Gatekeeper.

## Quick Verification on macOS

After downloading the mac artifact:

1. Open the `.dmg`
2. Copy the app to `/Applications`
3. Launch once normally

If you want to verify notarization manually on macOS:

```bash
spctl -a -vv "/Applications/MellowCat Claude.app"
codesign --verify --deep --strict --verbose=2 "/Applications/MellowCat Claude.app"
```

If those pass and the build is notarized, Gatekeeper should stop showing the damaged warning.
