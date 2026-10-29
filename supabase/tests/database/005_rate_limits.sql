begin;
create schema rate_test;
grant usage on schema rate_test to anon,authenticated,service_role;
create function rate_test.ok(condition boolean,label text) returns text language plpgsql set search_path='' as $$
begin if condition is distinct from true then raise exception 'FAILED: %',label; end if; return 'ok - '||label; end; $$;
create function rate_test.throws(statement text,expected text,label text) returns text language plpgsql set search_path='' as $$
declare code text; begin begin execute statement; exception when others then get stacked diagnostics code=returned_sqlstate; end;
 if code is distinct from expected then raise exception 'FAILED: % (got %)',label,code; end if; return 'ok - '||label; end; $$;
grant execute on all functions in schema rate_test to anon,authenticated,service_role;
-- Isolated rollback: do not let previous local traffic affect deterministic quota tests.
delete from private.rate_limits;
select rate_test.ok(not has_function_privilege('anon','public.server_rate_limit(text,text)','execute') and
 not has_function_privilege('authenticated','public.server_rate_limit(text,text)','execute'),'ingress quota RPC server-only');
select rate_test.ok(not has_function_privilege('anon','public.server_rate_limits_cleanup(integer,boolean)','execute') and
 not has_function_privilege('authenticated','public.server_rate_limits_cleanup(integer,boolean)','execute'),'quota maintenance RPC server-only');
select rate_test.ok(not has_function_privilege('anon','private.operation_quota(text,text)','execute'),'quota helper inaccessible to client roles');
set local role anon;
select rate_test.throws($q$select public.server_rate_limit('request',null)$q$,'42501','anonymous cannot choose/reset quota identity');
reset role;
set local role authenticated;
select rate_test.throws($q$select public.server_rate_limits_cleanup(100,false)$q$,'42501','signed-in role cannot clean counters');
reset role;
set local role service_role;
select rate_test.ok(private.operation_quota('unknown',repeat('11',32))->>'status'='422','operation allowlist');
select rate_test.ok(private.operation_quota('access','raw-token')->>'status'='422','only hashes accepted in quota helper');
select rate_test.throws($q$select private.consume_quota('access','token',decode(repeat('11',32),'hex'),59,30)$q$,'22023','unsupported window rejected');
select rate_test.throws($q$select private.consume_quota('access','token',decode(repeat('11',32),'hex'),60,0)$q$,'22023','nonpositive quota rejected');
select rate_test.ok(public.server_rate_limit('request','forged-raw-IP')->>'status'='422','ingress accepts only HMAC-format identity');

select private.operation_quota('access',repeat('11',32)) from generate_series(1,30);
select rate_test.ok((select request_count=30 from private.rate_limits where operation='access' and scope='token' and key_hash=decode(repeat('11',32),'hex')),'exact access allowance consumed once per call');
select rate_test.ok(private.operation_quota('access',repeat('11',32))->>'status'='429','31st access attempt denied');
select private.operation_quota('access',repeat('11',32)) from generate_series(1,5);
select rate_test.ok((select request_count=31 from private.rate_limits where operation='access' and scope='token' and key_hash=decode(repeat('11',32),'hex')),'denied counter saturates without overflow');
select rate_test.ok((private.operation_quota('access',repeat('11',32))->>'retry_after')::int between 1 and 60,'minute denial includes remaining seconds');

-- Separate scopes and durations cannot collide even with identical key bytes.
select private.consume_quota('upload','token',decode(repeat('22',32),'hex'),60,6);
select private.consume_quota('upload','token',decode(repeat('22',32),'hex'),3600,10);
select private.consume_quota('upload','network',decode(repeat('22',32),'hex'),60,20);
select rate_test.ok((select count(*)=3 from private.rate_limits where operation='upload' and key_hash=decode(repeat('22',32),'hex')),'minute/hour/network buckets independent');
reset role;
insert into private.rate_limits(key_hash,operation,scope,window_seconds,window_start,expires_at,request_count)
 values(decode(repeat('33',32),'hex'),'upload','token',3600,date_trunc('hour',clock_timestamp()),date_trunc('hour',clock_timestamp())+interval '1 hour',10),
 (decode(repeat('44',32),'hex'),'import','token',3600,date_trunc('hour',clock_timestamp()),date_trunc('hour',clock_timestamp())+interval '1 hour',30);
