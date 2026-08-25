-- PARA commerce readiness schema. Apply before enabling Stripe test-mode checkout.
-- Live charges remain disabled by the consumer gateway.
create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references auth.users(id) on delete restrict,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  currency text not null default 'usd',
  gross_amount bigint not null check (gross_amount >= 0),
  status text not null default 'pending' check (status in ('pending','paid','refunded','disputed','cancelled')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.store_entitlements (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  order_id uuid references public.store_orders(id) on delete restrict,
  status text not null default 'active' check (status in ('active','revoked','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_user_id, project_id)
);
alter table public.store_orders enable row level security;
alter table public.store_entitlements enable row level security;
create policy "buyers read own orders" on public.store_orders for select to authenticated using (auth.uid() = buyer_user_id);
create policy "buyers read own entitlements" on public.store_entitlements for select to authenticated using (auth.uid() = buyer_user_id);
-- Writes intentionally have no client policy. Checkout/webhook server code owns writes.
