# Frontend Payment Flow

This is the web frontend behavior for [mellowcat.xyz/payment](https://mellowcat.xyz/payment).

## Query parameters

Expected query:

```text
/payment?handoff=handoff_abc123
```

The web frontend should not expect:

- launcher session token
- raw user id
- raw product id

Those should already be resolved server-side from the handoff token.

## Page states

### 1. Loading

- read `handoff`
- call `POST /api/payment/resolve-handoff`
- show spinner

### 2. Invalid or expired handoff

Show:

- `This checkout link is invalid or expired.`
- `Return to MellowCat and start checkout again.`

### 3. Ready to checkout

Show:

- product name
- product summary
- price
- signed-in user display name or email
- primary button: `Continue to payment`

### 4. Already owned

Show:

- `You already own this product.`
- `Return to MellowCat to install it.`

### 5. Checkout redirect

On click:

1. call `POST /api/payment/create-checkout-session`
2. redirect to returned `checkoutUrl`

### 6. Post-payment page

After the payment provider redirects back to the website, show:

- `Payment received.`
- `Return to MellowCat. Your access will refresh automatically.`

The frontend should not mark the item owned by itself.
Ownership should come from the backend after webhook confirmation.

## Errors to handle

- `HANDOFF_INVALID`
- `HANDOFF_EXPIRED`
- `UNAUTHENTICATED`
- `PRODUCT_NOT_FOUND`
- `ALREADY_OWNED`
- `CHECKOUT_DISABLED`

## Suggested frontend component structure

1. `PaymentPage`
2. `ResolvedProductCard`
3. `CheckoutButton`
4. `PaymentErrorState`
5. `PaymentSuccessHint`
