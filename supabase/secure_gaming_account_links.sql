-- PARA V39: securely persist gaming-account links owned by the signed-in PARA user.
-- Safe to run on an existing project: the table/constraints/policies are created or refreshed idempotently.

create table if not exists public.gaming_accounts (
  id uuid primary key default gen_random_uuid(),
  para_user_id uuid not null,
  provider text not null,
  provider_user_id text not null,
  display_name text,
  avatar_url text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  connected_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gaming_accounts'::regclass
      and conname = 'gaming_accounts_para_user_id_provider_key'
  ) then
    alter table public.gaming_accounts
      add constraint gaming_accounts_para_user_id_provider_key unique (para_user_id, provider);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gaming_accounts'::regclass
      and conname = 'gaming_accounts_provider_provider_user_id_key'
  ) then
    alter table public.gaming_accounts
      add constraint gaming_accounts_provider_provider_user_id_key unique (provider, provider_user_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gaming_accounts'::regclass
      and conname = 'gaming_accounts_para_user_id_fkey'
  ) then
    alter table public.gaming_accounts
      add constraint gaming_accounts_para_user_id_fkey
      foreign key (para_user_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

alter table public.gaming_accounts enable row level security;

revoke all on table public.gaming_accounts from anon;
revoke all on table public.gaming_accounts from authenticated;
grant select, insert, update, delete on table public.gaming_accounts to authenticated;

drop policy if exists gaming_accounts_select_own on public.gaming_accounts;
drop policy if exists gaming_accounts_insert_own on public.gaming_accounts;
drop policy if exists gaming_accounts_update_own on public.gaming_accounts;
drop policy if exists gaming_accounts_delete_own on public.gaming_accounts;

create policy gaming_accounts_select_own
on public.gaming_accounts
for select
to authenticated
using ((select auth.uid()) = para_user_id);

create policy gaming_accounts_insert_own
on public.gaming_accounts
for insert
to authenticated
with check ((select auth.uid()) = para_user_id);

create policy gaming_accounts_update_own
on public.gaming_accounts
for update
to authenticated
using ((select auth.uid()) = para_user_id)
with check ((select auth.uid()) = para_user_id);

create policy gaming_accounts_delete_own
on public.gaming_accounts
for delete
to authenticated
using ((select auth.uid()) = para_user_id);
