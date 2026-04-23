-- Supabase immediate hardening
-- Purpose:
-- 1) Enable RLS on all application tables
-- 2) Revoke client roles (anon/authenticated) from sensitive tables
-- 3) Allow minimal read-only access for public storefront tables

begin;

-- 1) Enable RLS
alter table if exists public.app_users enable row level security;
alter table if exists public.launcher_sessions enable row level security;
alter table if exists public.web_sessions enable row level security;
alter table if exists public.password_credentials enable row level security;
alter table if exists public.auth_identities enable row level security;
alter table if exists public.launcher_auth_requests enable row level security;
alter table if exists public.password_reset_requests enable row level security;
alter table if exists public.email_verification_requests enable row level security;
alter table if exists public.products enable row level security;
alter table if exists public.product_variants enable row level security;
alter table if exists public.entitlements enable row level security;
alter table if exists public.payment_handoffs enable row level security;
alter table if exists public.payments enable row level security;

-- 2) Revoke sensitive table access from anon/authenticated
revoke all on table public.app_users from anon, authenticated;
revoke all on table public.launcher_sessions from anon, authenticated;
revoke all on table public.web_sessions from anon, authenticated;
revoke all on table public.password_credentials from anon, authenticated;
revoke all on table public.auth_identities from anon, authenticated;
revoke all on table public.launcher_auth_requests from anon, authenticated;
revoke all on table public.password_reset_requests from anon, authenticated;
revoke all on table public.email_verification_requests from anon, authenticated;
revoke all on table public.entitlements from anon, authenticated;
revoke all on table public.payment_handoffs from anon, authenticated;
revoke all on table public.payments from anon, authenticated;

-- Lock down products tables first, then re-grant minimal select
revoke all on table public.products from anon, authenticated;
revoke all on table public.product_variants from anon, authenticated;

-- 3) Minimal public storefront permissions
grant select on table public.products to anon, authenticated;
grant select on table public.product_variants to anon, authenticated;

drop policy if exists products_public_read on public.products;
create policy products_public_read
on public.products
for select
to anon, authenticated
using (visibility = 'public');

drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read
on public.product_variants
for select
to anon, authenticated
using (active = true);

commit;

