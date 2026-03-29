# Launch Readiness Checklist

This checklist is for taking the current MellowCat launcher stack from working beta to safer real-world release.

## 1. Core auth and commerce

- [x] Email sign-up / login
- [x] Google OAuth
- [x] Launcher browser sign-in
- [x] Password reset
- [x] Email verification
- [x] Payment checkout
- [x] Entitlement -> Install

## 2. Required production env review

### Railway backend

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `MELLOWCAT_ALLOW_FILE_REPOSITORY=false`
- [ ] `MELLOWCAT_ENABLE_DEV_SEEDS=false`
- [ ] `MELLOWCAT_APP_BASE_URL`
- [ ] `MELLOWCAT_WEB_BASE_URL`
- [ ] `MELLOWCAT_PAYMENT_BASE_URL`
- [ ] `MELLOWCAT_PAYMENT_SUCCESS_URL`
- [ ] `MELLOWCAT_PASSWORD_RESET_BASE_URL`
- [ ] `MELLOWCAT_EMAIL_VERIFICATION_BASE_URL`
- [ ] `MELLOWCAT_GOOGLE_CLIENT_ID`
- [ ] `MELLOWCAT_GOOGLE_CLIENT_SECRET`
- [ ] `MELLOWCAT_GOOGLE_REDIRECT_URI`
- [ ] `MELLOWCAT_AUTH_STATE_SECRET`
- [ ] `MELLOWCAT_LEMON_SQUEEZY_API_KEY`
- [ ] `MELLOWCAT_LEMON_SQUEEZY_STORE_ID`
- [ ] `MELLOWCAT_LEMON_SQUEEZY_WEBHOOK_SECRET`
- [ ] `MELLOWCAT_RESEND_API_KEY`
- [ ] `MELLOWCAT_EMAIL_FROM`
- [ ] `MELLOWCAT_EMAIL_REPLY_TO` optional

### Current expected production values

- `MELLOWCAT_WEB_BASE_URL=https://mellowcat.xyz`
- `MELLOWCAT_PAYMENT_BASE_URL=https://mellowcat.xyz/payment`
- `MELLOWCAT_PAYMENT_SUCCESS_URL=https://mellowcat.xyz/payment?status=success`
- `MELLOWCAT_PASSWORD_RESET_BASE_URL=https://mellowcat.xyz/reset-password`
- `MELLOWCAT_EMAIL_VERIFICATION_BASE_URL=https://mellowcat.xyz/verify-email`

If API moves to a custom domain, update:

- `MELLOWCAT_APP_BASE_URL=https://api.mellowcat.xyz`
- `MELLOWCAT_GOOGLE_REDIRECT_URI=https://api.mellowcat.xyz/api/auth/oauth/google/callback`
- Lemon webhook URL -> `https://api.mellowcat.xyz/api/payment/webhook`

## 3. Callback and redirect audit

### Google OAuth

- [ ] Google Cloud client type is `Web application`
- [ ] Authorized JavaScript origin includes `https://mellowcat.xyz`
- [ ] Authorized redirect URI includes backend callback

### Lemon Squeezy

- [ ] Webhook target matches active backend domain
- [ ] Success redirect returns to `https://mellowcat.xyz/payment?status=success`
- [ ] Product variant ids match backend mapping

### Resend

- [ ] Sending domain verified
- [ ] `MELLOWCAT_EMAIL_FROM` uses verified sender
- [ ] Verification and reset emails appear in logs

## 4. Dev fallback review

The following are acceptable for local/dev but should be reviewed before public release:

- `Session Token` manual input in launcher
- `mock://remote`
- seeded dev launcher tokens
- file repository fallback

Recommended production posture:

- keep file repo fallback only for local development
- keep `MELLOWCAT_ALLOW_FILE_REPOSITORY=false` in production
- keep `MELLOWCAT_ENABLE_DEV_SEEDS=false` in production
- hide manual token entry unless API base is localhost or mock
- do not rely on seeded dev tokens outside local/test environments

## 5. Security baseline

- [x] Auth rate limiting
- [x] Payment request rate limiting
- [x] Basic brute-force guard for repeated password login failures
- [x] Structured audit logs for auth and purchases
- [ ] Secret rotation playbook
- [ ] Session expiry policy review
- [ ] Admin incident response notes

## 6. Backup and recovery

### Supabase

- [ ] Enable automated backups
- [ ] Confirm retention window
- [ ] Test restoring to a staging project

### Railway

- [ ] Keep env values documented in a secure password manager
- [ ] Keep last-known-good deploy tag noted
- [ ] Confirm service can be redeployed from GitHub without local machine access

### Resend / Lemon / Google

- [ ] Store keys in one secure system
- [ ] Record who can rotate each credential
- [ ] Record callback URLs and dashboard locations

## 7. Release gate

Good for private beta when:

- auth, payment, install, reset, verification all pass
- production env values are correct
- real emails and callbacks work on live domains

Hold public launch if:

- callback URLs are still mixed between railway.app and final domain
- backup/restore is untested
- auth and payment logs are too sparse to debug production failures
