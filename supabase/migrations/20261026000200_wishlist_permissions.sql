-- Explicit grants: absence of a permissive policy alone is not our only control.
alter table public.participants enable row level security;
alter table public.gifts enable row level security;
alter table public.event_settings enable row level security;
alter table private.access_tokens enable row level security;
alter table private.rate_limits enable row level security;
alter table private.media_assets enable row level security;

revoke all on public.participants, public.gifts, public.event_settings from public, anon, authenticated;
grant select on public.participants, public.gifts, public.event_settings to anon, authenticated;
create policy participants_public_read on public.participants for select to anon, authenticated using (true);
create policy gifts_public_read on public.gifts for select to anon, authenticated using (true);
create policy event_settings_public_read on public.event_settings for select to anon, authenticated using (true);

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- service_role bypasses RLS: future handlers MUST validate capability + ownership transactionally.
revoke all on public.participants, public.gifts, public.event_settings from service_role;
grant select, insert, update, delete on public.participants, public.gifts to service_role;
grant select, update on public.event_settings to service_role;
revoke all on private.access_tokens, private.rate_limits, private.media_assets from service_role;
grant select, insert, update, delete on private.access_tokens, private.rate_limits, private.media_assets to service_role;
grant execute on all functions in schema private to service_role;

-- No public RPC, mutation RPC, token validator or bootstrap HTTP endpoint in this iteration.
