-- T19: explicit JSONB initializers and no unused variable; same grants and behavior.
create or replace function private.normalize_admin_participant(p_data jsonb,p_creating boolean)
returns jsonb language plpgsql set search_path='' as $$
declare pair record; data jsonb:='{}'::jsonb; profile_data jsonb;
begin
  if p_data is null or jsonb_typeof(p_data)<>'object' or p_data='{}'::jsonb or octet_length(p_data::text)>32768 then
    raise exception 'Invalid participant' using errcode='22023';
  end if;
  for pair in select * from jsonb_each(p_data) loop
    if pair.key not in ('name','slug','display_order','photo_url','photo_path','avatar_key','personal_message','general_preferences') then
      raise exception 'Unknown field' using errcode='22023';
    end if;
    if pair.key in ('name','slug') then
      if jsonb_typeof(pair.value)<>'string' or btrim(pair.value#>>'{}')='' then raise exception 'Invalid identity' using errcode='22023'; end if;
      data:=data||jsonb_build_object(pair.key,btrim(pair.value#>>'{}'));
    elsif pair.key='display_order' then
      if jsonb_typeof(pair.value)<>'number' or (pair.value#>>'{}')!~ '^(0|[1-9][0-9]{0,9})$' or (pair.value#>>'{}')::numeric>2147483647 then
        raise exception 'Invalid order' using errcode='22023';
      end if;
      data:=data||jsonb_build_object(pair.key,(pair.value#>>'{}')::integer);
    end if;
  end loop;
  profile_data:=p_data-array['name','slug','display_order'];
  if profile_data<>'{}'::jsonb then data:=data||private.normalize_mutation_payload('update_profile',profile_data); end if;
  if (p_creating and (not (data?'name') or data->>'photo_path' is not null)) or
    (data->>'photo_path' is not null and split_part(data->>'photo_path','/',2)<>'avatar') then
    raise exception 'Invalid initial photo' using errcode='22023';
  end if;
  return data;
end;
$$;

create or replace function public.server_admin(p_action text,p_token_hash text,p_participant_id uuid default null,
  p_expected_version integer default null,p_payload jsonb default '{}')
returns jsonb language plpgsql set search_path='' as $$
declare quota jsonb; data jsonb; p public.participants%rowtype; neighbor public.participants%rowtype;
  settings public.event_settings%rowtype; pair record; base_slug text; candidate text; suffix integer:=2;
  results jsonb; total bigint; page_size integer; page_offset integer; ordered_ids uuid[]; target_index integer; neighbor_index integer;
  neighbor_id uuid; gift_count integer; token_count integer; media_count integer; position_count integer;
begin
  if p_action is null or p_action not in ('admin_list','create_participant','update_participant','move_participant','delete_participant','update_event') or
    p_token_hash is null or p_token_hash!~ '^[0-9a-f]{64}$' or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 or
    (p_action in ('admin_list','update_event') and p_participant_id is not null) or
    (p_action not in ('admin_list','update_event') and p_participant_id is null) or
    (p_action in ('admin_list','create_participant') and p_expected_version is not null) or
    (p_action not in ('admin_list','create_participant') and (p_expected_version is null or p_expected_version<1)) then
    return jsonb_build_object('ok',false,'status',422,'error','INVALID_REQUEST');
  end if;
  quota:=private.operation_quota(case when p_action='admin_list' then 'access' else 'mutation' end,p_token_hash);
  if not (quota->>'ok')::boolean then return quota; end if;
  begin
    -- Same lifecycle lock as issue/revoke/rotate/bootstrap. Always BEFORE actor row.
    if p_action<>'admin_list' then perform pg_advisory_xact_lock(20261225,7); end if;
    perform private.require_access(p_token_hash,null,true);
    if p_action='admin_list' then
      if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('limit','offset')) then raise exception 'Unknown paging field' using errcode='22023'; end if;
      if (p_payload?'limit' and (jsonb_typeof(p_payload->'limit')<>'number' or (p_payload->>'limit')!~ '^[0-9]{1,3}$')) or
        (p_payload?'offset' and (jsonb_typeof(p_payload->'offset')<>'number' or (p_payload->>'offset')!~ '^[0-9]{1,10}$')) then raise exception 'Invalid paging' using errcode='22023'; end if;
      page_size:=coalesce((p_payload->>'limit')::integer,100);page_offset:=coalesce((p_payload->>'offset')::integer,0);
      if page_size not between 1 and 100 or page_offset<0 then raise exception 'Invalid paging' using errcode='22023'; end if;
      -- A single statement snapshot keeps total, rows, gift counts and link states consistent.
      select jsonb_build_object('ok',true,'total',(select count(*) from public.participants),'limit',page_size,'offset',page_offset,
        'event',(select private.admin_event_json(e) from public.event_settings e where id=1),
        'participants',(select coalesce(jsonb_agg(row_data order by display_order,name,id),'[]'::jsonb) from (
          select q.id,q.name,q.display_order,private.admin_participant_json(q)||jsonb_build_object('gift_count',(select count(*) from public.gifts g where g.participant_id=q.id),
            'link',coalesce((select jsonb_build_object('status',case when t.revoked_at is not null then 'revoked' when t.expires_at<=clock_timestamp() then 'expired' else 'active' end,'expires_at',t.expires_at)
              from private.access_tokens t where t.participant_id=q.id and t.access_type='participant' order by (t.revoked_at is null) desc,t.revoked_at desc nulls last,t.created_at desc,t.id desc limit 1),jsonb_build_object('status','none','expires_at',null))) row_data
          from public.participants q order by q.display_order,q.name,q.id limit page_size offset page_offset
        ) rows_page)) into results;
      return results;
    end if;
    if p_action='update_event' then
      if p_payload='{}'::jsonb then raise exception 'Empty event' using errcode='22023'; end if;
      data:='{}'::jsonb;
      for pair in select * from jsonb_each(p_payload) loop
        if pair.key in ('title','welcome_message') then
          if jsonb_typeof(pair.value)<>'string' or btrim(pair.value#>>'{}')='' then raise exception 'Invalid event text' using errcode='22023'; end if;
          data:=data||jsonb_build_object(pair.key,btrim(pair.value#>>'{}'));
        elsif pair.key='exchange_date' then
          if pair.value='null'::jsonb then data:=data||jsonb_build_object('exchange_date',null);
          else
            if jsonb_typeof(pair.value)<>'string' or (pair.value#>>'{}')!~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or left(pair.value#>>'{}',4)='0000' then raise exception 'Invalid date' using errcode='22023'; end if;
            data:=data||jsonb_build_object('exchange_date',(pair.value#>>'{}')::date);
          end if;
        else raise exception 'Unknown event field' using errcode='22023'; end if;
      end loop;
      select * into settings from public.event_settings where id=1 for update;
      if not found then raise exception 'Event missing' using errcode='P0002'; end if;
      perform private.require_access(p_token_hash,null,true);
      if settings.version<>p_expected_version then raise exception 'Stale event' using errcode='40001'; end if;
      settings:=jsonb_populate_record(settings,data);
      update public.event_settings e set title=settings.title,welcome_message=settings.welcome_message,exchange_date=settings.exchange_date
        where id=1 returning e.* into settings;
      return jsonb_build_object('ok',true,'event',private.admin_event_json(settings));
    end if;
    if p_action='create_participant' then
      data:=private.normalize_admin_participant(p_payload,true);
      if data?'slug' then candidate:=data->>'slug';
      else
        base_slug:=regexp_replace(normalize(lower(data->>'name'),NFKD),U&'[\0300-\036f]','','g');
        base_slug:=btrim(left(regexp_replace(base_slug,'[^a-z0-9]+','-','g'),90),'-');
        if base_slug='' then base_slug:='participante'; end if;
        candidate:=base_slug;
        while exists(select 1 from public.participants where slug=candidate) loop candidate:=base_slug||'-'||suffix::text;suffix:=suffix+1;end loop;
      end if;
      if not (data?'display_order') then
        select coalesce(max(display_order)::bigint+1,0) into total from public.participants;
        if total>2147483647 then raise exception 'Order exhausted' using errcode='22023'; end if;
        data:=data||jsonb_build_object('display_order',total);
      end if;
      perform private.require_access(p_token_hash,null,true);
      insert into public.participants(id,name,slug,display_order,avatar_key,photo_url,personal_message,general_preferences)
        values(p_participant_id,data->>'name',candidate,(data->>'display_order')::integer,coalesce(data->>'avatar_key','gift'),data->>'photo_url',data->>'personal_message',data->>'general_preferences') returning * into p;
      return jsonb_build_object('ok',true,'participant',private.admin_participant_json(p));
    end if;
    if p_action='move_participant' then
      if (select count(*) from jsonb_object_keys(p_payload))<>3 or not (p_payload?&array['neighbor_id','neighbor_version','direction']) or
        jsonb_typeof(p_payload->'neighbor_id')<>'string' or jsonb_typeof(p_payload->'direction')<>'string' or
        p_payload->>'direction' not in ('up','down') or jsonb_typeof(p_payload->'neighbor_version')<>'number' or (p_payload->>'neighbor_version')!~ '^[1-9][0-9]{0,9}$' then
        raise exception 'Invalid move' using errcode='22023';
      end if;
      neighbor_id:=(p_payload->>'neighbor_id')::uuid;
      if neighbor_id=p_participant_id then raise exception 'Same neighbor' using errcode='22023'; end if;
      -- Tiny single-event roster. Lock all rows in UUID order, then decide adjacency.
      perform id from public.participants order by id for update;
      select * into p from public.participants where id=p_participant_id;
      if not found then raise exception 'Missing participant' using errcode='P0002'; end if;
      select * into neighbor from public.participants where id=neighbor_id;
      if not found then raise exception 'Missing neighbor' using errcode='40001'; end if;
      perform private.require_access(p_token_hash,null,true);
      if p.version<>p_expected_version or neighbor.version<>(p_payload->>'neighbor_version')::integer then raise exception 'Stale move' using errcode='40001'; end if;
      select array_agg(id order by display_order,name,id) into ordered_ids from public.participants;
      target_index:=array_position(ordered_ids,p_participant_id);neighbor_index:=array_position(ordered_ids,neighbor_id);
      if neighbor_index<>target_index+(case when p_payload->>'direction'='up' then -1 else 1 end) then raise exception 'Changed adjacency' using errcode='40001'; end if;
      select count(*) into position_count from public.participants where display_order in (p.display_order,neighbor.display_order);
      if p.display_order<>neighbor.display_order and position_count=2 then
        update public.participants q set display_order=case when q.id=p.id then neighbor.display_order else p.display_order end where q.id in (p.id,neighbor.id);
      else
        -- Duplicate ranks need normalization, or swapping numeric values may jump multiple rows.
        ordered_ids[target_index]:=neighbor_id;ordered_ids[neighbor_index]:=p_participant_id;
        update public.participants q set display_order=desired.rank from
          (select id,(ord-1)::integer rank from unnest(ordered_ids) with ordinality as x(id,ord)) desired
          where q.id=desired.id and q.display_order is distinct from desired.rank;
      end if;
      select jsonb_agg(private.admin_participant_json(q) order by q.display_order,q.name,q.id) into results from public.participants q where id in (p.id,neighbor.id);
      return jsonb_build_object('ok',true,'participants',results,'reload_required',true);
    end if;
    if p_action='delete_participant' then
      if p_payload<>jsonb_build_object('confirm_participant_id',p_participant_id) then raise exception 'Exact delete confirmation required' using errcode='22023'; end if;
      -- Invalidate/delete target credentials BEFORE waiting for owner: other writes use credential -> owner.
      -- Lifecycle lock excludes concurrent issuance/revocation with their own target locks.
      perform id from private.access_tokens where participant_id=p_participant_id order by id for update;
    end if;
    select * into p from public.participants where id=p_participant_id for update;
    if not found then raise exception 'Missing participant' using errcode='P0002'; end if;
    perform private.require_access(p_token_hash,null,true);
    if p.version<>p_expected_version then raise exception 'Stale participant' using errcode='40001'; end if;
    if p_action='update_participant' then
      data:=private.normalize_admin_participant(p_payload,false);p:=jsonb_populate_record(p,data);
      if p.photo_path is not null then
        perform 1 from private.media_assets where participant_id=p.id and storage_path=p.photo_path for update;
        if not found then raise exception 'Unowned media' using errcode='42501'; end if;
      end if;
      perform private.require_access(p_token_hash,null,true);
      update public.participants q set name=p.name,slug=p.slug,display_order=p.display_order,avatar_key=p.avatar_key,
        photo_path=p.photo_path,photo_url=p.photo_url,personal_message=p.personal_message,general_preferences=p.general_preferences where id=p.id returning q.* into p;
      perform private.refresh_media_state(p.id);
      return jsonb_build_object('ok',true,'participant',private.admin_participant_json(p));
    end if;
    if p_action<>'delete_participant' then raise exception 'Unhandled action' using errcode='22023'; end if;
    -- No SQL DELETE on storage.objects. Durable tombstones survive participant/media cascades.
    perform storage_path from private.media_assets where participant_id=p.id order by storage_path for update;
    perform private.require_access(p_token_hash,null,true);
    select count(*) into gift_count from public.gifts where participant_id=p.id;
    select count(*) into token_count from private.access_tokens where participant_id=p.id;
    insert into private.media_deletions(storage_path)
      select storage_path from private.media_assets where participant_id=p.id
      union select o.name from storage.objects o where o.bucket_id='wishlist-media' and split_part(o.name,'/',1)=p.id::text
        and o.name~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(gift|avatar)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$'
      on conflict(storage_path) do update set completed_at=null;
    get diagnostics media_count=row_count;
    delete from public.participants where id=p.id;
    return jsonb_build_object('ok',true,'deleted',jsonb_build_object('id',p.id,'slug',p.slug,'gifts_removed',gift_count,'links_removed',token_count,'media_queued',media_count));
  exception
    when sqlstate '28000' then return jsonb_build_object('ok',false,'status',401,'error','ACCESS_UNAVAILABLE');
    when insufficient_privilege then return jsonb_build_object('ok',false,'status',403,'error','FORBIDDEN');
    when no_data_found then return jsonb_build_object('ok',false,'status',404,'error','NOT_FOUND');
    when serialization_failure or unique_violation then return jsonb_build_object('ok',false,'status',409,'error','CONFLICT');
    when invalid_parameter_value or check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or foreign_key_violation or datetime_field_overflow or invalid_datetime_format then
      return jsonb_build_object('ok',false,'status',422,'error','INVALID_REQUEST');
    when others then return jsonb_build_object('ok',false,'status',500,'error','SERVER_ERROR');
  end;
end;
$$;
notify pgrst,'reload schema';
