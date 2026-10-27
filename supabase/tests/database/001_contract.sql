-- Run on a disposable LOCAL database only. Every fixture and grant change rolls back.
-- Plain PostgreSQL assertions: also runnable with psql ON_ERROR_STOP, no pgTAP dependency.
begin;
create schema test_helpers;
grant usage on schema test_helpers to anon, authenticated, service_role;
-- Baseline counts let the contract coexist with T06 demo records. All changes roll back.
create table test_helpers.baseline as select
  (select count(*) from public.participants) as participants,
  (select count(*) from public.gifts) as gifts,
  (select count(*) from private.access_tokens) as tokens,
  (select count(*) from private.media_assets) as media,
  (select version from public.event_settings where id = 1) as event_version;
grant select on test_helpers.baseline to anon, authenticated, service_role;
-- Isolated local test transaction: release the singleton slot if bootstrap was run.
-- ROLLBACK restores the operator's original organizer token.
update private.access_tokens set revoked_at=clock_timestamp()
  where access_type='organizer' and revoked_at is null;
create function test_helpers.ok(condition boolean, label text) returns text
language plpgsql set search_path = '' as $$
begin
  if condition is distinct from true then raise exception 'FAILED: %', label; end if;
  return 'ok - ' || label;
end;
$$;
create function test_helpers.throws(statement text, expected_state text, label text) returns text
language plpgsql set search_path = '' as $$
declare actual_state text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
  end;
  if actual_state is distinct from expected_state then
    raise exception 'FAILED: % (expected %, got %)', label, expected_state, coalesce(actual_state, 'success');
  end if;
  return 'ok - ' || label;
end;
$$;
-- Storage can reject DELETE in a statement-level platform trigger before RLS sees rows.
-- Both a permission error and zero affected rows are valid denials. Never disable the
-- platform trigger or set storage.allow_delete_query merely to make a test pass.
create function test_helpers.storage_delete_denied(label text) returns text
language plpgsql set search_path = '' as $$
declare affected bigint;
begin
  begin
    delete from storage.objects where bucket_id = 'wishlist-media';
    get diagnostics affected = row_count;
  exception when insufficient_privilege then
    return 'ok - ' || label;
  end;
  if affected <> 0 then raise exception 'FAILED: % (deleted % rows)', label, affected; end if;
  return 'ok - ' || label;
end;
$$;
grant execute on all functions in schema test_helpers to anon, authenticated, service_role;

