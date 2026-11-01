-- One explicitly approved initial organizer. The caller pins the project Ref,
-- verifies the recovery snapshot and replaces this SHA-256 marker in memory.
-- No raw token or recovery/rotation is accepted by this operation.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';
select set_config('app.bootstrap_hash','REPLACE_SHA256_IN_MEMORY',true);
do $$
begin
 if current_user <> 'postgres' or current_database() <> 'postgres' then
  raise exception 'Unexpected maintenance context';
 end if;
 if current_setting('app.bootstrap_hash') !~ '^[0-9a-f]{64}$' then
  raise exception 'Missing valid bootstrap hash';
 end if;
 if (select count(*) from supabase_migrations.schema_migrations) <> 14 or
    (select count(*) from public.event_settings) <> 1 or
    exists(select 1 from public.participants) or exists(select 1 from public.gifts) or
    exists(select 1 from private.access_tokens) or exists(select 1 from private.media_assets) or
    exists(select 1 from private.media_deletions) or exists(select 1 from private.import_requests) or
    exists(select 1 from storage.objects) or exists(select 1 from auth.users) then
  raise exception 'Initial production state changed; do not bootstrap';
 end if;
 perform private.bootstrap_organizer(current_setting('app.bootstrap_hash'),false);
end;
$$;
select jsonb_build_object(
 'active_organizers',(select count(*) from private.access_tokens where access_type='organizer' and revoked_at is null),
 'access_tokens',(select count(*) from private.access_tokens),
 'matches_new_hash',(select count(*)=1 from private.access_tokens where token_hash=decode(current_setting('app.bootstrap_hash'),'hex') and access_type='organizer' and revoked_at is null),
 'participants',(select count(*) from public.participants),
 'gifts',(select count(*) from public.gifts)
) as bootstrap;
commit;
