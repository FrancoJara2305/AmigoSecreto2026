-- REVIEW ONLY. Confirm production target jtuhcilcnuydsbcbsazo before running.
-- Do not execute until read-only production inspection is approved.
begin read only;
set local statement_timeout = '15s';
set local lock_timeout = '3s';
select jsonb_build_object(
 'transaction_read_only', current_setting('transaction_read_only'),
 'server_version', current_setting('server_version'),
 'history_exists', to_regclass('supabase_migrations.schema_migrations') is not null,
 'relations', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'owner',pg_get_userbyid(c.relowner)) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','f')),
 'routines', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'security_definer',p.prosecdef,'configuration',p.proconfig,'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
 'table_grants', (select jsonb_agg(jsonb_build_object('role',grantee,'schema',table_schema,'table',table_name,'privilege',privilege_type) order by table_schema,table_name,grantee,privilege_type) from information_schema.role_table_grants where table_schema in ('public','private') and grantee in ('anon','authenticated','service_role')),
 'bucket_configuration', (select jsonb_agg(jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) order by id) from storage.buckets),
 'storage_object_count', (select count(*) from storage.objects),
 'auth_user_count', (select count(*) from auth.users),
 'realtime_relations', (select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename) order by schemaname,tablename) from pg_publication_tables where pubname='supabase_realtime')
) as inspection;
rollback;