set local role service_role;
select rate_test.ok(private.operation_quota('upload',repeat('33',32))->>'status'='429','10 uploads per hour enforced across minute windows');
select rate_test.ok((private.operation_quota('upload',repeat('33',32))->>'retry_after')::int between 1 and 3600,'hour denial reports remaining hour, not fixed minute');
reset role;
update private.rate_limits set request_count=2147483647 where operation='upload' and scope='token' and key_hash=decode(repeat('33',32),'hex');
set local role service_role;
select rate_test.ok(private.operation_quota('upload',repeat('33',32))->>'status'='429','pre-existing maximum integer counters saturate safely');
select rate_test.ok((private.operation_quota('upload',repeat('33',32))->>'retry_after')::int>=
 (private.consume_quota('upload','token',decode(repeat('33',32),'hex'),60,6)->>'retry_after')::int,'overlapping minute/hour denial reports longest wait');
select rate_test.ok(private.operation_quota('import',repeat('44',32))->>'status'='429','30 imports per hour prepared without enabling importer');
select private.operation_quota('import',repeat('55',32)) from generate_series(1,5);
select rate_test.ok(private.operation_quota('import',repeat('55',32))->>'status'='429','sixth import in minute denied');

reset role;
update private.rate_limits set request_count=120 where operation='access' and scope='global';
set local role service_role;
select rate_test.ok(private.operation_quota('access',repeat('66',32))->>'status'='429','global cap bounds rotating hashes');
select rate_test.ok(not exists(select 1 from private.rate_limits where key_hash=decode(repeat('66',32),'hex')),'global rejection creates no per-token cardinality');
select public.server_rate_limit('failure',repeat('77',32)) from generate_series(1,20);
select rate_test.ok(public.server_rate_limit('request',repeat('77',32))->>'status'='429','20 failures block same verified network before body');
select rate_test.ok(public.server_rate_limit('request',repeat('88',32))->>'ok'='true','another network remains usable');
reset role;
update private.rate_limits set request_count=120 where operation='failed_access' and scope='global';
set local role service_role;
select rate_test.ok(public.server_rate_limit('request',null)->>'status'='429','no verified network identity uses bounded global fallback');

reset role;
insert into private.rate_limits(key_hash,operation,scope,window_seconds,window_start,expires_at)
 select decode(md5('expired-'||n)||md5('expired-key-'||n),'hex'),'mutation','token',60,
 clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour' from generate_series(1,40) n;
set local role service_role;
select rate_test.ok(public.server_rate_limits_cleanup(7,true)->>'candidates'='7','maintenance dry run bounded');
select rate_test.ok((select count(*)=40 from private.rate_limits where expires_at<clock_timestamp()),'dry run removes no expired rows');
select rate_test.ok(public.server_rate_limits_cleanup(7,false)->>'removed'='7','maintenance delete bounded to selected batch');
select rate_test.ok((select count(*)=33 from private.rate_limits where expires_at<clock_timestamp()),'maintenance leaves next batch for retry');
select rate_test.ok((select count(*)>=1 from private.rate_limits where window_seconds=3600 and expires_at>clock_timestamp()),'active hourly counters survive cleanup');
select rate_test.throws($q$select public.server_rate_limits_cleanup(5001,false)$q$,'22023','unbounded cleanup rejected');
select private.operation_quota('mutation',repeat('99',32));
select rate_test.ok(not exists(select 1 from private.rate_limits where expires_at<=clock_timestamp()),'new global window prunes expired buckets automatically');
reset role;
rollback;
