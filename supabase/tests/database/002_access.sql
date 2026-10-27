-- Local/disposable only. All lifecycle changes, including recovery, roll back.
begin;
create schema access_test;
grant usage on schema access_test to anon,authenticated,service_role;
create function access_test.ok(condition boolean,label text) returns text
language plpgsql set search_path='' as $$ begin
  if condition is distinct from true then raise exception 'FAILED: %',label; end if;
  return 'ok - '||label;
end; $$;
create function access_test.throws(statement text,expected text,label text) returns text
language plpgsql set search_path='' as $$ declare code text; begin
  begin execute statement; exception when others then get stacked diagnostics code=returned_sqlstate; end;
  if code is distinct from expected then raise exception 'FAILED: % (expected %, got %)',label,expected,code; end if;
  return 'ok - '||label;
end; $$;
grant execute on all functions in schema access_test to anon,authenticated,service_role;

insert into public.participants(id,name,slug) values
 ('70000000-0000-4000-8000-000000000001','Test acceso A','test-acceso-a'),
 ('70000000-0000-4000-8000-000000000002','Test acceso B','test-acceso-b');
-- This owner-only recovery is inside the test transaction; any real local organizer
-- is restored by ROLLBACK, so run tests in an isolated local development environment.
select private.bootstrap_organizer(repeat('a',64),true) is not null as bootstrap_created;
select access_test.throws($q$select private.bootstrap_organizer(repeat('b',64),false)$q$,'55000','bootstrap refuses an initialized organizer');
select access_test.ok(private.require_access(repeat('a',64))->>'access_type'='organizer','bootstrap hash validates');
select access_test.ok(not has_function_privilege('anon','public.server_access(text,text,uuid,text,timestamptz)','execute')
  and not has_function_privilege('authenticated','public.server_access(text,text,uuid,text,timestamptz)','execute'), 'RPC denies both client roles');
