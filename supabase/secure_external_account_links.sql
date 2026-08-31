-- PARA V41: Google / YouTube account-link metadata.
-- OAuth access/refresh tokens are intentionally NOT stored in this public table.

create table if not exists public.external_accounts (
  id uuid primary key default gen_random_uuid(),
  para_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  email text,
  display_name text,
  avatar_url text,
  youtube_channel_id text,
  youtube_channel_title text,
  youtube_custom_url text,
  youtube_subscriber_count bigint,
  youtube_view_count bigint,
  youtube_video_count bigint,
  youtube_hidden_subscriber_count boolean,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_accounts_provider_check check (provider in ('google')),
  constraint external_accounts_para_user_provider_key unique (para_user_id, provider),
  constraint external_accounts_provider_identity_key unique (provider, provider_user_id)
);

alter table public.external_accounts enable row level security;

revoke all on table public.external_accounts from anon;
grant select, insert, update, delete on table public.external_accounts to authenticated;

drop policy if exists external_accounts_select_own on public.external_accounts;
create policy external_accounts_select_own
  on public.external_accounts for select
  to authenticated
  using (auth.uid() = para_user_id);

drop policy if exists external_accounts_insert_own on public.external_accounts;
create policy external_accounts_insert_own
  on public.external_accounts for insert
  to authenticated
  with check (auth.uid() = para_user_id);

drop policy if exists external_accounts_update_own on public.external_accounts;
create policy external_accounts_update_own
  on public.external_accounts for update
  to authenticated
  using (auth.uid() = para_user_id)
  with check (auth.uid() = para_user_id);

drop policy if exists external_accounts_delete_own on public.external_accounts;
create policy external_accounts_delete_own
  on public.external_accounts for delete
  to authenticated
  using (auth.uid() = para_user_id);
