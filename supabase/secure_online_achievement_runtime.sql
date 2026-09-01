-- PARA V49: trusted online achievement writes.
-- Browser clients remain unable to INSERT/UPDATE player_achievement_progress directly.
-- PARA's authenticated backend calls this RPC with the service-role key after resolving
-- the signed-in PARA Account from its HttpOnly session cookie.

create or replace function public.record_player_achievement_progress(
  target_user_id uuid,
  target_project_id uuid,
  target_achievement_key text,
  target_progress_value bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  def public.achievement_definitions%rowtype;
  existing public.player_achievement_progress%rowtype;
  next_value bigint;
  did_unlock boolean := false;
  newly_unlocked boolean := false;
begin
  if target_user_id is null then
    raise exception 'Target user is required';
  end if;
  if target_progress_value < 0 then
    raise exception 'Progress cannot be negative';
  end if;

  select ad.* into def
  from public.achievement_definitions ad
  join public.projects p on p.id = ad.project_id
  where ad.project_id = target_project_id
    and ad.achievement_key = target_achievement_key
    and ad.status = 'PUBLISHED'
    and p.status = 'PUBLISHED';

  if def.id is null then
    raise exception 'Published achievement not found';
  end if;

  select * into existing
  from public.player_achievement_progress
  where user_id = target_user_id and achievement_id = def.id
  for update;

  next_value := least(
    def.target_value,
    greatest(
      coalesce(existing.progress_value, 0),
      case when def.kind = 'BINARY' then 1 else target_progress_value end
    )
  );
  did_unlock := next_value >= def.target_value;
  newly_unlocked := did_unlock and existing.unlocked_at is null;

  insert into public.player_achievement_progress (
    user_id, achievement_id, progress_value, unlocked_at
  ) values (
    target_user_id,
    def.id,
    next_value,
    case when did_unlock then now() else null end
  )
  on conflict (user_id, achievement_id) do update set
    progress_value = greatest(public.player_achievement_progress.progress_value, excluded.progress_value),
    unlocked_at = coalesce(public.player_achievement_progress.unlocked_at, excluded.unlocked_at),
    updated_at = now();

  return jsonb_build_object(
    'achievement_id', def.id,
    'project_id', def.project_id,
    'achievement_key', def.achievement_key,
    'name', def.name,
    'description', def.description,
    'points', def.points,
    'kind', def.kind,
    'progress', next_value,
    'target', def.target_value,
    'unlocked', did_unlock,
    'newly_unlocked', newly_unlocked,
    'unlocked_at', case when did_unlock then coalesce(existing.unlocked_at, now()) else null end,
    'hidden', def.hidden,
    'icon_path', def.icon_path
  );
end;
$$;

revoke all on function public.record_player_achievement_progress(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.record_player_achievement_progress(uuid, uuid, text, bigint) to service_role;
