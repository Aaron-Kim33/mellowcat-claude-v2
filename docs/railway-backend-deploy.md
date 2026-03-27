# Railway Backend Deploy

This repo now contains a small Node backend for:

- `GET /health`
- `GET /catalog`
- `GET /auth/session`
- `GET /auth/entitlements`
- `GET /mcp/:id/download-ticket`
- `POST /api/payment/handoff`
- `POST /api/payment/resolve-handoff`
- `POST /api/payment/create-checkout-session`
- `POST /api/payment/webhook`
- `GET /api/payment/status/:paymentId`

The easiest deployment target for the current backend shape is Railway.

## Why Railway

- works well with a long-running Node server
- easier than trying to force the current backend into Vercel serverless routes
- good fit for `api.mellowcat.xyz`

## Recommended domain split

- web frontend: `https://mellowcat.xyz`
- backend API: `https://api.mellowcat.xyz`

Then:

- web payment page lives at `https://mellowcat.xyz/payment`
- payment API lives at `https://api.mellowcat.xyz/api/payment/*`

## Railway setup

1. Create a new Railway project from this repo.
2. Set the root directory to the repo root.
3. Use these commands:

Build command:

```bash
npm run build
```

Start command:

```bash
npm start
```

## Required environment variables

Use [backend/.env.example](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/backend/.env.example) as the source of truth.

Minimum:

- `MELLOWCAT_API_HOST=0.0.0.0`
- `MELLOWCAT_API_PORT=8787`
- `MELLOWCAT_APP_BASE_URL=https://api.mellowcat.xyz`
- `MELLOWCAT_PAYMENT_BASE_URL=https://mellowcat.xyz/payment`
- `MELLOWCAT_PAYMENT_SUCCESS_URL=https://mellowcat.xyz/payment?status=success`

For real Lemon Squeezy checkout:

- `MELLOWCAT_LEMON_SQUEEZY_API_KEY`
- `MELLOWCAT_LEMON_SQUEEZY_STORE_ID`
- `MELLOWCAT_LEMON_SQUEEZY_WEBHOOK_SECRET`

## Variant mapping

Before real checkout works, update:

- [backend/data/lemonsqueezy-variants.json](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/backend/data/lemonsqueezy-variants.json)

Example:

```json
{
  "youtube-publish-mcp": 12345,
  "filesystem-tools": 67890
}
```

`0` means “not wired yet”, so the backend will fall back to the manual placeholder checkout flow.

## Web frontend config

The payment page should call:

- `POST https://api.mellowcat.xyz/api/payment/resolve-handoff`
- `POST https://api.mellowcat.xyz/api/payment/create-checkout-session`

Do not point the web frontend to `mellowcat.xyz/api/...` unless you intentionally proxy API traffic through the frontend domain.

## First deployment checklist

1. Deploy backend to Railway
2. Attach custom domain `api.mellowcat.xyz`
3. Set backend environment variables
4. Confirm `GET https://api.mellowcat.xyz/health`
5. Point web payment frontend to `https://api.mellowcat.xyz`
6. Test launcher login -> Buy -> payment handoff
7. Test webhook -> entitlement -> launcher refresh
