# Supabase Backend Plan

## Recommendation

Use Supabase Postgres as the first real database for:

- users
- launcher sessions
- payment handoffs
- payments
- entitlements

Keep the marketplace catalog in JSON for now.

This keeps pricing and product copy easy to edit while moving user and payment state out of `backend/data/db.json`.

## Why this split works

Good first DB candidates:

- auth/session state
- purchase state
- entitlement state

Safe to keep local/JSON a bit longer:

- bundled catalog
- UI copy
- simple product metadata

## First migration target

Replace file-backed storage for:

- `users`
- `handoffs`
- `payments`
- `entitlements`

Keep product catalog reads in:

- [resources/bundled/catalog.json](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/resources/bundled/catalog.json)

## Schema

Apply:

- [backend/sql/supabase-schema.sql](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/backend/sql/supabase-schema.sql)

## Backend refactor direction

Current backend server:

- [backend/src/index.ts](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/backend/src/index.ts)

Repository interfaces for the DB-backed version:

- [backend/src/repositories/types.ts](/C:/Users/User/Desktop/MCP/mellowcat-claude-v2/backend/src/repositories/types.ts)

## Suggested implementation order

1. Add `DATABASE_URL` to Railway
2. Create a Postgres repository layer
3. Replace:
   - `loadDb()`
   - `saveDb()`
   - `findUserByToken()`
   - entitlement lookup/upsert
   - payment handoff create/read
   - payment create/read/update
4. Keep file-backed seed data only for local development
5. Move test tokens into a dev-only bootstrap script or seeded DB rows

## Minimum environment additions now

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional later:

- `DATABASE_URL`

The current backend can switch to Supabase immediately through the REST API without adding a Postgres driver.
