-- T14. Files are reserved before upload, and attachable only after a second authorization.
alter table private.media_assets add column upload_complete boolean not null default true;
alter table private.media_assets add column unused_since timestamptz not null default clock_timestamp();
create index media_assets_unused_idx on private.media_assets(unused_since) where state='pending';

-- Durable tombstones: a claimed path can NEVER be attached or reused, even after a retry/crash.
-- No participant FK: deletion of a participant must not erase the cleanup queue.
create table private.media_deletions (
  storage_path text primary key check (storage_path ~ '^[0-9a-f-]{36}/(gift|avatar)/[0-9a-f-]{36}\.webp$'),
  claim_id uuid not null default gen_random_uuid(),
  requested_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 1 check(attempts>0),
  completed_at timestamptz
);
alter table private.media_deletions enable row level security;
revoke all on private.media_deletions from public,anon,authenticated;
grant select,insert,update on private.media_deletions to service_role;

create or replace function private.refresh_media_state(p_participant_id uuid)
returns void language sql set search_path='' as $$
  update private.media_assets m set
    unused_since=case when m.state='attached' and not (
      exists(select 1 from public.participants p where p.id=p_participant_id and p.photo_path=m.storage_path) or
      exists(select 1 from public.gifts g where g.participant_id=p_participant_id and g.image_path=m.storage_path)
    ) then clock_timestamp() else m.unused_since end,
    state=case when
      exists(select 1 from public.participants p where p.id=p_participant_id and p.photo_path=m.storage_path) or
      exists(select 1 from public.gifts g where g.participant_id=p_participant_id and g.image_path=m.storage_path)
    then 'attached' else 'pending' end
  where m.participant_id=p_participant_id;
$$;

create function private.guard_media_attachment() returns trigger language plpgsql set search_path='' as $$
declare path text; owner_id uuid; purpose text;
begin
  if TG_TABLE_NAME='gifts' then path:=NEW.image_path; owner_id:=NEW.participant_id; purpose:='gift';
  else path:=NEW.photo_path; owner_id:=NEW.id; purpose:='avatar'; end if;
  if path is null then return NEW; end if;
  perform 1 from private.media_assets where participant_id=owner_id and storage_path=path
    and upload_complete for update;
  if not found or split_part(path,'/',2)<>purpose or
    exists(select 1 from private.media_deletions where storage_path=path) then
    raise exception 'Media not available for attachment' using errcode='42501';
  end if;
  return NEW;
end;
$$;
create trigger gifts_media_guard before insert or update of image_path on public.gifts
  for each row execute function private.guard_media_attachment();
create trigger participants_media_guard before insert or update of photo_path on public.participants
  for each row execute function private.guard_media_attachment();

create function public.server_media_upload(p_action text,p_token_hash text,p_participant_id uuid,
  p_purpose text,p_path text default null,p_size integer default null)
returns jsonb language plpgsql set search_path='' as $$
declare scope jsonb; path text; total integer; per_token integer;
  win timestamptz:=date_trunc('minute',clock_timestamp());
begin
  if p_action is null or p_action not in ('reserve','complete') or p_purpose is null or p_purpose not in ('gift','avatar') or
    p_participant_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'status',422,'error','INVALID_REQUEST');
  end if;
  if p_action='reserve' then
    insert into private.rate_limits as b(key_hash,operation,window_start,expires_at)
      values(decode(repeat('00',32),'hex'),'upload',win,win+interval '1 minute')
      on conflict(key_hash,operation,window_start) do update set request_count=b.request_count+1 returning request_count into total;
    insert into private.rate_limits as b(key_hash,operation,window_start,expires_at)
      values(decode(p_token_hash,'hex'),'upload',win,win+interval '1 minute')
      on conflict(key_hash,operation,window_start) do update set request_count=b.request_count+1 returning request_count into per_token;
    if total>120 or per_token>6 then return jsonb_build_object('ok',false,'status',429,'error','RATE_LIMITED','retry_after',60); end if;
  end if;
  begin
    scope:=private.require_access(p_token_hash,p_participant_id,false);
    perform 1 from public.participants where id=p_participant_id for update;
    if not found then raise exception 'Missing owner' using errcode='P0002'; end if;
    scope:=private.require_access(p_token_hash,p_participant_id,false);
    if p_action='reserve' then
      if p_path is not null or p_size is not null then raise exception 'Unexpected fields' using errcode='22023'; end if;
      if (select count(*) from private.media_assets where participant_id=p_participant_id and state='pending')>=12 then
        return jsonb_build_object('ok',false,'status',429,'error','RATE_LIMITED','retry_after',60);
      end if;
      path:=p_participant_id::text||'/'||p_purpose||'/'||gen_random_uuid()::text||'.webp';
      insert into private.media_assets(participant_id,storage_path,created_by_token_id,mime_type,size_bytes,upload_complete)
        values(p_participant_id,path,(scope->>'token_id')::uuid,'image/webp',1,false);
    else
      path:=p_path;
      if path is null or split_part(path,'/',2)<>p_purpose or p_size is null or p_size not between 1 and
        (case when p_purpose='gift' then 400000 else 150000 end) then raise exception 'Invalid media' using errcode='22023'; end if;
      perform 1 from private.media_assets where participant_id=p_participant_id and storage_path=path
        and created_by_token_id=(scope->>'token_id')::uuid and not upload_complete for update;
      if not found or exists(select 1 from private.media_deletions where storage_path=path) then
        raise exception 'Unowned or unavailable reservation' using errcode='42501'; end if;
      update private.media_assets set upload_complete=true,size_bytes=p_size,unused_since=clock_timestamp() where storage_path=path;
    end if;
    return jsonb_build_object('ok',true,'path',path);
  exception
    when sqlstate '28000' then return jsonb_build_object('ok',false,'status',401,'error','ACCESS_UNAVAILABLE');
    when insufficient_privilege then return jsonb_build_object('ok',false,'status',403,'error','FORBIDDEN');
    when no_data_found then return jsonb_build_object('ok',false,'status',404,'error','NOT_FOUND');
    when invalid_parameter_value then return jsonb_build_object('ok',false,'status',422,'error','INVALID_REQUEST');
  end;
