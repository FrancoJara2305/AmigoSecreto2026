-- Gift assistant ("Otra consulta"): private global quota plus canonical public context, server-only.
-- Provider calls are bounded before they happen. Limits are fixed here, never chosen by callers.
alter table private.rate_limits drop constraint rate_limits_operation_check;
alter table private.rate_limits add constraint rate_limits_operation_check
  check(operation in ('access','mutation','import','upload','request','failed_access','assistant'));
-- Daily windows align with UTC midnight (19:00 in Lima).
alter table private.rate_limits drop constraint rate_limits_window_seconds_check;
alter table private.rate_limits add constraint rate_limits_window_seconds_check
  check(window_seconds in (60,3600,86400));

create or replace function private.consume_quota(p_operation text,p_scope text,p_key bytea,p_seconds integer,p_limit integer)
returns jsonb language plpgsql set search_path='' as $$
declare started timestamptz; ends timestamptz; counted integer;
begin
  if p_operation is null or p_operation not in ('access','mutation','import','upload','request','failed_access','assistant') or
    p_scope is null or p_scope not in ('global','token','network') or p_key is null or octet_length(p_key)<>32 or
    p_seconds is null or p_seconds not in (60,3600,86400) or p_limit is null or p_limit not between 1 and 10000 then
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

-- No verified client IP (RATE_LIMIT_IP_SOURCE=off), so the bound is global: when it is spent the
-- assistant pauses for everyone while the catalogue and editing keep their own quotas.
create function public.server_assistant(p_participant_id uuid,p_gift_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; person jsonb; item jsonb;
begin
  if p_participant_id is null then
    return jsonb_build_object('ok',false,'status',422,'error','INVALID_REQUEST');
  end if;
  -- Lock order: global minute -> global day -> context. Attempts count even when the context is
  -- missing, so probing identifiers spends the same budget.
  result:=private.consume_quota('assistant','global',decode(repeat('00',32),'hex'),60,10);
  if not (result->>'ok')::boolean then return result; end if;
  result:=private.consume_quota('assistant','global',decode(repeat('00',32),'hex'),86400,200);
  if not (result->>'ok')::boolean then return result; end if;

  -- Public catalogue fields only: no name, slug, photo, message or credential data.
  select jsonb_build_object('id',p.id,'general_preferences',p.general_preferences)
    into person from public.participants p where p.id=p_participant_id;
  if person is null then return jsonb_build_object('ok',false,'status',404,'error','NOT_FOUND'); end if;
  if p_gift_id is not null then
    select jsonb_build_object('id',g.id,'title',g.title,'description',g.description,'gift_type',g.gift_type,
      'details',g.details,'reference_price',g.reference_price,'currency',g.currency,'product_url',g.product_url)
      into item from public.gifts g where g.id=p_gift_id and g.participant_id=p_participant_id;
    if item is null then return jsonb_build_object('ok',false,'status',404,'error','NOT_FOUND'); end if;
  end if;
  return jsonb_build_object('ok',true,'participant',person,'gift',item);
end;
$$;

revoke all on function public.server_assistant(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_assistant(uuid,uuid) to service_role;
