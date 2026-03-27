# Payment API Spec

## Goal

Support a secure launcher -> web checkout -> entitlement flow without putting the long-lived launcher session token directly into the browser URL.

The recommended pattern is:

1. launcher has a logged-in session token
2. launcher requests a short-lived payment handoff token from the backend
3. launcher opens the web payment page with `handoff=<token>`
4. web frontend resolves the handoff token
5. web frontend creates a checkout session
6. payment provider webhook marks the purchase complete
7. backend grants entitlement
8. launcher refreshes entitlements and changes `Buy` to `Install`

## Security rules

- never expose the long-lived launcher session token in a query string
- handoff tokens must be short-lived and one-time use
- checkout must be created server-side only
- final entitlement grant must happen from webhook confirmation, not from frontend redirect
- all product ids must be validated server-side

## Data model

### `products`

- `id` string
- `slug` string
- `name` string
- `summary` string
- `priceAmount` number
- `priceCurrency` string
- `status` enum: `active | inactive`
- `checkoutEnabled` boolean

### `payment_handoffs`

- `id` string
- `tokenHash` string
- `userId` string
- `productId` string
- `source` string
- `expiresAt` datetime
- `usedAt` datetime nullable

### `payments`

- `id` string
- `userId` string
- `productId` string
- `provider` string
- `providerCheckoutId` string nullable
- `providerSessionId` string nullable
- `status` enum: `pending | paid | failed | canceled | refunded`
- `paidAt` datetime nullable

### `entitlements`

- `id` string
- `userId` string
- `mcpId` string
- `status` enum: `owned | trial | revoked`
- `source` enum: `purchase | grant | admin`
- `grantedAt` datetime
- `expiresAt` datetime nullable

## Endpoint 1: create handoff token

### `POST /api/payment/handoff`

Purpose:

- launcher sends the existing authenticated session token in the request header
- backend validates the user
- backend validates the product
- backend creates a short-lived one-time handoff token
- backend returns the payment URL to open

Authentication:

- `Authorization: Bearer <launcher_session_token>`

Request body:

```json
{
  "productId": "youtube-publish-mcp",
  "source": "launcher"
}
```

Success response:

```json
{
  "ok": true,
  "handoffToken": "handoff_abc123",
  "paymentUrl": "https://mellowcat.xyz/payment?handoff=handoff_abc123",
  "expiresAt": "2026-03-27T22:15:00.000Z"
}
```

Error responses:

```json
{
  "ok": false,
  "code": "UNAUTHENTICATED",
  "message": "You need to sign in again before starting checkout."
}
```

```json
{
  "ok": false,
  "code": "PRODUCT_NOT_FOUND",
  "message": "This product is no longer available."
}
```

```json
{
  "ok": false,
  "code": "ALREADY_OWNED",
  "message": "You already own this product."
}
```

## Endpoint 2: resolve handoff token

### `POST /api/payment/resolve-handoff`

Purpose:

- web payment page sends the handoff token
- backend validates token expiry and single-use policy
- backend returns the safe user/product context needed to show the checkout screen

Request body:

```json
{
  "handoffToken": "handoff_abc123"
}
```

Success response:

```json
{
  "ok": true,
  "user": {
    "id": "user_123",
    "email": "creator@example.com",
    "displayName": "MellowCat Creator"
  },
  "product": {
    "id": "youtube-publish-mcp",
    "name": "YouTube Publisher",
    "summary": "Connect OAuth and upload approved production packages to YouTube.",
    "priceAmount": 19,
    "priceCurrency": "USD"
  },
  "source": "launcher"
}
```

Error responses:

```json
{
  "ok": false,
  "code": "HANDOFF_EXPIRED",
  "message": "This checkout link expired. Return to the launcher and try again."
}
```

```json
{
  "ok": false,
  "code": "HANDOFF_INVALID",
  "message": "This checkout link is invalid."
}
```

## Endpoint 3: create checkout session

### `POST /api/payment/create-checkout-session`

Purpose:

- web payment page creates a provider checkout session from the resolved handoff token
- backend double-checks user, product, and purchase status

Request body:

```json
{
  "handoffToken": "handoff_abc123"
}
```

Success response:

```json
{
  "ok": true,
  "provider": "stripe",
  "checkoutUrl": "https://checkout.stripe.com/pay/cs_test_123",
  "paymentId": "pay_123"
}
```

Error responses:

```json
{
  "ok": false,
  "code": "ALREADY_OWNED",
  "message": "You already own this product."
}
```

```json
{
  "ok": false,
  "code": "CHECKOUT_DISABLED",
  "message": "Checkout is temporarily unavailable for this product."
}
```

## Endpoint 4: payment webhook

### `POST /api/payment/webhook`

Purpose:

- receive provider webhook
- verify signature
- mark payment record as paid
- grant entitlement

Request body:

- provider-specific raw payload

Server-side behavior:

1. verify webhook signature
2. find internal payment record by provider session id
3. if payment already marked paid, return success idempotently
4. mark payment as paid
5. upsert entitlement for `(userId, productId)`
6. return 200

Success response:

```json
{
  "ok": true
}
```

## Endpoint 5: optional payment status

### `GET /api/payment/status/:paymentId`

Purpose:

- optional endpoint for the web payment page to poll a pending checkout if needed

Success response:

```json
{
  "ok": true,
  "status": "paid"
}
```

## Launcher integration

The launcher should:

1. call `POST /api/payment/handoff`
2. open the returned `paymentUrl`
3. when the app regains focus, refresh:
   - `GET /auth/session`
   - `GET /auth/entitlements`
   - `GET /catalog`

## Frontend integration

The web payment page should:

1. read `handoff` from the query string
2. call `POST /api/payment/resolve-handoff`
3. show product + user context
4. on checkout click, call `POST /api/payment/create-checkout-session`
5. redirect browser to the returned provider checkout URL
6. after successful payment, show:
   - `Purchase completed. Return to MellowCat.`

## Notes for implementation

- handoff token TTL recommendation: 1 to 5 minutes
- handoff token should be stored hashed in the database
- do not log the raw handoff token
- webhook completion is the only source of truth for entitlement creation
