# Remote API Contracts

## Goal

The launcher should be able to move from bundled/local metadata to:

1. authenticated session restore
2. remote catalog rendering
3. entitlement-aware store actions
4. remote MCP download and install

The API should support beginner-friendly marketplace behavior:

- `free` or `owned` items install immediately
- `trial` items can start a trial flow
- `not_owned` items show `Buy` or `Unlock`

Concrete example files for backend handoff:

- [auth-session.response.json](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/docs/api-examples/auth-session.response.json)
- [auth-entitlements.response.json](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/docs/api-examples/auth-entitlements.response.json)
- [catalog.response.json](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/docs/api-examples/catalog.response.json)
- [mcp-download-ticket.response.json](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/docs/api-examples/mcp-download-ticket.response.json)
- [payment-and-entitlement-architecture.md](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/docs/payment-and-entitlement-architecture.md)

## Auth session

### `GET /auth/session`

Authorization:

- `Authorization: Bearer <session_token>`

Example response:

```json
{
  "authenticated": true,
  "user": {
    "id": "user_123",
    "email": "creator@example.com",
    "displayName": "MellowCat Creator"
  },
  "source": "remote",
  "lastSyncedAt": "2026-03-24T12:00:00.000Z"
}
```

## Entitlements

### `GET /auth/entitlements`

Authorization:

- `Authorization: Bearer <session_token>`

Supported response shapes:

```json
[
  {
    "mcpId": "youtube-publish-mcp",
    "status": "owned",
    "checkedAt": "2026-03-24T12:05:00.000Z"
  }
]
```

or

```json
{
  "items": [
    {
      "mcpId": "youtube-publish-mcp",
      "status": "owned",
      "checkedAt": "2026-03-24T12:05:00.000Z"
    }
  ]
}
```

Supported entitlement states:

- `free`
- `owned`
- `trial`
- `not_owned`
- `unknown`

## Catalog

### `GET /catalog`

Supported response shapes:

```json
[
  {
    "id": "youtube-publish-mcp",
    "slug": "youtube-publish-mcp",
    "name": "YouTube Publisher",
    "summary": "Upload approved production packages to YouTube.",
    "distribution": {
      "type": "paid",
      "priceText": "$19",
      "currency": "USD",
      "amount": 19
    },
    "commerce": {
      "checkoutUrl": "https://app.mellowcat.com/checkout/youtube-publisher",
      "productUrl": "https://app.mellowcat.com/store/youtube-publisher",
      "ctaLabel": "Buy"
    },
    "latestVersion": "1.0.0",
    "compatibility": {
      "launcherMinVersion": "0.2.1",
      "os": ["win32", "darwin", "linux"]
    },
    "visibility": "public",
    "tags": ["youtube", "delivery", "publisher"],
    "package": {
      "source": "remote",
      "remote": {
        "manifestUrl": "https://cdn.mellowcat.com/mcp/youtube-publish/1.0.0/manifest.json",
        "downloadUrl": "https://cdn.mellowcat.com/mcp/youtube-publish/1.0.0/package.zip",
        "checksumSha256": "abc123",
        "requiresAuth": true
      }
    },
    "workflow": {
      "ids": ["shortform-automation-stack", "shortform-telegram-youtube"]
    },
    "entitlement": {
      "status": "not_owned",
      "source": "remote",
      "checkedAt": "2026-03-24T12:05:00.000Z"
    }
  }
]
```

or

```json
{
  "items": [
    {
      "id": "youtube-publish-mcp",
      "slug": "youtube-publish-mcp",
      "name": "YouTube Publisher"
    }
  ]
}
```

Notes:

- `entitlement` may be included directly in the catalog response.
- If it is omitted, the launcher can still merge `/auth/entitlements` on the client side.
- `commerce.checkoutUrl` is used for `Buy` or `Unlock`.
- `commerce.productUrl` is used as a fallback when checkout is not yet exposed.

## Remote package download

### `GET /mcp/:mcpId/download-ticket?version=:version`

Authorization:

- required for private or paid packages

Example response:

```json
{
  "mcpId": "youtube-publish-mcp",
  "version": "1.0.0",
  "manifestUrl": "https://cdn.mellowcat.com/mcp/youtube-publish/1.0.0/manifest.json",
  "downloadUrl": "https://cdn.mellowcat.com/mcp/youtube-publish/1.0.0/package.zip?token=abc",
  "checksumSha256": "abc123"
}
```

## Launcher behavior

- `free` / `owned`: show `Install`
- `trial`: show `Start Trial`
- `not_owned`: show `Buy` and open `commerce.checkoutUrl`
- `unknown`: show a neutral access state until session or entitlement refresh completes