select access_test.ok(not has_function_privilege('service_role','private.bootstrap_organizer(text,boolean)','execute'),'HTTP backend cannot bootstrap or recover organizer');
set local role anon;
select access_test.throws($q$select public.server_access('validate_access',repeat('a',64))$q$,'42501','anon cannot invoke capability RPC');
reset role;
set local role authenticated;
select access_test.throws($q$select public.server_access('validate_access',repeat('a',64))$q$,'42501','authenticated cannot invoke capability RPC');
reset role;
set local role service_role;
select access_test.throws($q$select private.bootstrap_organizer(repeat('b',64),true)$q$,'42501','service role cannot recover through private helper');
select access_test.ok(public.server_access('validate_access',repeat('a',64))->>'ok'='true','server validates organizer');
select access_test.ok(public.server_access('issue_participant_link',repeat('a',64),'70000000-0000-4000-8000-000000000001',repeat('b',64))->>'ok'='true','organizer issues personal token');
select access_test.ok(public.server_access('validate_access',repeat('b',64))#>>'{access,participant_slug}'='test-acceso-a','personal context is scoped to its participant');
select access_test.ok(public.server_access('validate_access',repeat('b',64),'70000000-0000-4000-8000-000000000002')->>'status'='403','personal token cannot target another participant');
select access_test.ok(public.server_access('issue_participant_link',repeat('b',64),'70000000-0000-4000-8000-000000000002',repeat('c',64))->>'status'='403','personal token cannot issue links');
select access_test.ok(public.server_access('revoke_participant_link',repeat('b',64),'70000000-0000-4000-8000-000000000001')->>'status'='403','personal token cannot revoke links');
select access_test.ok(public.server_access('rotate_organizer_link',repeat('b',64),null,repeat('c',64))->>'status'='403','personal token cannot become organizer');
select access_test.ok(public.server_access('validate_access',repeat('f',64))->>'status'='401','unknown hash unavailable');
select access_test.ok(public.server_access('issue_participant_link',repeat('a',64),'70000000-0000-4000-8000-000000000099',repeat('c',64))->>'status'='404','nonexistent participant rejected');
select access_test.ok(public.server_access('issue_participant_link',repeat('a',64),'70000000-0000-4000-8000-000000000001',repeat('c',64),clock_timestamp()-interval '1 minute')->>'status'='422','past expiry rejected');
select access_test.ok(public.server_access('issue_participant_link',repeat('a',64),'70000000-0000-4000-8000-000000000001',repeat('a',64))->>'status'='409','used hash cannot replace a link');
select access_test.ok(public.server_access('validate_access',repeat('b',64))->>'ok'='true','failed replacement preserves previous access');
select access_test.ok(public.server_access('issue_participant_link',repeat('a',64),'70000000-0000-4000-8000-000000000001',repeat('c',64))->>'ok'='true','replacement issued atomically');
select access_test.ok(public.server_access('validate_access',repeat('b',64))->>'status'='401','replaced link immediately invalid');
select access_test.ok(public.server_access('validate_access',repeat('c',64))->>'ok'='true','replacement token validates');
select access_test.ok(public.server_access('revoke_participant_link',repeat('a',64),'70000000-0000-4000-8000-000000000001')->>'revoked'='1','organizer revokes personal access');
select access_test.ok(public.server_access('validate_access',repeat('c',64))->>'status'='401','open tab token fails after revocation');
select access_test.ok(public.server_access('revoke_participant_link',repeat('a',64),'70000000-0000-4000-8000-000000000001')->>'revoked'='0','revoke without live token is idempotent');
select access_test.ok(not (public.server_access('validate_access',repeat('a',64))::text like '%token_hash%'),'response never includes hash');
select access_test.ok(public.server_access('bootstrap',repeat('a',64))->>'status'='422','RPC has no bootstrap action');
reset role;
insert into private.access_tokens(access_type,participant_id,token_hash,created_at,expires_at)
 values('participant','70000000-0000-4000-8000-000000000002',decode(repeat('d',64),'hex'),clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
set local role service_role;
select access_test.ok(public.server_access('validate_access',repeat('d',64))->>'status'='401','expired token unavailable');
select access_test.ok(public.server_access('rotate_organizer_link',repeat('a',64),null,repeat('e',64))->>'ok'='true','organizer rotates own token');
select access_test.ok(public.server_access('validate_access',repeat('a',64))->>'status'='401','previous organizer token invalid');
select access_test.ok(public.server_access('validate_access',repeat('e',64))->>'ok'='true','new organizer token valid');
reset role;
select private.bootstrap_organizer(repeat('9',64),true) is not null as recovery_created;
select access_test.ok(private.require_access(repeat('9',64))->>'access_type'='organizer','owner recovery grants organizer access');
select access_test.throws($q$select private.require_access(repeat('e',64))$q$,'28000','recovery revokes lost organizer link');
select access_test.ok((select count(*)=1 from private.access_tokens where access_type='organizer' and revoked_at is null),'one live organizer after rotation and recovery');

-- Move quotas near their limit without relying on slow repeated requests.
insert into private.rate_limits(key_hash,operation,window_start,request_count,expires_at)
 values(decode(repeat('8',64),'hex'),'access',date_trunc('minute',clock_timestamp()),30,date_trunc('minute',clock_timestamp())+interval '1 minute')
 on conflict(key_hash,operation,window_start) do update set request_count=30;
set local role service_role;
select access_test.ok(public.server_access('validate_access',repeat('8',64))->>'status'='429','per-token limit applies before credential lookup');
reset role;
select access_test.ok((select request_count=31 from private.rate_limits where key_hash=decode(repeat('8',64),'hex') and window_start=date_trunc('minute',clock_timestamp())),'failed request consumes persistent quota');
update private.rate_limits set request_count=120 where key_hash=decode(repeat('00',32),'hex') and operation='access' and window_start=date_trunc('minute',clock_timestamp());
set local role service_role;
select access_test.ok(public.server_access('validate_access',repeat('9',64))->>'status'='429','global quota also bounds rotating token attempts');
reset role;
rollback;
