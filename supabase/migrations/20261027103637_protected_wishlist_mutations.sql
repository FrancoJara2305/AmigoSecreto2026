-- T08. A closed, service-only RPC. No client role receives write privileges.
create function private.normalize_mutation_payload(p_action text,p_data jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare pair record; allowed text[]; data jsonb:=p_data; url_key text; path_key text;
begin
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>32768 then
    raise exception 'Invalid payload' using errcode='22023';
  end if;
  if p_action='update_profile' then
    allowed:=array['photo_url','photo_path','avatar_key','personal_message','general_preferences'];
    url_key:='photo_url'; path_key:='photo_path';
  else
    allowed:=array['title','description','image_url','image_path','product_url','reference_price','currency','gift_type','details'];
    url_key:='image_url'; path_key:='image_path';
  end if;
  if p_data='{}'::jsonb then raise exception 'Empty payload' using errcode='22023'; end if;
  for pair in select * from jsonb_each(p_data) loop
    if not (pair.key=any(allowed)) then raise exception 'Unknown field' using errcode='22023'; end if;
    if pair.key='details' then
      if jsonb_typeof(pair.value)<>'object' then raise exception 'Invalid details' using errcode='22023'; end if;
    elsif pair.key='reference_price' and pair.value<>'null'::jsonb then
      -- Do not let numeric(12,2) silently round a caller's third decimal digit.
      if jsonb_typeof(pair.value) not in ('string','number') or
        (pair.value#>>'{}') !~ '^\d{1,10}([.,]\d{1,2})?$' then
        raise exception 'Invalid price' using errcode='22023';
      end if;
      data:=jsonb_set(data,array[pair.key],to_jsonb(replace(pair.value#>>'{}',',','.')));
    elsif pair.key<>'reference_price' then
      if jsonb_typeof(pair.value) not in ('string','null') then raise exception 'Invalid text field' using errcode='22023'; end if;
      if pair.value<>'null'::jsonb then
        data:=jsonb_set(data,array[pair.key],to_jsonb(btrim(pair.value#>>'{}')));
      end if;
    end if;
  end loop;
  if data?'currency' and data->'currency'<>'null'::jsonb then
    data:=jsonb_set(data,'{currency}',to_jsonb(upper(data->>'currency')));
  end if;
  if data->>url_key is not null and data->>path_key is not null then
    raise exception 'Only one image source' using errcode='22023';
  elsif data->>url_key is not null then data:=data||jsonb_build_object(path_key,null);
  elsif data->>path_key is not null then data:=data||jsonb_build_object(url_key,null);
  end if;
  return data;
end;
$$;

create function private.refresh_media_state(p_participant_id uuid)
returns void language sql set search_path='' as $$
  update private.media_assets m set state=case when
    exists(select 1 from public.participants p where p.id=p_participant_id and p.photo_path=m.storage_path) or
    exists(select 1 from public.gifts g where g.participant_id=p_participant_id and g.image_path=m.storage_path)
    then 'attached' else 'pending' end
  where m.participant_id=p_participant_id;
$$;

create function public.server_mutate(
  p_action text,p_token_hash text,p_participant_id uuid,p_expected_version integer default null,
  p_position smallint default null,p_gift_id uuid default null,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql set search_path='' as $$
declare
  v_window timestamptz:=date_trunc('minute',clock_timestamp());
  total integer; per_token integer; retry_seconds integer;
  v_data jsonb; v_profile public.participants%rowtype; v_gift public.gifts%rowtype;
  result jsonb; media_path text; creating boolean:=p_action='create_gift';
begin
  if p_action is null or p_action not in ('update_profile','create_gift','update_gift','delete_gift') or
    p_participant_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','INVALID_REQUEST','status',422);
  end if;
  -- Persistent counters precede authorization; rejected writes count too.
  insert into private.rate_limits as buckets(key_hash,operation,window_start,request_count,expires_at)
    values(decode(repeat('00',32),'hex'),'mutation',v_window,1,v_window+interval '1 minute')
    on conflict(key_hash,operation,window_start) do update set request_count=buckets.request_count+1
    returning request_count into total;
  insert into private.rate_limits as buckets(key_hash,operation,window_start,request_count,expires_at)
    values(decode(p_token_hash,'hex'),'mutation',v_window,1,v_window+interval '1 minute')
    on conflict(key_hash,operation,window_start) do update set request_count=buckets.request_count+1
    returning request_count into per_token;
  if total>240 or per_token>60 then
    retry_seconds:=greatest(1,ceil(extract(epoch from v_window+interval '1 minute'-clock_timestamp()))::integer);
    return jsonb_build_object('ok',false,'error','RATE_LIMITED','status',429,'retry_after',retry_seconds);
  end if;
  begin
    -- Order: quota -> credential share lock -> participant -> gift -> media.
    perform private.require_access(p_token_hash,p_participant_id,false);
    select * into v_profile from public.participants where id=p_participant_id for update;
    if not found then raise exception 'Missing participant' using errcode='P0002'; end if;
    -- Expiry may have passed while waiting for the participant lock.
    perform private.require_access(p_token_hash,p_participant_id,false);
    if p_action<>'create_gift' and (p_expected_version is null or p_expected_version<1) then
      raise exception 'Version required' using errcode='22023';
    end if;
    if p_action='update_profile' then
      if p_position is not null or p_gift_id is not null then raise exception 'Unexpected gift' using errcode='22023'; end if;
      if v_profile.version<>p_expected_version then raise exception 'Stale profile' using errcode='40001'; end if;
      v_data:=private.normalize_mutation_payload(p_action,p_payload);
      v_profile:=jsonb_populate_record(v_profile,v_data);
      media_path:=v_profile.photo_path;
    else
      if p_position is null or p_position not between 1 and 3 then raise exception 'Invalid position' using errcode='22023'; end if;
      if creating then
        if p_gift_id is not null or p_expected_version is not null then raise exception 'Unexpected identity' using errcode='22023'; end if;
        if exists(select 1 from public.gifts where participant_id=p_participant_id and position=p_position) then
          raise exception 'Position occupied' using errcode='23505';
        end if;
        v_gift.id:=gen_random_uuid(); v_gift.participant_id:=p_participant_id; v_gift.position:=p_position;
        v_gift.currency:='PEN'; v_gift.details:='{}'::jsonb;
        v_gift.version:=1; v_gift.created_at:=transaction_timestamp(); v_gift.updated_at:=transaction_timestamp();
      else
        if p_gift_id is null then raise exception 'Gift id required' using errcode='22023'; end if;
        select * into v_gift from public.gifts where id=p_gift_id and participant_id=p_participant_id and position=p_position for update;
        if not found then
          if exists(select 1 from public.gifts where participant_id=p_participant_id and position=p_position) then
            raise exception 'Position identity changed' using errcode='40001';
          end if;
          raise exception 'Gift not found' using errcode='P0002';
        end if;
        if v_gift.version<>p_expected_version then raise exception 'Stale gift' using errcode='40001'; end if;
      end if;
      if p_action='delete_gift' then
        if p_payload is distinct from '{}'::jsonb then raise exception 'Unexpected payload' using errcode='22023'; end if;
        delete from public.gifts where id=v_gift.id;
        perform private.refresh_media_state(p_participant_id);
        return jsonb_build_object('ok',true,'deleted',jsonb_build_object('id',v_gift.id,'position',v_gift.position));
      end if;
      v_data:=private.normalize_mutation_payload(p_action,p_payload);
      if v_data?'gift_type' and v_data->>'gift_type' is distinct from v_gift.gift_type and not (v_data?'details') then
        v_data:=v_data||jsonb_build_object('details','{}'::jsonb);
      end if;
      v_gift:=jsonb_populate_record(v_gift,v_data);
      media_path:=v_gift.image_path;
    end if;
    if media_path is not null then
      perform 1 from private.media_assets where participant_id=p_participant_id and storage_path=media_path for update;
      if not found then raise exception 'Unowned media' using errcode='42501'; end if;
    end if;
    if p_action='update_profile' then
      update public.participants as saved set photo_url=v_profile.photo_url,photo_path=v_profile.photo_path,
        avatar_key=v_profile.avatar_key,personal_message=v_profile.personal_message,general_preferences=v_profile.general_preferences
        where id=p_participant_id returning to_jsonb(saved) into result;
      perform private.refresh_media_state(p_participant_id);
      return jsonb_build_object('ok',true,'participant',result);
    elsif creating then
      insert into public.gifts as saved select (v_gift).* returning to_jsonb(saved) into result;
    else
      update public.gifts as saved set title=v_gift.title,description=v_gift.description,image_url=v_gift.image_url,
        image_path=v_gift.image_path,product_url=v_gift.product_url,reference_price=v_gift.reference_price,
        currency=v_gift.currency,gift_type=v_gift.gift_type,details=v_gift.details
        where id=v_gift.id returning to_jsonb(saved) into result;
    end if;
    perform private.refresh_media_state(p_participant_id);
    return jsonb_build_object('ok',true,'gift',result);
  exception
    when sqlstate '28000' then return jsonb_build_object('ok',false,'error','ACCESS_UNAVAILABLE','status',401);
    when insufficient_privilege then return jsonb_build_object('ok',false,'error','FORBIDDEN','status',403);
    when no_data_found then return jsonb_build_object('ok',false,'error','NOT_FOUND','status',404);
    when serialization_failure or unique_violation then return jsonb_build_object('ok',false,'error','CONFLICT','status',409);
    when invalid_parameter_value or check_violation or not_null_violation or invalid_text_representation
      or numeric_value_out_of_range or foreign_key_violation then
      return jsonb_build_object('ok',false,'error','INVALID_REQUEST','status',422);
    when others then return jsonb_build_object('ok',false,'error','SERVER_ERROR','status',500);
  end;
end;
$$;

revoke all on function private.normalize_mutation_payload(text,jsonb) from public,anon,authenticated;
revoke all on function private.refresh_media_state(uuid) from public,anon,authenticated;
grant execute on function private.normalize_mutation_payload(text,jsonb),private.refresh_media_state(uuid) to service_role;
revoke all on function public.server_mutate(text,text,uuid,integer,smallint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.server_mutate(text,text,uuid,integer,smallint,uuid,jsonb) to service_role;

comment on function public.server_mutate(text,text,uuid,integer,smallint,uuid,jsonb)
  is 'T08: authorized transactional profile/gift mutations; explicit fields, ids and optimistic versions.';
