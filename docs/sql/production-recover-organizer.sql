-- Reviewed recovery template; not executed merely by preparing this file.
-- The caller pins production Ref and requires approval to revoke organizer access.
-- Both markers are replaced in memory; only hashes reach PostgreSQL.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';
select set_config('app.recovery_new_hash','REPLACE_NEW_SHA256',true);
select set_config('app.recovery_expected_digest','REPLACE_EXPECTED_ORGANIZER_DIGEST',true);
do $$
declare observed_digest text;
begin
 if current_user <> 'postgres' or current_database() <> 'postgres' then
  raise exception 'Unexpected maintenance context';
 end if;
 if current_setting('app.recovery_new_hash') !~ '^[0-9a-f]{64}$' or
    current_setting('app.recovery_expected_digest') !~ '^[0-9a-f]{64}$' then
  raise exception 'Missing valid recovery hashes';
 end if;
 perform pg_advisory_xact_lock(20261225,7);
 select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text,'UTF8')),'hex')
  into observed_digest from private.access_tokens t where access_type='organizer';
 if observed_digest <> current_setting('app.recovery_expected_digest') then
  raise exception 'Organizer state changed after review; recovery stopped';
 end if;
 perform private.bootstrap_organizer(current_setting('app.recovery_new_hash'),true);
end;
$$;
select jsonb_build_object(
 'unrevoked_organizers',(select count(*) from private.access_tokens where access_type='organizer' and revoked_at is null),
 'replacement_active',(select count(*)=1 from private.access_tokens where access_type='organizer' and revoked_at is null and token_hash=decode(current_setting('app.recovery_new_hash'),'hex'))
) as recovery;
commit;
