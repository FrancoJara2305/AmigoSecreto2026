-- T15: safe saturation for any existing integer counter and accurate overlapping-window retry.
create or replace function private.consume_quota(p_operation text,p_scope text,p_key bytea,p_seconds integer,p_limit integer)
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
      do update set request_count=case when b.request_count>=p_limit then p_limit+1 else b.request_count+1 end
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

create or replace function private.operation_quota(p_operation text,p_token_hash text)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; hourly jsonb; global_limit integer; token_limit integer; hourly_limit integer;
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
  if hourly_limit is not null then
    -- Both token windows count the attempt; report the longest remaining denial.
    hourly:=private.consume_quota(p_operation,'token',decode(p_token_hash,'hex'),3600,hourly_limit);
    if not (hourly->>'ok')::boolean and ((result->>'ok')::boolean or
      (hourly->>'retry_after')::integer>(result->>'retry_after')::integer) then return hourly; end if;
  end if;
  return result;
end;
$$;
