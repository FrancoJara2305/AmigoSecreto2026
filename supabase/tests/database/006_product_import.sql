begin;
create schema import_test;
grant usage on schema import_test to service_role,anon,authenticated;
create function import_test.ok(condition boolean,label text) returns text language plpgsql set search_path='' as $$
begin if condition is distinct from true then raise exception 'FAILED: %',label; end if; return 'ok - '||label; end; $$;
grant execute on function import_test.ok(boolean,text) to service_role,anon,authenticated;
insert into public.participants(id,name,slug) values('a1000000-0000-4000-8000-000000000001','Import A','import-test-a'),('a1000000-0000-4000-8000-000000000002','Import B','import-test-b');
insert into private.access_tokens(access_type,participant_id,token_hash) values('participant','a1000000-0000-4000-8000-000000000001',decode(repeat('a1',32),'hex'));
select import_test.ok(not has_function_privilege('anon','public.server_prepare_import(text,uuid,text,text,timestamptz)','execute') and
 not has_function_privilege('authenticated','public.server_claim_import(text,text)','execute'),'import authorization/claim RPC server-only');
select import_test.ok((select relrowsecurity from pg_class where oid='private.import_requests'::regclass) and
 not has_table_privilege('anon','private.import_requests','select'),'nonce registry private with RLS');
set local role service_role;
select import_test.ok(public.server_prepare_import(repeat('ff',32),'a1000000-0000-4000-8000-000000000001',repeat('b1',32),repeat('c1',32),clock_timestamp()+interval '25 seconds')->>'status'='401','unknown capability cannot mint transport request');
select import_test.ok(public.server_prepare_import(repeat('a1',32),'a1000000-0000-4000-8000-000000000002',repeat('b1',32),repeat('c1',32),clock_timestamp()+interval '25 seconds')->>'status'='403','foreign participant cannot mint transport request');
select import_test.ok(public.server_prepare_import(repeat('a1',32),'a1000000-0000-4000-8000-000000000001',repeat('b1',32),repeat('c1',32),clock_timestamp()+interval '1 hour')->>'status'='422','long-lived transport envelope rejected');
select import_test.ok(public.server_prepare_import(repeat('a1',32),'a1000000-0000-4000-8000-000000000001',repeat('b1',32),repeat('c1',32),clock_timestamp()+interval '25 seconds')->>'ok'='true','own authorized nonce registered');
select import_test.ok(public.server_claim_import(repeat('c1',32),repeat('b2',32))->>'ok'='false','transport claim bound to canonical URL hash');
select import_test.ok(public.server_claim_import(repeat('c1',32),repeat('b1',32))->>'ok'='true','first valid transport claim succeeds');
select import_test.ok(public.server_claim_import(repeat('c1',32),repeat('b1',32))->>'ok'='false','same nonce cannot authorize another download');
select import_test.ok(public.server_prepare_import(repeat('a1',32),'a1000000-0000-4000-8000-000000000001',repeat('b1',32),repeat('c2',32),clock_timestamp()+interval '25 seconds')->>'ok'='true','next request needs a fresh nonce');
reset role;
update private.access_tokens set revoked_at=clock_timestamp() where token_hash=decode(repeat('a1',32),'hex');
set local role service_role;
select import_test.ok(public.server_claim_import(repeat('c2',32),repeat('b1',32))->>'ok'='false','revocation before claim prevents external download');
select import_test.ok(not exists(select 1 from public.gifts where participant_id='a1000000-0000-4000-8000-000000000001'),'preparing/claiming import never persists a gift');
reset role;
rollback;
