-- Compatibility with original schema formats; only app-owned canonical paths are eligible.
alter table private.media_deletions drop constraint media_deletions_storage_path_check;
alter table private.media_deletions add constraint media_deletions_storage_path_check check (
 storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(gift|avatar)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$');
create or replace function public.server_media_cleanup(p_action text,p_path text default null,p_claim uuid default null)
returns jsonb language plpgsql set search_path='' as $$
declare m private.media_assets%rowtype; tomb private.media_deletions%rowtype; owner_id uuid; aged boolean;
begin
  if p_action='list' then
    return jsonb_build_object('paths',(select coalesce(jsonb_agg(storage_path),'[]'::jsonb) from (
      select storage_path from (select storage_path from private.media_assets where state='pending' and unused_since<clock_timestamp()-interval '24 hours'
      union select o.name from storage.objects o where o.bucket_id='wishlist-media' and o.created_at<clock_timestamp()-interval '24 hours'
        and not exists(select 1 from private.media_assets a where a.storage_path=o.name)
      union select d.storage_path from private.media_deletions d where d.completed_at is null or exists(
        select 1 from storage.objects o where o.bucket_id='wishlist-media' and o.name=d.storage_path)
      ) all_paths where storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(gift|avatar)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$' order by 1 limit 100
    ) candidates));
  end if;
  if p_action is null or p_action not in ('claim','finish') or p_path is null or
    p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(gift|avatar)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$' then
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
  if p_claim is null or tomb.claim_id is distinct from p_claim or exists(select 1 from storage.objects where bucket_id='wishlist-media' and name=p_path) then return jsonb_build_object('ok',false); end if;
  delete from private.media_assets where storage_path=p_path;
  update private.media_deletions set completed_at=clock_timestamp() where storage_path=p_path;
  return jsonb_build_object('ok',true);
end;
$$;
