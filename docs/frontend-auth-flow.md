# Frontend Auth Flow

This is the implementation guide for the web frontend and launcher frontend once real account auth replaces dev tokens.

## Web frontend pages

Recommended pages:

- `/login`
- `/signup`
- `/verify-email`
- `/forgot-password`
- `/reset-password`
- `/account`
- `/launcher-auth`

## Web frontend responsibilities

### 1. Sign-up page

Collect:

- email
- password
- optional display name

Submit to:

- `POST /api/auth/signup`

States to support:

- success: verification email sent
- email already exists
- weak password
- generic server error

### 2. Login page

Support:

- email/password login
- Google login

Email/password:

- `POST /api/auth/login`

Google:

- button opens `GET /api/auth/oauth/google/start`
- preserve launcher context query params when present:
  - `source=launcher`
  - `launcherRequest=...`

If `source=launcher` or `launcherRequest` is present in query params:

- keep that context through the login flow
- after successful login, redirect to `/launcher-auth?requestId=...`

### 3. Launcher auth completion page

Page:

- `/launcher-auth`

Purpose:

- tell the user that launcher sign-in succeeded
- optionally poll backend if needed
- show:
  - `You can return to MellowCat now.`

The launcher itself will resolve the request through backend API.

Google OAuth callback behavior from backend:

- launcher context present -> backend redirects to `/launcher-auth?requestId=...`
- normal web login -> backend redirects to `/account?login=success&provider=google`

### 4. Account page

Show:

- current email
- display name
- linked providers
- purchases or ownership summary later

Actions:

- logout
- change password later
- connect Google later if account started as password-only

## Launcher frontend responsibilities

### 1. Replace manual token entry as the main path

Current `Session Token` input can remain as dev-only fallback.

Primary action should become:

- `Sign in with browser`

That should:

1. call `POST /api/auth/launcher/start`
2. get `requestId` + `loginUrl`
3. open browser to that login URL
4. poll `POST /api/auth/launcher/resolve`
5. once resolved, store returned launcher token
6. refresh `GET /auth/session`

### 2. Keep logout simple

Launcher logout should:

- clear local secret token
- call `POST /api/auth/launcher/logout` later if implemented
- refresh UI to logged-out state

### 3. Show clear account states

Support these states:

- logged out
- waiting for browser login
- resolving launcher login
- logged in
- login failed

Suggested copy:

- `Waiting for browser sign-in...`
- `Finalizing your launcher session...`
- `Signed in as creator@mellowcat.dev`

## Frontend API expectations

### Web

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/verify-email`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/oauth/google/start`
- `GET /api/auth/oauth/google/callback`

### Launcher

- `POST /api/auth/launcher/start`
- `POST /api/auth/launcher/resolve`
- `GET /auth/session`
- `GET /auth/entitlements`
- `GET /catalog`

## Query params to preserve

The web frontend should preserve launcher context when present:

- `source=launcher`
- `launcherRequest=authreq_123`

Do not drop these during redirects between login/signup/auth pages.

## Error handling

The web frontend should show friendly messages for:

- invalid email
- wrong password
- account not found
- email not verified
- expired verification link
- expired launcher auth request
- OAuth canceled

The launcher frontend should show friendly messages for:

- browser login expired
- launcher session could not be resolved
- server unavailable
- account login succeeded but launcher handoff failed

## Recommended initial split of work

### Backend first

- signup/login/logout
- launcher auth handoff start/resolve
- session token issue/revoke
- Google OAuth callback handling

### Web frontend next

- login/signup/verification pages
- launcher-auth completion page
- Google sign-in button

### Launcher frontend after that

- replace token-first flow with browser-first flow
- polling-based auth resolve flow
- dev token input hidden behind developer mode later

## Important note for frontend AI

Do not build the launcher browser sign-in flow around raw bearer tokens in query strings.

The launcher should only receive:

- request ids
- short-lived auth handoff tokens

The final launcher access token must come from backend API exchange, not directly from browser URL.
