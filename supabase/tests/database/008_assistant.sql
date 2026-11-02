begin;
create schema assistant_test;
grant usage on schema assistant_test to service_role,anon,authenticated;
create function assistant_test.ok(condition boolean,label text) returns text language plpgsql set search_path='' as $$
begin if condition is distinct from true then raise exception 'FAILED: %',label; end if; return 'ok - '||label; end; $$;
create function assistant_test.throws(statement text,expected text,label text) returns text language plpgsql set search_path='' as $$
declare code text; begin begin execute statement; exception when others then get stacked diagnostics code=returned_sqlstate; end;
 if code is distinct from expected then raise exception 'FAILED: % (got %)',label,code; end if; return 'ok - '||label; end; $$;
grant execute on all functions in schema assistant_test to service_role,anon,authenticated;
-- Deterministic counters inside this rollback only.
delete from private.rate_limits;
insert into public.participants(id,name,slug,general_preferences,personal_message) values
 ('a8000000-0000-4000-8000-000000000001','Asistente A','assistant-test-a','Tonos suaves','Mensaje privado de tono'),
 ('a8000000-0000-4000-8000-000000000002','Asistente B','assistant-test-b',null,null);
insert into public.gifts(id,participant_id,position,title,gift_type,details,reference_price,currency) values
 ('b8000000-0000-4000-8000-000000000003','a8000000-0000-4000-8000-000000000001',3,'Libro','object','{}',null,null),
 ('b8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001',1,'Zapatillas','clothing','{"subtype":"footwear","size":"42","size_system":"EU"}',199.9,'PEN'),
 ('b8000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-000000000002',1,'Taza','object','{}',null,null);

select assistant_test.ok(not has_function_privilege('anon','public.server_assistant(uuid)','execute') and
 not has_function_privilege('authenticated','public.server_assistant(uuid)','execute') and
 has_function_privilege('service_role','public.server_assistant(uuid)','execute'),'assistant context/quota RPC server-only');
select assistant_test.ok(not exists(select 1 from pg_proc where proname='server_assistant' and pronargs=2),'single-gift signature removed');
set local role anon;
select assistant_test.throws($q$select public.server_assistant('a8000000-0000-4000-8000-000000000001')$q$,'42501','anonymous visitors cannot spend or read assistant quota');
reset role;

set local role service_role;
select assistant_test.ok(public.server_assistant(null)->>'status'='422','missing participant rejected before any quota');
select assistant_test.throws($q$select private.consume_quota('assistant','global',decode(repeat('11',32),'hex'),86401,4)$q$,'22023','unsupported window still rejected');
select assistant_test.throws($q$select private.consume_quota('assistant','thread',decode(repeat('11',32),'hex'),60,4)$q$,'22023','unknown scope rejected');
select assistant_test.ok(private.consume_quota('upload','token',decode(repeat('99',32),'hex'),60,6)->>'ok'='true','existing operations keep their quotas');

select assistant_test.ok((select r->'participant'->>'general_preferences'='Tonos suaves' and jsonb_array_length(r->'gifts')=2 and
 r->'gifts'->0->>'title'='Zapatillas' and r->'gifts'->1->>'title'='Libro' and r->'gifts'->0->'details'->>'size'='42' and
 r->'gifts'->0->>'id' is null and r->'gifts'->0->>'image_path' is null and r->'participant'->>'name' is null and
 r->'participant'->>'slug' is null and r->'participant'->>'personal_message' is null
 from (select public.server_assistant('a8000000-0000-4000-8000-000000000001') r) x),
 'preferences and own gifts in order, without ids, name, slug, photo or personal message');
select assistant_test.ok((select not (r::text like '%Taza%') from (select public.server_assistant('a8000000-0000-4000-8000-000000000001') r) x),'never another person''s gifts');
select assistant_test.ok(public.server_assistant('a8000000-0000-4000-8000-0000000000ff')->>'status'='404','unknown participant rejected');
select assistant_test.ok((select jsonb_array_length(r->'gifts')=1 and r->'participant'->'general_preferences'='null'::jsonb
 from (select public.server_assistant('a8000000-0000-4000-8000-000000000002') r) x),'person without preferences keeps own gifts only');

select public.server_assistant('a8000000-0000-4000-8000-000000000002') from generate_series(1,6);
select assistant_test.ok((select r->>'status'='429' and (r->>'retry_after')::int between 1 and 60
 from (select public.server_assistant('a8000000-0000-4000-8000-000000000001') r) x),'eleventh question in a minute denied with wait');
select assistant_test.ok((select request_count from private.rate_limits where operation='assistant' and scope='global' and window_seconds=60)=11,'every attempt counts globally, including missing contexts and denials');
select assistant_test.ok((select request_count from private.rate_limits where operation='assistant' and scope='global' and window_seconds=86400)=10,'minute denial spends no daily budget');

reset role;
delete from private.rate_limits where operation='assistant' and scope='global' and window_seconds=60;
update private.rate_limits set request_count=200 where operation='assistant' and scope='global' and window_seconds=86400;
set local role service_role;
select assistant_test.ok((select r->>'status'='429' and (r->>'retry_after')::int between 1 and 86400
 from (select public.server_assistant('a8000000-0000-4000-8000-000000000001') r) x),'daily cap stops provider calls until the next UTC day');
select assistant_test.ok(private.operation_quota('mutation',repeat('41',32))->>'ok'='true','editing quota independent from exhausted assistant budget');
reset role;
rollback;
