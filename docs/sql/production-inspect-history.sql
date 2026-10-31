-- REVIEW ONLY. Run after approval and probe confirms production history exists.
begin read only;
set local statement_timeout = '15s';
set local lock_timeout = '3s';
select version,name from supabase_migrations.schema_migrations order by version;
rollback;
