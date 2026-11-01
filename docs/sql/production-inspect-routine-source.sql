-- Only the nine differing routines. Source is compared in memory, not saved or printed.
begin read only;
set local statement_timeout = '15s';
set local lock_timeout = '3s';
select n.nspname as schema,p.proname as name,
 pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
 l.lanname as language,p.provolatile as volatility,p.proparallel as parallel,
 p.proisstrict as strict,p.proleakproof as leakproof,p.proretset as returns_set,
 pg_catalog.format_type(p.prorettype,null) as return_type,
 p.procost as cost,p.prorows as estimated_rows,
 pg_catalog.pg_get_expr(p.proargdefaults,0) as defaults,
 p.prosrc as source,
 current_setting('transaction_read_only') as transaction_read_only
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
join pg_catalog.pg_language l on l.oid=p.prolang
where (n.nspname='private' and p.proname in ('consume_quota','operation_quota','prune_rate_limits'))
 or (n.nspname='public' and p.proname in ('server_access','server_media_cleanup','server_media_upload','server_mutate','server_rate_limit','server_rate_limits_cleanup'))
order by n.nspname,p.proname;
rollback;
