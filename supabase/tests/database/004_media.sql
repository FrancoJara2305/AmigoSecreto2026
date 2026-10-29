begin;
create schema media_test;
grant usage on schema media_test to service_role,anon,authenticated;
create function media_test.ok(condition boolean,label text) returns text language plpgsql set search_path='' as $$
begin if condition is distinct from true then raise exception 'FAILED: %',label; end if; return 'ok - '||label; end; $$;
grant execute on function media_test.ok(boolean,text) to service_role,anon,authenticated;
create table media_test.receipts(label text primary key,data jsonb);
grant select,insert on media_test.receipts to service_role;
insert into public.participants(id,name,slug) values
 ('91000000-0000-4000-8000-000000000001','Media A','media-test-a'),('91000000-0000-4000-8000-000000000002','Media B','media-test-b');
insert into private.access_tokens(access_type,participant_id,token_hash) values
 ('participant','91000000-0000-4000-8000-000000000001',decode(repeat('91',32),'hex'));
select media_test.ok(not has_function_privilege('anon','public.server_media_upload(text,text,uuid,text,text,integer)','execute') and
 not has_function_privilege('authenticated','public.server_media_upload(text,text,uuid,text,text,integer)','execute'),'media upload RPC inaccessible to both client roles');
select media_test.ok(not has_function_privilege('anon','public.server_media_cleanup(text,text,uuid)','execute') and
 not has_function_privilege('authenticated','public.server_media_cleanup(text,text,uuid)','execute'),'cleanup RPC inaccessible to both client roles');
select media_test.ok((select relrowsecurity from pg_class where oid='private.media_deletions'::regclass) and
 not has_table_privilege('anon','private.media_deletions','select'),'cleanup queue private with RLS');
set local role service_role;
select media_test.ok(public.server_media_upload('reserve',repeat('ff',32),'91000000-0000-4000-8000-000000000001','gift')->>'status'='401','unknown upload capability denied');
select media_test.ok(public.server_media_upload('reserve',repeat('91',32),'91000000-0000-4000-8000-000000000002','gift')->>'status'='403','foreign upload owner denied');
select media_test.ok(public.server_media_upload('reserve',repeat('91',32),'91000000-0000-4000-8000-000000000001','other')->>'status'='422','upload purpose allowlist');
insert into media_test.receipts values ('first',public.server_media_upload('reserve',repeat('91',32),'91000000-0000-4000-8000-000000000001','gift'));
select media_test.ok((select data->>'ok'='true' and data->>'path' like '91000000-0000-4000-8000-000000000001/gift/%.webp' from media_test.receipts where label='first'),'server generates unique owner path');
select media_test.ok((select not upload_complete and state='pending' from private.media_assets where participant_id='91000000-0000-4000-8000-000000000001'),'reservation cannot yet attach');
select media_test.ok(public.server_mutate('create_gift',repeat('91',32),'91000000-0000-4000-8000-000000000001',p_position:=1::smallint,
 p_payload:=jsonb_build_object('title','Con foto','gift_type','object','image_path',(select data->>'path' from media_test.receipts where label='first')))->>'status'='403','incomplete upload cannot attach');
select media_test.ok(public.server_media_upload('complete',repeat('91',32),'91000000-0000-4000-8000-000000000001','gift',
 (select data->>'path' from media_test.receipts where label='first'),400001)->>'status'='422','normalized size ceiling enforced');
select media_test.ok(public.server_media_upload('complete',repeat('91',32),'91000000-0000-4000-8000-000000000001','gift',
 (select data->>'path' from media_test.receipts where label='first'),2000)->>'ok'='true','authorized completion makes asset attachable');
select media_test.ok(public.server_mutate('create_gift',repeat('91',32),'91000000-0000-4000-8000-000000000001',p_position:=1::smallint,
 p_payload:=jsonb_build_object('title','Con foto','gift_type','object','image_path',(select data->>'path' from media_test.receipts where label='first')))->>'ok'='true','completed image attached transactionally');
select media_test.ok(public.server_media_cleanup('claim',(select data->>'path' from media_test.receipts where label='first'))->>'ok'='false','referenced file cannot be claimed');
select media_test.ok(public.server_mutate('update_gift',repeat('91',32),'91000000-0000-4000-8000-000000000001',1,1::smallint,
 (select id from public.gifts where participant_id='91000000-0000-4000-8000-000000000001'),'{"title":""}')->>'status'='422','failed save rejects whole transaction');
