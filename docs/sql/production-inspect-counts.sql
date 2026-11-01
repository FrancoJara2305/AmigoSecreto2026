-- Exact aggregate counts only; execute only with verified complete RLS visibility.
begin read only;
set local statement_timeout = '15s';
set local lock_timeout = '3s';
select jsonb_build_object(
 'transaction_read_only',current_setting('transaction_read_only'),
 'participants',(select count(*) from public.participants),
 'gifts',(select count(*) from public.gifts),
 'event_settings',(select count(*) from public.event_settings),
 'access_status',(select jsonb_agg(s) from (select access_type,revoked_at is not null as revoked,count(*) as count from private.access_tokens group by 1,2) s),
 'rate_limits',(select count(*) from private.rate_limits),
 'media_assets',(select count(*) from private.media_assets),
 'media_deletions',(select count(*) from private.media_deletions),
 'import_requests',(select count(*) from private.import_requests),
 'storage_objects',(select count(*) from storage.objects),
 'auth_users',(select count(*) from auth.users)
) as counts;
rollback;
