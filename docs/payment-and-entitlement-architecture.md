# Payment and Entitlement Architecture

## Payment entry point

The launcher opens the web checkout flow at:

- [mellowcat.xyz/payment](https://mellowcat.xyz/payment)

The launcher should append:

- `productId`
- `source=launcher`

Example:

```text
https://mellowcat.xyz/payment?productId=youtube-publish-mcp&source=launcher
```

## Expected web flow

1. launcher user clicks `Buy`
2. browser opens `mellowcat.xyz/payment`
3. payment page reads `productId`
4. payment page confirms the user is logged in
5. payment provider checkout runs
6. payment success updates entitlement server-side
7. user returns to the launcher
8. launcher refreshes session + entitlements + catalog
9. item changes from `Buy` to `Install`

## Product page behavior

The payment page should support:

- direct checkout for a single product
- showing product details before checkout
- launcher-aware flow copy such as:
  - `After checkout, return to MellowCat and your access will refresh automatically.`

## Recommended backend model

### products

- `id`
- `slug`
- `name`
- `price`
- `active`
- `checkoutPath`

### payments

- `id`
- `userId`
- `productId`
- `provider`
- `providerCheckoutId`
- `status`
- `paidAt`

### entitlements

- `userId`
- `mcpId`
- `status`
- `grantedAt`
- `source`
- `expiresAt` optional

## Launcher behavior

- `free` / `owned` -> `Install`
- `trial` -> `Start Trial`
- `not_owned` -> `Buy`
- after browser checkout, the launcher refreshes when focus returns
- a manual `Refresh Purchases` action remains available as fallback

## Backend contract notes

The launcher already expects:

- `GET /auth/session`
- `GET /auth/entitlements`
- `GET /catalog`
- `GET /mcp/:mcpId/download-ticket?version=:version`
- `POST /api/payment/handoff`

These are described in:

- [remote-api-contracts.md](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/docs/remote-api-contracts.md)
- [payment-api-spec.md](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/docs/payment-api-spec.md)
- [frontend-payment-flow.md](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/docs/frontend-payment-flow.md)
