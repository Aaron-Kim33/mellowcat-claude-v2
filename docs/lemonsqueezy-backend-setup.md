# Lemon Squeezy Backend Setup

This launcher now supports a Lemon Squeezy-backed checkout flow from the local backend scaffold.

## Required environment variables

Set these before starting the backend:

- `MELLOWCAT_LEMON_SQUEEZY_API_KEY`
- `MELLOWCAT_LEMON_SQUEEZY_STORE_ID`
- `MELLOWCAT_LEMON_SQUEEZY_WEBHOOK_SECRET`

Optional:

- `MELLOWCAT_PAYMENT_BASE_URL`
- `MELLOWCAT_API_HOST`
- `MELLOWCAT_API_PORT`

## Variant mapping

The backend reads product-to-variant mappings from:

- [backend/data/lemonsqueezy-variants.json](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/backend/data/lemonsqueezy-variants.json)

Example:

```json
{
  "youtube-publish-mcp": 12345,
  "filesystem-tools": 67890
}
```

Values set to `0` are treated as unmapped and will fall back to the manual checkout placeholder.

## Backend behavior

- `POST /api/payment/create-checkout-session`
  - uses Lemon Squeezy when the API key, store id, and variant mapping are present
  - otherwise falls back to the existing manual placeholder flow

- `POST /api/payment/webhook`
  - verifies `X-Signature` with the configured webhook secret
  - grants entitlement when a paid order event is received

## Relevant official docs

- [Create a Checkout](https://docs.lemonsqueezy.com/api/checkouts/create-checkout)
- [Webhooks](https://docs.lemonsqueezy.com/help/webhooks)
- [Signing Requests](https://docs.lemonsqueezy.com/help/webhooks/signing-requests)
