-- T15. Keep capability authorization inside the existing write transactions.
-- Quota state is private, fixed-window, UTC and shared by every Edge isolate.
alter table private.rate_limits add column scope text not null default 'token'
  check(scope in ('global','token','network'));
alter table private.rate_limits add column window_seconds integer not null default 60
  check(window_seconds in (60,3600));
update private.rate_limits set scope='global' where key_hash=decode(repeat('00',32),'hex');
alter table private.rate_limits drop constraint rate_limits_pkey;
alter table private.rate_limits add primary key(key_hash,operation,scope,window_seconds,window_start);
alter table private.rate_limits drop constraint rate_limits_operation_check;
alter table private.rate_limits add constraint rate_limits_operation_check
  check(operation in ('access','mutation','import','upload','request','failed_access'));

create function private.prune_rate_limits(p_limit integer default 100)
returns integer language plpgsql set search_path='' as $$
declare removed integer;
begin
  if p_limit is null or p_limit not between 1 and 5000 then
    raise exception 'Invalid cleanup limit' using errcode='22023';
  end if;
  delete from private.rate_limits where ctid in (
    select ctid from private.rate_limits where expires_at<=clock_timestamp()
    order by expires_at,key_hash,operation,scope,window_seconds,window_start
    limit p_limit for update skip locked
  );
  get diagnostics removed=row_count;
  return removed;
end;
$$;

create function private.consume_quota(p_operation text,p_scope text,p_key bytea,p_seconds integer,p_limit integer)
returns jsonb language plpgsql set search_path='' as $$
declare started timestamptz; ends timestamptz; counted integer;
begin
  if p_operation is null or p_operation not in ('access','mutation','import','upload','request','failed_access') or
    p_scope is null or p_scope not in ('global','token','network') or p_key is null or octet_length(p_key)<>32 or
    p_seconds is null or p_seconds not in (60,3600) or p_limit is null or p_limit not between 1 and 10000 then
    raise exception 'Invalid quota parameters' using errcode='22023';
  end if;
  loop
    started:=to_timestamp(floor(extract(epoch from clock_timestamp())/p_seconds)*p_seconds);
    ends:=started+make_interval(secs=>p_seconds);
    insert into private.rate_limits as b(key_hash,operation,scope,window_seconds,window_start,expires_at)
      values(p_key,p_operation,p_scope,p_seconds,started,ends)
      on conflict(key_hash,operation,scope,window_seconds,window_start)
      do update set request_count=least(b.request_count+1,p_limit+1)
      returning request_count into counted;
    -- A concurrent transaction may have held this bucket until its window expired.
    exit when clock_timestamp()<ends;
  end loop;
  -- Bounded, indexed cleanup at a new global window and each 25 accepted requests.
  -- SKIP LOCKED avoids waiting for another request's transaction.
  if p_scope='global' and counted<=p_limit and counted%25=1 then
    perform private.prune_rate_limits(100);
  end if;
  if counted>p_limit then
    return jsonb_build_object('ok',false,'status',429,'error','RATE_LIMITED',
      'retry_after',greatest(1,ceil(extract(epoch from ends-clock_timestamp()))::integer));
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

create function private.operation_quota(p_operation text,p_token_hash text)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; global_limit integer; token_limit integer; hourly_limit integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'status',422,'error','INVALID_REQUEST');
  end if;
  case p_operation
    when 'access' then global_limit:=120; token_limit:=30;
    when 'mutation' then global_limit:=240; token_limit:=60;
    when 'import' then global_limit:=60; token_limit:=5; hourly_limit:=30;
    when 'upload' then global_limit:=120; token_limit:=6; hourly_limit:=10;
    else return jsonb_build_object('ok',false,'status',422,'error','INVALID_REQUEST');
  end case;
  -- Global first bounds cardinality even when an attacker rotates capability hashes.
  -- Lock order is always global -> token minute -> token hour -> authorization.
  result:=private.consume_quota(p_operation,'global',decode(repeat('00',32),'hex'),60,global_limit);
  if not (result->>'ok')::boolean then return result; end if;
  result:=private.consume_quota(p_operation,'token',decode(p_token_hash,'hex'),60,token_limit);
  if not (result->>'ok')::boolean then return result; end if;
  if hourly_limit is not null then
    result:=private.consume_quota(p_operation,'token',decode(p_token_hash,'hex'),3600,hourly_limit);
  end if;
  return result;