select test_helpers.ok(not exists(select 1 from public.participants where id in
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002') or slug in ('test-ana','test-bruno')), 'test participant identities are available');
select test_helpers.ok(not exists(select 1 from private.access_tokens where id in
 ('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002')), 'test token identities are available');
select test_helpers.ok((select count(*) = 1 from public.event_settings where id = 1), 'singleton event exists');
select test_helpers.ok((select count(*) = 6 and bool_and(c.relrowsecurity)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where (n.nspname = 'public' and c.relname in ('participants','gifts','event_settings'))
     or (n.nspname = 'private' and c.relname in ('access_tokens','rate_limits','media_assets'))), 'RLS on all six application tables');
select test_helpers.ok(not has_schema_privilege('anon','private','usage') and
  not has_schema_privilege('authenticated','private','usage'), 'private schema unavailable to client roles');
select test_helpers.ok(not has_function_privilege('anon','private.valid_gift_details(text,jsonb)','execute'), 'no anonymous helper RPC');
select test_helpers.ok(not exists (
  select 1 from unnest(array['anon','authenticated']) r(role_name)
  cross join unnest(array['public.participants','public.gifts','public.event_settings']) t(table_name)
  cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(privilege_name)
  where has_table_privilege(r.role_name, t.table_name, p.privilege_name)
), 'every public table denies all client write privileges');

insert into public.participants (id,name,slug) values
 ('10000000-0000-0000-0000-000000000001','Test Ana','test-ana'),
 ('10000000-0000-0000-0000-000000000002','Test Bruno','test-bruno');
select test_helpers.throws($q$insert into public.participants(name,slug) values ('Duplicada','test-ana')$q$,'23505','unique slug');
select test_helpers.throws($q$insert into public.participants(name,slug) values ('','empty')$q$,'23514','name required');
select test_helpers.throws($q$insert into public.participants(name,slug) values ('Nombre','Invalid Slug')$q$,'23514','slug format');
select test_helpers.throws($q$update public.participants set personal_message = repeat('a',501)$q$,'23514','message bounded');
select test_helpers.throws($q$update public.participants set general_preferences = repeat('a',2001)$q$,'23514','preferences bounded');
select test_helpers.throws($q$update public.participants set display_order = -1$q$,'23514','nonnegative display order');
select test_helpers.throws($q$update public.participants set avatar_key = 'arbitrary-script'$q$,'23514','avatar allowlist');
update public.participants set name = 'Test Ana editada', version = 999, created_at = '2000-01-01'
 where id = '10000000-0000-0000-0000-000000000001';
select test_helpers.ok((select version = 2 and created_at > '2020-01-01' from public.participants
 where id = '10000000-0000-0000-0000-000000000001'), 'version and creation timestamp owned by database');

insert into public.gifts (participant_id,position,title,gift_type) values
 ('10000000-0000-0000-0000-000000000001',1,'Libro','object'),
 ('10000000-0000-0000-0000-000000000001',2,'Camisa','clothing'),
 ('10000000-0000-0000-0000-000000000001',3,'Zapatos','clothing');
select test_helpers.ok((select count(*) = 3 from public.gifts where participant_id='10000000-0000-0000-0000-000000000001'), 'three gifts with only required fields');
select test_helpers.throws($q$insert into public.gifts(participant_id,position,title,gift_type) values
 ('10000000-0000-0000-0000-000000000001',4,'Cuarto','object')$q$,'23514','fourth position rejected');
select test_helpers.throws($q$update public.gifts set position = 0$q$,'23514','zero position rejected');
select test_helpers.throws($q$insert into public.gifts(participant_id,position,title,gift_type) values
 ('10000000-0000-0000-0000-000000000001',1,'Duplicado','object')$q$,'23505','duplicate position rejected');
select test_helpers.throws($q$insert into public.gifts(participant_id,position,title,gift_type) values
 ('20000000-0000-0000-0000-000000000099',1,'Sin dueño','object')$q$,'23503','gift owner FK');
select test_helpers.throws($q$update public.gifts set reference_price = -1$q$,'23514','negative price rejected');
select test_helpers.throws($q$update public.gifts set reference_price = 'NaN'$q$,'23514','NaN price rejected');
select test_helpers.throws($q$update public.gifts set reference_price = 20, currency = null$q$,'23514','price requires currency');
select test_helpers.throws($q$update public.gifts set currency = 'soles'$q$,'23514','currency code format');
update public.gifts set reference_price = 0, currency = 'PEN' where position = 1 and participant_id='10000000-0000-0000-0000-000000000001';
select test_helpers.ok((select reference_price = 0 from public.gifts where position = 1 and participant_id='10000000-0000-0000-0000-000000000001'), 'zero price permitted');
select test_helpers.throws($q$update public.gifts set product_url = 'javascript:alert(1)'$q$,'23514','unsafe URL rejected');
select test_helpers.throws($q$update public.gifts set image_url = 'https://user:pass@example.com/x.jpg'$q$,'23514','URL credentials rejected');
select test_helpers.throws($q$update public.gifts set product_url = 'https://127.0.0.1/x'$q$,'23514','literal IP URL rejected');
select test_helpers.throws($q$update public.gifts set gift_type = 'other'$q$,'23514','gift type allowlist');
select test_helpers.throws($q$update public.gifts set details = '[]'$q$,'23514','details must be object');
select test_helpers.throws($q$update public.gifts set details = '{"unexpected":"x"}'$q$,'23514','unknown detail key rejected');
select test_helpers.throws($q$update public.gifts set details = '{"color":{"html":"x"}}'$q$,'23514','nested detail values rejected');
select test_helpers.throws($q$update public.gifts set details = jsonb_build_object('notes',repeat('x',9000))$q$,'23514','details size bounded');
update public.gifts set details = '{"subtype":"footwear","size":"39","size_system":"EU","alternative_colors":["negro"]}' where position = 3 and participant_id='10000000-0000-0000-0000-000000000001';
select test_helpers.ok((select details->>'size_system' = 'EU' from public.gifts where position = 3 and participant_id='10000000-0000-0000-0000-000000000001'), 'footwear details accepted');
select test_helpers.throws($q$update public.gifts set details = '{"alternative_colors":[1]}' where position = 3$q$,'23514','alternative colors typed');
select test_helpers.throws($q$update public.gifts set details = '{"size":"M"}' where gift_type = 'object'$q$,'23514','details restricted by gift type');
select test_helpers.throws($q$insert into public.event_settings(id,title,welcome_message) values (2,'Otro','Mensaje')$q$,'23514','singleton key constraint');

insert into private.access_tokens(id,access_type,participant_id,token_hash) values
 ('30000000-0000-0000-0000-000000000001','participant','10000000-0000-0000-0000-000000000001',decode(repeat('11',32),'hex')),
 ('30000000-0000-0000-0000-000000000002','organizer',null,decode(repeat('22',32),'hex'));
select test_helpers.throws($q$insert into private.access_tokens(access_type,token_hash) values ('participant',decode(repeat('33',32),'hex'))$q$,'23514','participant token needs owner');
select test_helpers.throws($q$insert into private.access_tokens(access_type,participant_id,token_hash) values ('organizer','10000000-0000-0000-0000-000000000002',decode(repeat('33',32),'hex'))$q$,'23514','organizer token has no owner');
select test_helpers.throws($q$insert into private.access_tokens(access_type,participant_id,token_hash) values ('participant','10000000-0000-0000-0000-000000000002',decode('01','hex'))$q$,'23514','hash must be 32 bytes');
select test_helpers.throws($q$insert into private.access_tokens(access_type,participant_id,token_hash) values ('participant','10000000-0000-0000-0000-000000000002',decode(repeat('11',32),'hex'))$q$,'23505','hash is unique');
select test_helpers.throws($q$insert into private.access_tokens(access_type,participant_id,token_hash) values ('participant','10000000-0000-0000-0000-000000000001',decode(repeat('33',32),'hex'))$q$,'23505','one live personal link');
select test_helpers.throws($q$insert into private.access_tokens(access_type,token_hash) values ('organizer',decode(repeat('33',32),'hex'))$q$,'23505','one live organizer link');
select test_helpers.throws($q$update private.access_tokens set expires_at = created_at - interval '1 second'$q$,'23514','expiry must follow creation');
select test_helpers.throws($q$update private.access_tokens set revoked_at = created_at - interval '1 second'$q$,'23514','revocation cannot precede creation');
update private.access_tokens set revoked_at = transaction_timestamp() where participant_id='10000000-0000-0000-0000-000000000001';
insert into private.access_tokens(access_type,participant_id,token_hash) values ('participant','10000000-0000-0000-0000-000000000001',decode(repeat('33',32),'hex'));
select test_helpers.ok((select count(*) = 1 from private.access_tokens where participant_id='10000000-0000-0000-0000-000000000001' and revoked_at is null), 'replacement allowed after revocation');

insert into private.media_assets(participant_id,storage_path,mime_type,size_bytes,created_by_token_id) values
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001/avatar/40000000-0000-0000-0000-000000000001.webp','image/webp',1000,'30000000-0000-0000-0000-000000000001');
update public.participants set photo_path = '10000000-0000-0000-0000-000000000001/avatar/40000000-0000-0000-0000-000000000001.webp' where slug = 'test-ana';
select test_helpers.throws($q$update public.participants set photo_path = '10000000-0000-0000-0000-000000000001/avatar/40000000-0000-0000-0000-000000000001.webp' where slug = 'test-bruno'$q$,'23503','cannot attach another person photo');
select test_helpers.throws($q$update public.participants set photo_url = 'https://example.com/picture.jpg' where slug = 'test-ana'$q$,'23514','only one photo source');
select test_helpers.throws($q$delete from private.media_assets$q$,'23503','referenced image cannot be deleted');
select test_helpers.throws($q$insert into public.gifts(participant_id,position,title,gift_type,image_path)
 values ('10000000-0000-0000-0000-000000000002',1,'Ajeno','object','10000000-0000-0000-0000-000000000001/avatar/40000000-0000-0000-0000-000000000001.webp')$q$,
 '23503','cannot attach another person gift image');
select test_helpers.throws($q$update private.media_assets set mime_type = 'image/svg+xml'$q$,'23514','media MIME allowlist');
select test_helpers.throws($q$update private.media_assets set size_bytes = 3145729$q$,'23514','media size limit');
select test_helpers.throws($q$update private.media_assets set storage_path = '../escape.webp'$q$,'23514','media path bounded to participant');

insert into private.rate_limits(key_hash,operation,window_start,expires_at)
 values(decode(repeat('44',32),'hex'),'import',transaction_timestamp(),transaction_timestamp() + interval '1 minute');
select test_helpers.throws($q$insert into private.rate_limits(key_hash,operation,window_start,expires_at)
 values(decode(repeat('44',32),'hex'),'import',transaction_timestamp(),transaction_timestamp() + interval '1 minute')$q$,
 '23505','quota key unique per operation and window');
select test_helpers.throws($q$update private.rate_limits set request_count = 0$q$,'23514','quota count positive');
select test_helpers.throws($q$update private.rate_limits set expires_at = window_start$q$,'23514','quota expiration follows window');

select test_helpers.ok((select public and file_size_limit = 3145728 and cardinality(allowed_mime_types) = 3
  from storage.buckets where id = 'wishlist-media'), 'public bucket has upload restrictions');

-- Test both grants and RLS, not just owner/superuser behavior.
set local role anon;
select test_helpers.ok((select count(*) = (select participants + 2 from test_helpers.baseline) from public.participants), 'anon can read participants');
select test_helpers.ok((select count(*) = (select gifts + 3 from test_helpers.baseline) from public.gifts), 'anon can read gifts');
select test_helpers.ok((select count(*) = 1 from public.event_settings), 'anon can read settings');
select test_helpers.throws($q$insert into public.participants(name,slug) values ('Hacker','hacker')$q$,'42501','anon insert denied');
select test_helpers.throws($q$update public.gifts set title = 'Hacked'$q$,'42501','anon update denied');
select test_helpers.throws($q$delete from public.participants$q$,'42501','anon delete denied');
select test_helpers.throws($q$truncate public.gifts$q$,'42501','anon truncate denied');
select test_helpers.throws($q$select * from private.access_tokens$q$,'42501','anon cannot read tokens');
select test_helpers.throws($q$select * from private.rate_limits$q$,'42501','anon cannot read quotas');
select test_helpers.throws($q$select * from private.media_assets$q$,'42501','anon cannot read media metadata');
select test_helpers.throws($q$select private.is_https_url('https://example.com')$q$,'42501','anon cannot execute private helper');
reset role;
set local role authenticated;
select test_helpers.ok((select count(*) = (select participants + 2 from test_helpers.baseline) from public.participants), 'authenticated is read-only too');
select test_helpers.throws($q$update public.event_settings set title = 'Hacked'$q$,'42501','authenticated update denied');
select test_helpers.throws($q$select * from private.access_tokens$q$,'42501','authenticated cannot read tokens');
reset role;

-- Grant DML temporarily to prove RLS remains a second barrier if a grant regresses.
grant insert,update,delete on public.participants to anon;
set local role anon;
select test_helpers.throws($q$insert into public.participants(name,slug) values ('Hacker','hacker')$q$,'42501','RLS denies insert even with table grant');
with changed as (update public.participants set name = 'Hacked' returning id)
select test_helpers.ok((select count(*) = 0 from changed), 'RLS update touches no rows');
with changed as (delete from public.participants returning id)
select test_helpers.ok((select count(*) = 0 from changed), 'RLS delete touches no rows');
reset role;

-- Emulate accidental broad Storage policies, ensuring restrictive rules still protect our bucket.
create policy test_broad_objects on storage.objects for all to anon, authenticated using (true) with check (true);
create policy test_broad_buckets on storage.buckets for all to anon, authenticated using (true) with check (true);
-- Metadata-only fixture; no binary is created. This transaction is rolled back.
insert into storage.objects(bucket_id,name) values ('wishlist-media','test-policy-object.webp');
set local role anon;
select test_helpers.throws($q$insert into storage.objects(bucket_id,name) values ('wishlist-media','bad.webp')$q$,'42501','storage upload denied despite broad policy');
select test_helpers.ok((select count(*) = 0 from storage.buckets where id = 'wishlist-media'), 'no client bucket listing');
select test_helpers.ok((select count(*) = 0 from storage.objects where bucket_id = 'wishlist-media'), 'no client object listing despite broad policy');
with changed as (update storage.objects set name = 'hacked.webp' where bucket_id = 'wishlist-media' returning id)
select test_helpers.ok((select count(*) = 0 from changed), 'client cannot overwrite or move object metadata');
select test_helpers.storage_delete_denied('client cannot delete object metadata');
with changed as (update storage.buckets set public = false where id = 'wishlist-media' returning id)
select test_helpers.ok((select count(*) = 0 from changed), 'client cannot change bucket');
reset role;
set local role authenticated;
select test_helpers.throws($q$insert into storage.objects(bucket_id,name) values ('wishlist-media','bad.webp')$q$,'42501','authenticated storage upload denied');
select test_helpers.storage_delete_denied('authenticated cannot delete object metadata');
reset role;

set local role service_role;
select test_helpers.ok((select count(*) = (select tokens + 3 from test_helpers.baseline) from private.access_tokens), 'server role can access hashes');
update public.event_settings set title = 'Evento de prueba';
select test_helpers.ok((select version = (select event_version + 1 from test_helpers.baseline) from public.event_settings), 'server can update event');
select test_helpers.throws($q$delete from public.event_settings$q$,'42501','server cannot delete event singleton');
select test_helpers.throws($q$truncate public.participants cascade$q$,'42501','server cannot truncate participant table');
reset role;

-- Defaults should not accidentally expose future helpers.
create function private.future_helper() returns boolean language sql as 'select true';
select test_helpers.ok(not has_function_privilege('anon','private.future_helper()','execute') and
 not has_function_privilege('authenticated','private.future_helper()','execute'), 'future helper execution private by default');

delete from public.participants where slug = 'test-ana';
select test_helpers.ok((select count(*) = (select gifts from test_helpers.baseline) from public.gifts), 'participant delete cascades gifts');
select test_helpers.ok((select count(*) = (select tokens + 1 from test_helpers.baseline) from private.access_tokens), 'participant delete cascades tokens');
select test_helpers.ok((select count(*) = (select media from test_helpers.baseline) from private.media_assets), 'participant delete cascades media metadata');
rollback;