end;
$$;

-- Maintenance only, never called by a browser-facing Edge Function. Storage deletion is HTTP.
create function public.server_media_cleanup(p_action text,p_path text default null,p_claim uuid default null)
returns jsonb language plpgsql set search_path='' as $$
declare m private.media_assets%rowtype; tomb private.media_deletions%rowtype; owner_id uuid; aged boolean;
begin
  if p_action='list' then
    return jsonb_build_object('paths',(select coalesce(jsonb_agg(storage_path),'[]'::jsonb) from (
      select storage_path from private.media_assets where state='pending' and unused_since<clock_timestamp()-interval '24 hours'
      union select o.name from storage.objects o where o.bucket_id='wishlist-media' and o.created_at<clock_timestamp()-interval '24 hours'
        and not exists(select 1 from private.media_assets a where a.storage_path=o.name)
      union select d.storage_path from private.media_deletions d where d.completed_at is null or exists(
        select 1 from storage.objects o where o.bucket_id='wishlist-media' and o.name=d.storage_path)
      order by 1 limit 100
    ) candidates));
  end if;
  if p_action is null or p_action not in ('claim','finish') or p_path is null or
    p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(gift|avatar)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$' then
    return jsonb_build_object('ok',false);
  end if;
  owner_id:=split_part(p_path,'/',1)::uuid;
  -- Same lock order as mutation/upload. Re-check references AFTER the owner lock.
  perform 1 from public.participants where id=owner_id for update;
  select * into m from private.media_assets where storage_path=p_path for update;
  if exists(select 1 from public.participants where photo_path=p_path) or exists(select 1 from public.gifts where image_path=p_path) then
    return jsonb_build_object('ok',false);
  end if;
  select * into tomb from private.media_deletions where storage_path=p_path for update;
  if p_action='claim' then
    aged:= (m.storage_path is not null and m.unused_since<clock_timestamp()-interval '24 hours') or
      (m.storage_path is null and exists(select 1 from storage.objects where bucket_id='wishlist-media' and name=p_path and created_at<clock_timestamp()-interval '24 hours'));
    if tomb.storage_path is null and not coalesce(aged,false) then return jsonb_build_object('ok',false); end if;
    insert into private.media_deletions as d(storage_path) values(p_path)
      on conflict(storage_path) do update set attempts=d.attempts+1,completed_at=null returning * into tomb;
    return jsonb_build_object('ok',true,'claim',tomb.claim_id,'path',p_path);
  end if;
  if p_claim is null or tomb.claim_id is distinct from p_claim then return jsonb_build_object('ok',false); end if;
  delete from private.media_assets where storage_path=p_path;
  update private.media_deletions set completed_at=clock_timestamp() where storage_path=p_path;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function private.guard_media_attachment() from public,anon,authenticated;
grant execute on function private.guard_media_attachment() to service_role;
revoke all on function public.server_media_upload(text,text,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.server_media_upload(text,text,uuid,text,text,integer) to service_role;
revoke all on function public.server_media_cleanup(text,text,uuid) from public,anon,authenticated;
grant execute on function public.server_media_cleanup(text,text,uuid) to service_role;
