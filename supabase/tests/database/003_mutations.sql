-- Isolated LOCAL transaction. No fixture, token or profile edit survives ROLLBACK.
begin;
create schema mutation_test;
grant usage on schema mutation_test to anon,authenticated,service_role;
create function mutation_test.ok(condition boolean,label text) returns text language plpgsql set search_path='' as $$
begin if condition is distinct from true then raise exception 'FAILED: %',label; end if; return 'ok - '||label; end; $$;
create function mutation_test.throws(statement text,expected text,label text) returns text language plpgsql set search_path='' as $$
declare code text; begin
  begin execute statement; exception when others then get stacked diagnostics code=returned_sqlstate; end;
  if code is distinct from expected then raise exception 'FAILED: % (got %)',label,code; end if;
  return 'ok - '||label;
end; $$;
grant execute on all functions in schema mutation_test to anon,authenticated,service_role;
create table mutation_test.saved(id uuid);
grant select,insert on mutation_test.saved to service_role;
insert into public.participants(id,name,slug) values
 ('81000000-0000-4000-8000-000000000001','Mutación A','mutacion-test-a'),
 ('81000000-0000-4000-8000-000000000002','Mutación B','mutacion-test-b');
insert into private.access_tokens(access_type,participant_id,token_hash) values
 ('participant','81000000-0000-4000-8000-000000000001',decode(repeat('12',32),'hex'));
select private.bootstrap_organizer(repeat('13',32),true) is not null as temporary_organizer;
select mutation_test.ok(not has_function_privilege('anon','public.server_mutate(text,text,uuid,integer,smallint,uuid,jsonb)','execute') and
 not has_function_privilege('authenticated','public.server_mutate(text,text,uuid,integer,smallint,uuid,jsonb)','execute'),'mutation RPC not executable by client roles');
