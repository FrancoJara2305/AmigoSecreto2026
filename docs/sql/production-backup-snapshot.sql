-- Read-only recovery metadata, stable data digests and migration provenance.
begin read only;
set local statement_timeout = '20s';
set local lock_timeout = '3s';
set local timezone = 'UTC';
select jsonb_build_object(
 'transaction_read_only',current_setting('transaction_read_only'),
 'counts',jsonb_build_object('participants',(select count(*) from public.participants),'gifts',(select count(*) from public.gifts),'event_settings',(select count(*) from public.event_settings),'access_tokens',(select count(*) from private.access_tokens),'rate_limits',(select count(*) from private.rate_limits),'media_assets',(select count(*) from private.media_assets),'media_deletions',(select count(*) from private.media_deletions),'import_requests',(select count(*) from private.import_requests),'history',(select count(*) from supabase_migrations.schema_migrations),'storage_objects',(select count(*) from storage.objects),'auth_users',(select count(*) from auth.users)),
 'data_digests',jsonb_build_object(
  'participants',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text,'UTF8')),'hex') from public.participants t),
  'gifts',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text,'UTF8')),'hex') from public.gifts t),
  'event_settings',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text,'UTF8')),'hex') from public.event_settings t),
  'access_tokens',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text,'UTF8')),'hex') from private.access_tokens t),
  'rate_limits',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') from private.rate_limits t),
  'media_assets',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') from private.media_assets t),
  'media_deletions',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') from private.media_deletions t),
  'import_requests',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') from private.import_requests t),
  'history',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by version),'[]'::jsonb)::text,'UTF8')),'hex') from supabase_migrations.schema_migrations t)),
 'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) order by nspname) from pg_catalog.pg_namespace where nspname in ('public','private','supabase_migrations')),
 'default_privileges',(select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'object_type',d.defaclobjtype,'acl',d.defaclacl::text) order by pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype) from pg_catalog.pg_default_acl d left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace where d.defaclrole in (select oid from pg_catalog.pg_roles where rolname in ('postgres','supabase_admin')) and (d.defaclnamespace=0 or n.nspname in ('public','private','supabase_migrations'))),
 'migration_relations',(select jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner)) order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='supabase_migrations' and c.relkind='r'),
 'buckets',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) order by id) from storage.buckets)
) as snapshot;
rollback;
