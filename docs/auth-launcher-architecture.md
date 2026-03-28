# Auth And Launcher Session Architecture

## Goal

Replace dev-only launcher tokens with a real account system that supports:

- email/password sign-up
- login/logout
- Google OAuth
- browser-to-launcher sign-in handoff
- launcher session refresh
- payment and entitlement ownership on the same account

## Recommended identity model

Use one real user identity across:

- website
- payment
- launcher

Then keep **launcher sessions** separate from normal web login sessions.

That means:

1. the website can use cookies or short-lived web access tokens
2. the launcher gets its own bearer token or session token
3. payment entitlements are always attached to the shared `user_id`

## Tables

Keep the existing Supabase tables for:

- `app_users`
- `launcher_sessions`
- `payment_handoffs`
- `payments`
- `entitlements`

Add these tables next:

### `auth_identities`

- `id` uuid primary key
- `user_id` uuid references `app_users(id)`
- `provider` text
- `provider_user_id` text
- `email` text
- `created_at` timestamptz
- `updated_at` timestamptz

Purpose:

- connect one user to one or more providers
- examples:
  - `password`
  - `google`

### `password_credentials`

- `user_id` uuid primary key references `app_users(id)`
- `password_hash` text
- `created_at` timestamptz
- `updated_at` timestamptz

Purpose:

- store password login credentials separately from profile data

### `email_verifications`

- `id` uuid primary key
- `user_id` uuid references `app_users(id)`
- `token_hash` text unique
- `expires_at` timestamptz
- `used_at` timestamptz nullable
- `created_at` timestamptz

Purpose:

- verify newly signed-up email accounts

### `password_resets`

- `id` uuid primary key
- `user_id` uuid references `app_users(id)`
- `token_hash` text unique
- `expires_at` timestamptz
- `used_at` timestamptz nullable
- `created_at` timestamptz

Purpose:

- secure password reset flow

## Session split

### Web session

Used by:

- `mellowcat.xyz`
- checkout pages
- account pages

Recommended:

- httpOnly secure cookie session

### Launcher session

Used by:

- Electron launcher API calls

Recommended:

- bearer token stored in launcher secret store
- represented in `launcher_sessions`

The launcher token should be:

- revocable
- hashed in storage
- refreshable
- scoped to launcher use

## Auth flows

### 1. Email sign-up

1. user submits email + password on web
2. backend creates `app_users`
3. backend creates `auth_identities(provider=password)`
4. backend stores `password_credentials.password_hash`
5. backend creates email verification token
6. backend sends verification email
7. user clicks verify link
8. backend marks email verified

### 2. Email login

1. user submits email + password
2. backend verifies password hash
3. backend creates web session
4. if user chooses launcher sign-in, backend creates launcher handoff

### 3. Google OAuth login

1. user clicks `Continue with Google`
2. backend redirects to Google
3. callback returns provider user identity
4. backend finds or creates `app_users`
5. backend upserts `auth_identities(provider=google)`
6. backend creates web session
7. optional launcher sign-in handoff follows

### 4. Launcher browser sign-in

This is the important one for the desktop app.

Recommended flow:

1. launcher opens browser to:
   - `https://mellowcat.xyz/login?source=launcher`
2. user signs in on web
3. backend creates a short-lived launcher auth handoff token
4. web redirects to:
   - `https://mellowcat.xyz/launcher-auth?handoff=...`
5. launcher either:
   - polls backend with a local auth request id
   - or receives a custom protocol/deep-link later
6. backend exchanges the handoff for a real launcher session token
7. launcher stores that token in secrets and refreshes `/auth/session`

Do **not** put the final launcher bearer token directly in a query string.

## Recommended endpoints

### Website auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/verify-email`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

### OAuth

- `GET /api/auth/oauth/google/start`
- `GET /api/auth/oauth/google/callback`

### Launcher auth

- `POST /api/auth/launcher/start`
- `POST /api/auth/launcher/resolve`
- `POST /api/auth/launcher/logout`
- `GET /auth/session`

### Existing ownership endpoints

- `GET /auth/entitlements`
- `GET /catalog`
- `POST /api/payment/handoff`
- `POST /api/payment/resolve-handoff`
- `POST /api/payment/create-checkout-session`
- `POST /api/payment/webhook`

## Launcher auth handoff recommendation

Use a browser-auth handoff that mirrors the payment handoff pattern.

### `POST /api/auth/launcher/start`

Called by launcher before opening browser.

Request:

```json
{
  "source": "launcher"
}
```

Response:

```json
{
  "ok": true,
  "requestId": "authreq_123",
  "loginUrl": "https://mellowcat.xyz/login?launcherRequest=authreq_123"
}
```

### `POST /api/auth/launcher/resolve`

Called by launcher after browser login completes.

Request:

```json
{
  "requestId": "authreq_123"
}
```

Success response:

```json
{
  "ok": true,
  "accessToken": "launcher_session_token",
  "session": {
    "loggedIn": true,
    "userId": "uuid-user-id",
    "email": "creator@mellowcat.dev",
    "displayName": "MellowCat Creator"
  }
}
```

## Security rules

- password hashes only, never raw passwords
- launcher tokens stored hashed server-side
- httpOnly cookies for web sessions
- one-time auth handoff tokens for browser-to-launcher exchange
- short TTL on handoff tokens
- OAuth callback validates state
- email verification before sensitive actions if needed
- revoke launcher sessions on logout if user requests device logout

## What should stay out of scope for now

Do not build these before the basic auth flow is stable:

- multi-factor auth
- team accounts
- organization billing
- social login beyond Google
- deep-link custom protocol if polling flow is enough

## Recommended implementation order

1. add auth tables
2. implement email/password sign-up and login
3. implement launcher auth handoff start/resolve
4. wire launcher browser login to new endpoints
5. add logout and session revoke
6. add Google OAuth
7. remove dev token dependency from normal UX
