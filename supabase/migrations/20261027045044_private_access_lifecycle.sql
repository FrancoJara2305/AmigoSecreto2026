-- T07. Only hashes cross the database boundary. No default credentials or Auth users.
-- All functions are SECURITY INVOKER and have a fixed search_path.
create function private.require_access(
  p_token_hash text, p_participant_id uuid default null, p_organizer_only boolean default false
) returns jsonb language plpgsql set search_path = '' as $$
declare credential private.access_tokens%rowtype; participant_slug text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Access unavailable' using errcode = '28000';
  end if;
  -- T08 must call this inside the same transaction as its mutation. The shared row
  -- lock prevents a revocation from committing before an already-authorized change.
  select * into credential from private.access_tokens
    where token_hash = decode(p_token_hash, 'hex') for share;
  if not found or credential.revoked_at is not null or
     (credential.expires_at is not null and credential.expires_at <= clock_timestamp()) then
    raise exception 'Access unavailable' using errcode = '28000';
  end if;
  if (p_organizer_only and credential.access_type <> 'organizer') or
     (p_participant_id is not null and credential.access_type = 'participant'
      and credential.participant_id <> p_participant_id) then
    raise exception 'Operation forbidden' using errcode = '42501';
  end if;
  if credential.participant_id is not null then
    select slug into participant_slug from public.participants where id = credential.participant_id;
  end if;
  return jsonb_build_object('token_id',credential.id,'access_type',credential.access_type,
    'participant_id',credential.participant_id,'participant_slug',participant_slug,
    'expires_at',credential.expires_at);
end;
$$;

-- Maintenance-only bootstrap/recovery. Never granted to service_role or reachable via RPC.
create function private.bootstrap_organizer(p_new_hash text, p_recover boolean default false)
returns uuid language plpgsql set search_path = '' as $$
declare new_id uuid;
begin
  if p_new_hash is null or p_new_hash !~ '^[0-9a-f]{64}$' or p_recover is null then
    raise exception 'Invalid bootstrap request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(20261225, 7);
  if not p_recover and exists(select 1 from private.access_tokens where access_type='organizer') then
    raise exception 'Organizer already initialized; use explicit recovery' using errcode = '55000';
  end if;
  if exists(select 1 from private.access_tokens where token_hash=decode(p_new_hash,'hex')) then
    raise exception 'Replacement hash already used' using errcode = '23505';
  end if;
  update private.access_tokens set revoked_at=clock_timestamp()
    where access_type='organizer' and revoked_at is null;
  insert into private.access_tokens(access_type,token_hash)
    values ('organizer',decode(p_new_hash,'hex')) returning id into new_id;
  return new_id;
end;
$$;

-- A service-only RPC bridge lets Edge call private routines without exposing `private`
-- to PostgREST or adding a direct PostgreSQL driver. No raw token is accepted or returned.
create function public.server_access(
  p_action text, p_token_hash text, p_participant_id uuid default null,
  p_new_hash text default null, p_expires_at timestamptz default null
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_window_start timestamptz := date_trunc('minute',clock_timestamp());
  total integer; per_token integer; retry_seconds integer;
  actor jsonb; target_slug text; new_id uuid; revoked_count integer;
begin
  if p_action is null or p_action not in
    ('validate_access','issue_participant_link','revoke_participant_link','rotate_organizer_link')
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','INVALID_REQUEST','status',422);
  end if;
  -- Quotas live outside the exception subtransaction so failed credentials count too.
  -- Global quota bounds attempts even when an attacker changes token hashes/IP headers.
  insert into private.rate_limits as buckets(key_hash,operation,window_start,request_count,expires_at)
    values(decode(repeat('00',32),'hex'),'access',v_window_start,1,v_window_start+interval '1 minute')
    on conflict (key_hash,operation,window_start) do update set request_count=buckets.request_count+1
    returning request_count into total;
  retry_seconds := greatest(1,ceil(extract(epoch from v_window_start+interval '1 minute'-clock_timestamp()))::integer);
  if total > 120 then
    return jsonb_build_object('ok',false,'error','RATE_LIMITED','status',429,'retry_after',retry_seconds);
  end if;
  insert into private.rate_limits as buckets(key_hash,operation,window_start,request_count,expires_at)
    values(decode(p_token_hash,'hex'),'access',v_window_start,1,v_window_start+interval '1 minute')
    on conflict (key_hash,operation,window_start) do update set request_count=buckets.request_count+1
    returning request_count into per_token;
  if per_token > 30 then
    return jsonb_build_object('ok',false,'error','RATE_LIMITED','status',429,'retry_after',retry_seconds);
  end if;
  delete from private.rate_limits where ctid in
    (select ctid from private.rate_limits where expires_at < clock_timestamp()-interval '1 hour' limit 100);

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

revoke all on function private.require_access(text,uuid,boolean) from public,anon,authenticated;
grant execute on function private.require_access(text,uuid,boolean) to service_role;
revoke all on function private.bootstrap_organizer(text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.bootstrap_organizer(text,boolean) to postgres;
revoke all on function public.server_access(text,text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.server_access(text,text,uuid,text,timestamptz) to service_role;

comment on function public.server_access(text,text,uuid,text,timestamptz)
  is 'Server-only hash-based capability lifecycle. No bootstrap or application data mutations.';