end;
$$;

-- Ingress RPC has fixed policies, never caller-provided limits. Only server_role can call it.
create function public.server_rate_limit(p_action text,p_network_hash text default null)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; blocked_until timestamptz;
begin
  if p_action is null or p_action not in ('request','failure') or
    (p_network_hash is not null and p_network_hash !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('ok',false,'status',422,'error','INVALID_REQUEST');
  end if;
  if p_action='failure' then
    result:=private.consume_quota('failed_access','global',decode(repeat('00',32),'hex'),60,120);
    if not (result->>'ok')::boolean then return result; end if;
    if p_network_hash is not null then
      result:=private.consume_quota('failed_access','network',decode(p_network_hash,'hex'),60,20);
    end if;
    return result;
  end if;
  result:=private.consume_quota('request','global',decode(repeat('00',32),'hex'),60,600);
  if not (result->>'ok')::boolean then return result; end if;
  if p_network_hash is not null then
    result:=private.consume_quota('request','network',decode(p_network_hash,'hex'),60,120);
    if not (result->>'ok')::boolean then return result; end if;
  end if;
  select max(expires_at) into blocked_until from private.rate_limits
    where operation='failed_access' and window_seconds=60 and expires_at>clock_timestamp() and (
      (scope='global' and key_hash=decode(repeat('00',32),'hex') and request_count>=120) or
      (scope='network' and p_network_hash is not null and key_hash=decode(p_network_hash,'hex') and request_count>=20)
    );
  if blocked_until is not null then
    return jsonb_build_object('ok',false,'status',429,'error','RATE_LIMITED',
      'retry_after',greatest(1,ceil(extract(epoch from blocked_until-clock_timestamp()))::integer));
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

create function public.server_rate_limits_cleanup(p_limit integer default 1000,p_dry_run boolean default true)
returns jsonb language plpgsql set search_path='' as $$
declare candidates integer;
begin
  if p_limit is null or p_limit not between 1 and 5000 or p_dry_run is null then
    raise exception 'Invalid cleanup parameters' using errcode='22023';
  end if;
  if p_dry_run then
    select count(*) into candidates from (select 1 from private.rate_limits
      where expires_at<=clock_timestamp() limit p_limit) batch;
    return jsonb_build_object('dry_run',true,'candidates',candidates,'limit',p_limit);
  end if;
  return jsonb_build_object('dry_run',false,'removed',private.prune_rate_limits(p_limit),'limit',p_limit);
end;
$$;

revoke all on function private.prune_rate_limits(integer),private.consume_quota(text,text,bytea,integer,integer),
 private.operation_quota(text,text),public.server_rate_limit(text,text),public.server_rate_limits_cleanup(integer,boolean)
 from public,anon,authenticated;
grant execute on function private.prune_rate_limits(integer),private.consume_quota(text,text,bytea,integer,integer),
 private.operation_quota(text,text),public.server_rate_limit(text,text),public.server_rate_limits_cleanup(integer,boolean)
 to service_role;

-- Existing RPC signatures remain stable. The following explicit replacements only
-- centralize their quota blocks; authorization/ownership/version logic is preserved.
create or replace function public.server_access(
  p_action text, p_token_hash text, p_participant_id uuid default null,
  p_new_hash text default null, p_expires_at timestamptz default null
) returns jsonb language plpgsql set search_path = '' as $$
declare
  quota jsonb;
  actor jsonb; target_slug text; new_id uuid; revoked_count integer;
begin
  if p_action is null or p_action not in
    ('validate_access','issue_participant_link','revoke_participant_link','rotate_organizer_link')
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','INVALID_REQUEST','status',422);
  end if;
  quota:=private.operation_quota('access',p_token_hash);
  if not (quota->>'ok')::boolean then return quota; end if;

  begin
    if p_action <> 'validate_access' then
      -- Serialize the tiny event's token lifecycle, including initial bootstrap/recovery.
      -- Lock order: quota -> lifecycle advisory lock -> actor -> target.
      perform pg_advisory_xact_lock(20261225, 7);
    end if;
    actor := private.require_access(p_token_hash,p_participant_id,p_action<>'validate_access');
    if p_action = 'validate_access' then
      if p_new_hash is not null or p_expires_at is not null then
        raise exception 'Invalid request' using errcode='22023';
      end if;
      return jsonb_build_object('ok',true,'access',actor);
    end if;

    if p_action in ('issue_participant_link','revoke_participant_link') then
      if p_participant_id is null then raise exception 'Missing participant' using errcode='22023'; end if;
      select slug into target_slug from public.participants where id=p_participant_id for key share;
      if not found then raise exception 'Participant not found' using errcode='P0002'; end if;
    elsif p_participant_id is not null then
      raise exception 'Unexpected participant' using errcode='22023';
    end if;

    if p_action='revoke_participant_link' then
      if p_new_hash is not null or p_expires_at is not null then
        raise exception 'Unexpected replacement' using errcode='22023';
      end if;
      update private.access_tokens set revoked_at=clock_timestamp()
        where participant_id=p_participant_id and revoked_at is null;
      get diagnostics revoked_count=row_count;
      return jsonb_build_object('ok',true,'revoked',revoked_count);
    end if;

    if p_new_hash is null or p_new_hash !~ '^[0-9a-f]{64}$' or
      (p_expires_at is not null and (not isfinite(p_expires_at) or p_expires_at<=clock_timestamp())) then
      raise exception 'Invalid replacement' using errcode='22023';
    end if;
    if exists(select 1 from private.access_tokens where token_hash=decode(p_new_hash,'hex')) then
      raise exception 'Replacement hash already used' using errcode='23505';
    end if;
    if p_action='issue_participant_link' then
      update private.access_tokens set revoked_at=clock_timestamp()
        where participant_id=p_participant_id and revoked_at is null;
      insert into private.access_tokens(access_type,participant_id,token_hash,expires_at)
        values('participant',p_participant_id,decode(p_new_hash,'hex'),p_expires_at) returning id into new_id;
    else
      update private.access_tokens set revoked_at=clock_timestamp()
        where id=(actor->>'token_id')::uuid;
      insert into private.access_tokens(access_type,token_hash,expires_at)
        values('organizer',decode(p_new_hash,'hex'),p_expires_at) returning id into new_id;
    end if;
    return jsonb_build_object('ok',true,'token_id',new_id,'participant_slug',target_slug,
      'expires_at',p_expires_at);
  exception
    when sqlstate '28000' then return jsonb_build_object('ok',false,'error','ACCESS_UNAVAILABLE','status',401);
    when insufficient_privilege then return jsonb_build_object('ok',false,'error','FORBIDDEN','status',403);
    when no_data_found then return jsonb_build_object('ok',false,'error','NOT_FOUND','status',404);
    when invalid_parameter_value then return jsonb_build_object('ok',false,'error','INVALID_REQUEST','status',422);
    when unique_violation then return jsonb_build_object('ok',false,'error','CONFLICT','status',409);
    when others then return jsonb_build_object('ok',false,'error','SERVER_ERROR','status',500);
  end;
end;
$$;

create or replace function public.server_mutate(
  p_action text,p_token_hash text,p_participant_id uuid,p_expected_version integer default null,
  p_position smallint default null,p_gift_id uuid default null,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql set search_path='' as $$
declare
  quota jsonb;
  v_data jsonb; v_profile public.participants%rowtype; v_gift public.gifts%rowtype;
  result jsonb; media_path text; creating boolean:=p_action='create_gift';
begin
  if p_action is null or p_action not in ('update_profile','create_gift','update_gift','delete_gift') or
    p_participant_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','INVALID_REQUEST','status',422);
  end if;
  quota:=private.operation_quota('mutation',p_token_hash);
  if not (quota->>'ok')::boolean then return quota; end if;
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

create or replace function public.server_media_upload(p_action text,p_token_hash text,p_participant_id uuid,
  p_purpose text,p_path text default null,p_size integer default null)
returns jsonb language plpgsql set search_path='' as $$
declare scope jsonb; path text; quota jsonb;
begin
  if p_action is null or p_action not in ('reserve','complete') or p_purpose is null or p_purpose not in ('gift','avatar') or
    p_participant_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'status',422,'error','INVALID_REQUEST');
  end if;
  if p_action='reserve' then
    quota:=private.operation_quota('upload',p_token_hash);
    if not (quota->>'ok')::boolean then return quota; end if;
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