select media_test.ok((select image_path=(select data->>'path' from media_test.receipts where label='first') from public.gifts where participant_id='91000000-0000-4000-8000-000000000001'),'failed save preserves previous image');
select media_test.ok(public.server_mutate('update_gift',repeat('91',32),'91000000-0000-4000-8000-000000000001',1,1::smallint,
 (select id from public.gifts where participant_id='91000000-0000-4000-8000-000000000001'),'{"image_url":"https://example.com/new.webp"}')->>'ok'='true','confirmed replacement releases previous reference');
select media_test.ok(public.server_media_cleanup('claim',(select data->>'path' from media_test.receipts where label='first'))->>'ok'='false','24 hour grace protects freshly detached file');
reset role;
update private.media_assets set unused_since=clock_timestamp()-interval '25 hours' where participant_id='91000000-0000-4000-8000-000000000001';
set local role service_role;
insert into media_test.receipts values ('claim',public.server_media_cleanup('claim',(select data->>'path' from media_test.receipts where label='first')));
select media_test.ok((select data->>'ok'='true' from media_test.receipts where label='claim'),'aged pending file can be claimed');
select media_test.ok(public.server_mutate('update_gift',repeat('91',32),'91000000-0000-4000-8000-000000000001',2,1::smallint,
 (select id from public.gifts where participant_id='91000000-0000-4000-8000-000000000001'),jsonb_build_object('image_path',(select data->>'path' from media_test.receipts where label='first')))->>'status'='403','claimed image cannot be reattached');
select media_test.ok(public.server_media_cleanup('finish',(select data->>'path' from media_test.receipts where label='first'),gen_random_uuid())->>'ok'='false','cleanup receipt required');
select media_test.ok(public.server_media_cleanup('claim',(select data->>'path' from media_test.receipts where label='first'))->>'claim'=(select data->>'claim' from media_test.receipts where label='claim'),'failed Storage delete can retry stable claim');
select media_test.ok(public.server_media_cleanup('finish',(select data->>'path' from media_test.receipts where label='first'),(select (data->>'claim')::uuid from media_test.receipts where label='claim'))->>'ok'='true','cleanup completes after Storage removal');
select media_test.ok(not exists(select 1 from private.media_assets where participant_id='91000000-0000-4000-8000-000000000001') and
 exists(select 1 from private.media_deletions where storage_path=(select data->>'path' from media_test.receipts where label='first')),'cleanup drops registry but retains tombstone');
select media_test.ok(public.server_media_cleanup('claim','https://example.com/image.webp')->>'ok'='false','cleanup cannot target external URLs');
select media_test.ok(public.server_media_cleanup('claim','../escape.webp')->>'ok'='false','cleanup cannot target arbitrary paths');
reset role;
-- Simulate Storage metadata for orphan detection, never delete storage.objects via SQL.
insert into storage.objects(bucket_id,name,created_at) values ('wishlist-media','92000000-0000-4000-8000-000000000001/gift/93000000-0000-4000-8000-000000000001.webp',clock_timestamp()-interval '25 hours');
set local role service_role;
select media_test.ok(public.server_media_cleanup('list')->'paths' ? '92000000-0000-4000-8000-000000000001/gift/93000000-0000-4000-8000-000000000001.webp','orphan without participant or registry discovered');
select media_test.ok(public.server_media_cleanup('claim','92000000-0000-4000-8000-000000000001/gift/93000000-0000-4000-8000-000000000001.webp')->>'ok'='true','orphan claim survives deleted owner');
select media_test.ok(public.server_media_cleanup('finish','92000000-0000-4000-8000-000000000001/gift/93000000-0000-4000-8000-000000000001.webp',
 (select claim_id from private.media_deletions where storage_path='92000000-0000-4000-8000-000000000001/gift/93000000-0000-4000-8000-000000000001.webp'))->>'ok'='false','cleanup cannot finish while Storage object still exists');
insert into media_test.receipts values ('inflight',public.server_media_upload('reserve',repeat('91',32),'91000000-0000-4000-8000-000000000001','avatar'));
reset role;
update private.access_tokens set revoked_at=clock_timestamp() where token_hash=decode(repeat('91',32),'hex');
set local role service_role;
select media_test.ok(public.server_media_upload('reserve',repeat('91',32),'91000000-0000-4000-8000-000000000001','avatar')->>'status'='401','revoked link cannot reserve');
select media_test.ok(public.server_media_upload('complete',repeat('91',32),'91000000-0000-4000-8000-000000000001','avatar',
 (select data->>'path' from media_test.receipts where label='inflight'),100)->>'status'='401','revocation during upload prevents completion');
select media_test.ok((select not upload_complete from private.media_assets where storage_path=(select data->>'path' from media_test.receipts where label='inflight')),'revoked inflight upload remains unavailable for attachment');
reset role;
rollback;
