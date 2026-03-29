create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists app_users
  add column if not exists email_verified_at timestamptz;

create table if not exists launcher_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  source text not null default 'launcher',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists launcher_sessions_user_id_idx
  on launcher_sessions(user_id);

create table if not exists web_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  source text not null default 'web',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists web_sessions_user_id_idx
  on web_sessions(user_id);

create table if not exists password_credentials (
  user_id uuid primary key references app_users(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);

create index if not exists auth_identities_user_id_idx
  on auth_identities(user_id);

create table if not exists launcher_auth_requests (
  id uuid primary key default gen_random_uuid(),
  request_token_hash text not null unique,
  user_id uuid references app_users(id) on delete cascade,
  source text not null default 'launcher',
  expires_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists launcher_auth_requests_user_id_idx
  on launcher_auth_requests(user_id);

create table if not exists password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_requests_user_id_idx
  on password_reset_requests(user_id);

create table if not exists email_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_verification_requests_user_id_idx
  on email_verification_requests(user_id);

create table if not exists products (
  id text primary key,
  slug text not null unique,
  name text not null,
  summary text not null,
  description text,
  visibility text not null default 'public',
  distribution_type text not null,
  price_amount numeric(10,2),
  price_currency text,
  latest_version text not null,
  checkout_enabled boolean not null default true,
  download_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  provider text not null,
  provider_variant_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, provider, provider_variant_id)
);

create index if not exists product_variants_product_id_idx
  on product_variants(product_id);

create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  status text not null,
  source text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists entitlements_user_id_idx
  on entitlements(user_id);

create table if not exists payment_handoffs (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references app_users(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  source text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payment_handoffs_user_id_idx
  on payment_handoffs(user_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  provider text not null,
  provider_checkout_id text,
  provider_session_id text,
  status text not null,
  paid_at timestamptz,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_user_id_idx
  on payments(user_id);

create index if not exists payments_provider_session_id_idx
  on payments(provider_session_id);

insert into products (
  id,
  slug,
  name,
  summary,
  distribution_type,
  price_amount,
  price_currency,
  latest_version,
  checkout_enabled,
  download_enabled
)
values
  (
    'youtube-publish-mcp',
    'youtube-publish-mcp',
    'YouTube Publisher',
    'Paid delivery module that connects checkout, entitlement, and YouTube publishing access.',
    'paid',
    19.00,
    'USD',
    '0.2.7',
    true,
    true
  ),
  (
    'filesystem-tools',
    'filesystem-tools',
    'Filesystem Tools',
    'Remote-installable starter MCP used to validate owned/install flows.',
    'paid',
    5.00,
    'USD',
    '0.1.0',
    true,
    true
  )
on conflict (id) do update
set
  name = excluded.name,
  summary = excluded.summary,
  distribution_type = excluded.distribution_type,
  price_amount = excluded.price_amount,
  price_currency = excluded.price_currency,
  latest_version = excluded.latest_version,
  checkout_enabled = excluded.checkout_enabled,
  download_enabled = excluded.download_enabled,
  updated_at = now();