set local role anon;
select mutation_test.throws($q$select public.server_mutate('update_profile',repeat('12',32),'81000000-0000-4000-8000-000000000001',1,p_payload:='{"personal_message":"hack"}')$q$,'42501','direct anon mutation RPC denied');
reset role;
set local role service_role;
select mutation_test.ok(public.server_mutate('update_profile',repeat('ff',32),'81000000-0000-4000-8000-000000000001',1,p_payload:='{"personal_message":"hack"}')->>'status'='401','unknown capability cannot mutate');
select mutation_test.ok(public.server_mutate('update_profile',repeat('12',32),'81000000-0000-4000-8000-000000000002',1,p_payload:='{"personal_message":"hack"}')->>'status'='403','personal capability cannot edit another profile');
select mutation_test.ok(public.server_mutate('update_profile',repeat('12',32),'81000000-0000-4000-8000-000000000001',1,p_payload:='{"personal_message":"Hola","general_preferences":"Colores neutros"}')#>>'{participant,version}'='2','profile edit increments version');
select mutation_test.ok(public.server_mutate('update_profile',repeat('12',32),'81000000-0000-4000-8000-000000000001',1,p_payload:='{"personal_message":"stale"}')->>'status'='409','stale profile edit conflicts');
select mutation_test.ok((select personal_message='Hola' from public.participants where slug='mutacion-test-a'),'stale profile edit preserves current data');
select mutation_test.ok(public.server_mutate('update_profile',repeat('12',32),'81000000-0000-4000-8000-000000000001',2,p_payload:='{"name":"Escalation"}')->>'status'='422','profile field allowlist prevents overposting');
select mutation_test.ok(public.server_mutate('update_profile',repeat('12',32),'81000000-0000-4000-8000-000000000001',2,p_payload:='{"personal_message":{"nested":true}}')->>'status'='422','SQL rejects nested text values');
select mutation_test.ok(public.server_mutate('update_profile',repeat('13',32),'81000000-0000-4000-8000-000000000002',1,p_payload:='{"personal_message":"Organizador"}')->>'ok'='true','organizer can edit participant profile');

select mutation_test.ok(public.server_mutate('create_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',p_position:=1::smallint,p_payload:='{"title":"Libro","gift_type":"object"}')#>>'{gift,version}'='1','create requires only title and gift type');
insert into mutation_test.saved select id from public.gifts where participant_id='81000000-0000-4000-8000-000000000001' and position=1;
select mutation_test.ok(public.server_mutate('create_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',p_position:=1::smallint,p_payload:='{"title":"Overwrite","gift_type":"object"}')->>'status'='409','duplicate create never overwrites occupied position');
select mutation_test.ok((select title='Libro' from public.gifts where id=(select id from mutation_test.saved)),'duplicate create leaves original gift intact');
select mutation_test.ok(public.server_mutate('create_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',p_position:=4::smallint,p_payload:='{"title":"Cuarto","gift_type":"object"}')->>'status'='422','fourth gift rejected by mutation RPC');
select mutation_test.ok(public.server_mutate('create_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',p_position:=2::smallint,p_payload:='{"title":"Precio","gift_type":"object","reference_price":"1.999"}')->>'status'='422','SQL rejects price rounding');
select mutation_test.ok(public.server_mutate('create_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',p_position:=2::smallint,p_payload:='{"gift_type":"object"}')->>'status'='422','missing title rejected');
select mutation_test.ok(public.server_mutate('create_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',p_position:=2::smallint,p_payload:='{"title":"Objeto","gift_type":"object","reference_price":0}')#>>'{gift,currency}'='PEN','zero price and default currency supported');
select mutation_test.ok(public.server_mutate('create_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',p_position:=3::smallint,p_payload:='{"title":"Camisa","gift_type":"clothing","details":{"size":"M"}}')->>'ok'='true','create clothing with contextual details');
select mutation_test.ok(public.server_mutate('update_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',1,1::smallint,(select id from mutation_test.saved),'{"title":"Libro actualizado","reference_price":"25,90","currency":"pen"}')#>>'{gift,version}'='2','gift patch normalizes price and increments version');
select mutation_test.ok((select reference_price=25.90 and currency='PEN' from public.gifts where id=(select id from mutation_test.saved)),'decimal price persisted without rounding');
select mutation_test.ok(public.server_mutate('update_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',1,1::smallint,(select id from mutation_test.saved),'{"title":"stale"}')->>'status'='409','stale gift update rejected');
select mutation_test.ok(public.server_mutate('update_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',2,1::smallint,(select id from mutation_test.saved),'{"participant_id":"81000000-0000-4000-8000-000000000002"}')->>'status'='422','gift owner cannot be reassigned');
select mutation_test.ok(public.server_mutate('update_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',2,1::smallint,(select id from mutation_test.saved),'{"details":{"size":"M"}}')->>'status'='422','SQL validates details against current gift type');
select mutation_test.ok(public.server_mutate('update_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',2,1::smallint,(select id from mutation_test.saved),'{"product_url":"javascript:alert(1)"}')->>'status'='422','SQL rejects unsafe commercial URL');
select mutation_test.ok(public.server_mutate('update_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',1,3::smallint,
 (select id from public.gifts where participant_id='81000000-0000-4000-8000-000000000001' and position=3),'{"gift_type":"object"}')#>'{gift,details}'='{}'::jsonb,'changing type clears obsolete details when not explicitly supplied');
select mutation_test.ok(public.server_mutate('create_gift',repeat('12',32),'81000000-0000-4000-8000-000000000002',p_position:=1::smallint,p_payload:='{"title":"Hack","gift_type":"object"}')->>'status'='403','cannot create a gift for another person');
select mutation_test.ok(public.server_mutate('create_gift',repeat('13',32),'81000000-0000-4000-8000-000000000002',p_position:=1::smallint,p_payload:='{"title":"Regalo B","gift_type":"object"}')->>'ok'='true','organizer can maintain other lists');
select mutation_test.ok(public.server_mutate('update_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',1,1::smallint,
 (select id from public.gifts where participant_id='81000000-0000-4000-8000-000000000002' and position=1),'{"title":"Hack B"}')->>'ok'='false','foreign gift UUID cannot bypass ownership');
select mutation_test.ok((select title='Regalo B' from public.gifts where participant_id='81000000-0000-4000-8000-000000000002' and position=1),'foreign gift unchanged');

reset role;
insert into private.media_assets(participant_id,storage_path,mime_type,size_bytes) values
 ('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001/gift/82000000-0000-4000-8000-000000000001.webp','image/webp',100),
 ('81000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002/gift/82000000-0000-4000-8000-000000000002.webp','image/webp',100);
set local role service_role;
select mutation_test.ok(public.server_mutate('update_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',1,2::smallint,
 (select id from public.gifts where participant_id='81000000-0000-4000-8000-000000000001' and position=2),
 '{"image_path":"81000000-0000-4000-8000-000000000001/gift/82000000-0000-4000-8000-000000000001.webp"}')->>'ok'='true','own registered image can be attached');
select mutation_test.ok((select state='attached' from private.media_assets where participant_id='81000000-0000-4000-8000-000000000001'),'associated asset marked attached');
select mutation_test.ok(public.server_mutate('update_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',2,2::smallint,
 (select id from public.gifts where participant_id='81000000-0000-4000-8000-000000000001' and position=2),
 '{"image_path":"81000000-0000-4000-8000-000000000002/gift/82000000-0000-4000-8000-000000000002.webp"}')->>'status'='403','cannot attach foreign registered media');
select mutation_test.ok(public.server_mutate('update_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',2,2::smallint,
 (select id from public.gifts where participant_id='81000000-0000-4000-8000-000000000001' and position=2),
 '{"image_url":"https://example.com/reference.webp"}')#>'{gift,image_path}'='null'::jsonb,'URL replacement clears file reference atomically');
select mutation_test.ok((select state='pending' from private.media_assets where participant_id='81000000-0000-4000-8000-000000000001'),'unreferenced asset becomes pending without deleting storage bytes');
select mutation_test.ok(public.server_mutate('delete_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',1,1::smallint,(select id from mutation_test.saved))->>'status'='409','stale deletion rejected');
select mutation_test.ok(public.server_mutate('delete_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',2,1::smallint,(select id from mutation_test.saved))->>'ok'='true','current gift can be cleared');
select mutation_test.ok((select count(*)=2 from public.gifts where participant_id='81000000-0000-4000-8000-000000000001'),'clearing preserves other two options');
select mutation_test.ok(public.server_mutate('create_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',p_position:=1::smallint,p_payload:='{"title":"Nueva identidad","gift_type":"object"}')->>'ok'='true','cleared position can be recreated');
select mutation_test.ok(public.server_mutate('delete_gift',repeat('12',32),'81000000-0000-4000-8000-000000000001',1,1::smallint,(select id from mutation_test.saved))->>'status'='409','old UUID cannot delete a newly recreated position with version one');
reset role;
update private.access_tokens set revoked_at=clock_timestamp() where token_hash=decode(repeat('12',32),'hex');
set local role service_role;
select mutation_test.ok(public.server_mutate('update_profile',repeat('12',32),'81000000-0000-4000-8000-000000000001',2,p_payload:='{"personal_message":"Revoked"}')->>'status'='401','revoked capability cannot mutate from an open tab');
reset role;
insert into private.access_tokens(access_type,participant_id,token_hash,created_at,expires_at)
 values('participant','81000000-0000-4000-8000-000000000001',decode(repeat('14',32),'hex'),clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
set local role service_role;
select mutation_test.ok(public.server_mutate('update_profile',repeat('14',32),'81000000-0000-4000-8000-000000000001',2,p_payload:='{"personal_message":"Expired"}')->>'status'='401','expired capability cannot mutate');
reset role;
insert into private.rate_limits(key_hash,operation,window_start,request_count,expires_at)
 values(decode(repeat('15',32),'hex'),'mutation',date_trunc('minute',clock_timestamp()),60,date_trunc('minute',clock_timestamp())+interval '1 minute');
set local role service_role;
select mutation_test.ok(public.server_mutate('update_profile',repeat('15',32),'81000000-0000-4000-8000-000000000001',2,p_payload:='{"personal_message":"Limit"}')->>'status'='429','mutation quota enforced before credential lookup');
reset role;
select mutation_test.ok((select request_count=61 from private.rate_limits where key_hash=decode(repeat('15',32),'hex') and operation='mutation'),'mutation denials consume persistent quota');
rollback;
