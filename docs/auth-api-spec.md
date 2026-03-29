# Auth API Spec

## Scope

This auth API layer now covers:

- email/password sign-up
- email/password login
- logout
- email verification
- password reset
- current web user lookup
- launcher browser-auth handoff
- Google OAuth

## Website auth endpoints

### `POST /api/auth/signup`

Request:

```json
{
  "email": "creator@example.com",
  "password": "supersecret123",
  "displayName": "MellowCat Creator"
}
```

Success:

```json
{
  "ok": true,
  "user": {
    "id": "uuid-user-id",
    "email": "creator@example.com",
    "displayName": "MellowCat Creator",
    "linkedProviders": ["password"],
    "emailVerified": false
  },
  "verificationSent": true,
  "emailSent": true,
  "verificationUrl": null,
  "verificationExpiresAt": "2026-03-29T12:00:00.000Z"
}
```

Behavior:

- creates `app_users`
- creates `password_credentials`
- creates `web_sessions`
- sets `mellowcat_web_session` cookie
- creates an email verification request
- sends a verification email when `MELLOWCAT_RESEND_API_KEY` and `MELLOWCAT_EMAIL_FROM` are configured
- when email delivery is not configured, returns a frontend-ready `verificationUrl` fallback

Errors:

- `BAD_REQUEST`
- `WEAK_PASSWORD`
- `EMAIL_EXISTS`

### `POST /api/auth/login`

Request:

```json
{
  "email": "creator@example.com",
  "password": "supersecret123",
  "launcherRequest": "authreq_123"
}
```

`launcherRequest` is optional.

Success:

```json
{
  "ok": true,
  "user": {
    "id": "uuid-user-id",
    "email": "creator@example.com",
    "displayName": "MellowCat Creator",
    "linkedProviders": ["password"],
    "emailVerified": false
  },
  "launcherRequestResolved": true
}
```

Behavior:

- verifies password
- creates `web_sessions`
- sets `mellowcat_web_session` cookie
- if `launcherRequest` exists, resolves the launcher auth request for that user

Errors:

- `BAD_REQUEST`
- `INVALID_CREDENTIALS`

### `POST /api/auth/send-verification`

Authentication:

- requires `mellowcat_web_session` cookie

Success:

```json
{
  "ok": true,
  "alreadyVerified": false,
  "verificationSent": true,
  "emailSent": true,
  "verificationUrl": null,
  "verificationExpiresAt": "2026-03-29T12:00:00.000Z"
}
```

Behavior:

- issues a fresh email verification request for the signed-in web user
- if already verified, returns `{ "ok": true, "alreadyVerified": true }`

### `POST /api/auth/verify-email`

Request:

```json
{
  "token": "verify_xxx",
  "launcherRequest": "authreq_123"
}
```

`launcherRequest` is optional.

Success:

```json
{
  "ok": true,
  "user": {
    "id": "uuid-user-id",
    "email": "creator@example.com",
    "displayName": "MellowCat Creator",
    "linkedProviders": ["google", "password"],
    "emailVerified": true
  },
  "launcherRequestResolved": true
}
```

Behavior:

- validates verification token
- marks `app_users.email_verified_at`
- marks verification request as used
- creates a fresh `mellowcat_web_session` cookie
- if `launcherRequest` is present, resolves the launcher auth request immediately

Errors:

- `BAD_REQUEST`
- `VERIFY_NOT_FOUND`
- `VERIFY_USED`
- `VERIFY_EXPIRED`
- `USER_NOT_FOUND`

### `POST /api/auth/forgot-password`

Request:

```json
{
  "email": "creator@example.com"
}
```

Success:

```json
{
  "ok": true,
  "resetRequested": true,
  "emailSent": true,
  "expiresAt": "2026-03-28T12:00:00.000Z",
  "resetUrl": null
}
```

Behavior:

- accepts an email address
- if a password-based account exists, creates a short-lived password reset request
- sends a reset email when `MELLOWCAT_RESEND_API_KEY` and `MELLOWCAT_EMAIL_FROM` are configured
- when email delivery is not configured, returns a frontend-ready `resetUrl` fallback
- still returns `ok: true` when the account is missing

Errors:

- `BAD_REQUEST`

### `POST /api/auth/reset-password`

Request:

```json
{
  "token": "reset_xxx",
  "password": "new-supersecret123",
  "launcherRequest": "authreq_123"
}
```

Success:

