-- Read-only inspection context; no role changes.
begin read only;
set local statement_timeout = '15s';
set local lock_timeout = '3s';
select jsonb_build_object(
 'current_user',current_user,
 'session_user',session_user,
 'transaction_read_only',current_setting('transaction_read_only'),
 'superuser',(select rolsuper from pg_catalog.pg_roles where rolname=current_user),
 'bypass_rls',(select rolbypassrls from pg_catalog.pg_roles where rolname=current_user),
 'public_schema_usage',has_schema_privilege(current_user,'public','USAGE'),
 'private_schema_usage',has_schema_privilege(current_user,'private','USAGE')
) as context;
rollback;