```json
{
  "ok": true,
  "user": {
    "id": "uuid-user-id",
    "email": "creator@example.com",
    "displayName": "MellowCat Creator"
  },
  "launcherRequestResolved": true
}
```

Behavior:

- validates reset token
- updates `password_credentials`
- marks reset request as used
- creates a fresh `web_sessions` cookie
- if `launcherRequest` is present, resolves the launcher auth request immediately

Errors:

- `BAD_REQUEST`
- `WEAK_PASSWORD`
- `RESET_NOT_FOUND`
- `RESET_USED`
- `RESET_EXPIRED`
- `USER_NOT_FOUND`

### `POST /api/auth/logout`

Success:

```json
{
  "ok": true
}
```

Behavior:

- deletes current `web_sessions` row if cookie exists
- clears `mellowcat_web_session`

### `GET /api/auth/me`

Success:

```json
{
  "ok": true,
  "user": {
    "id": "uuid-user-id",
    "email": "creator@example.com",
    "displayName": "MellowCat Creator",
    "linkedProviders": ["password"],
    "emailVerified": true
  }
}
```

Errors:

- `UNAUTHENTICATED`

## Launcher auth handoff endpoints

### `POST /api/auth/launcher/start`

Request:

```json
{
  "source": "launcher"
}
```

Success:

```json
{
  "ok": true,
  "requestId": "authreq_123",
  "loginUrl": "https://mellowcat.xyz/login?source=launcher&launcherRequest=authreq_123",
  "expiresAt": "2026-03-28T10:10:00.000Z"
}
```

Behavior:

- creates a short-lived launcher auth request
- returns login URL for browser flow

### `POST /api/auth/launcher/complete`

Used by web frontend after user finishes login in browser.

Authentication:

- requires `mellowcat_web_session` cookie

Request:

```json
{
  "requestId": "authreq_123"
}
```

Success:

```json
{
  "ok": true
}
```

Behavior:

- binds authenticated web user to launcher auth request
- marks request as resolved

Errors:

- `UNAUTHENTICATED`
- `BAD_REQUEST`
- `REQUEST_NOT_FOUND`
- `REQUEST_EXPIRED`

### `POST /api/auth/launcher/resolve`

Used by launcher after browser login completes.

Request:

```json
{
  "requestId": "authreq_123"
}
```

Pending response:

```json
{
  "ok": true,
  "status": "pending"
}
```

Resolved response:

```json
{
  "ok": true,
  "status": "resolved",
  "accessToken": "launcher_xxx",
  "session": {
    "loggedIn": true,
    "userId": "uuid-user-id",
    "email": "creator@example.com",
    "displayName": "MellowCat Creator",
    "source": "remote",
    "lastSyncedAt": "2026-03-28T10:12:00.000Z"
  }
}
```

Behavior:

- checks if launcher auth request has been resolved by browser login
- if yes, creates a real `launcher_sessions` token
- returns launcher session payload

Errors:

- `BAD_REQUEST`
- `REQUEST_NOT_FOUND`
- `REQUEST_EXPIRED`
- `USER_NOT_FOUND`

## Google OAuth endpoints

### `GET /api/auth/oauth/google/start`

Query params:

- `source=launcher` optional
- `launcherRequest=authreq_123` optional

Behavior:

- signs a short-lived OAuth state payload
- redirects to Google OAuth consent

### `GET /api/auth/oauth/google/callback`

Behavior:

- validates signed state
- exchanges `code` for Google tokens
- fetches Google user profile
- finds or creates local `app_users`
- upserts `auth_identities(provider=google)`
- creates `mellowcat_web_session` cookie
- if launcher context exists, redirects to:
  - `/launcher-auth?requestId=...`
- otherwise redirects to:
  - `/account?login=success&provider=google`

Error redirect examples:

- `/login?oauth=error&message=access_denied`
- `/login?oauth=error&message=invalid_state`
- `/login?oauth=error&message=missing_code`

## Notes for frontend

Website frontend should now support:

- signup form -> `POST /api/auth/signup`
- login form -> `POST /api/auth/login`
- forgot password form -> `POST /api/auth/forgot-password`
- reset password form -> `POST /api/auth/reset-password`
- account bootstrap -> `GET /api/auth/me`
- logout button -> `POST /api/auth/logout`
- browser launcher handoff completion -> `POST /api/auth/launcher/complete`

Launcher frontend should support:

- start browser login -> `POST /api/auth/launcher/start`
- poll resolve -> `POST /api/auth/launcher/resolve`
- logout launcher session -> `POST /api/auth/launcher/logout`
