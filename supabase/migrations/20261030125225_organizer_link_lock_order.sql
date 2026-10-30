-- T19: credential-before-owner order and expiry checks after lifecycle/actor/target waits.
-- Existing SECURITY INVOKER, quota policy and EXECUTE grants remain unchanged.
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
      -- Lock actor exclusively before authorization; a rotation cannot pass expiry while waiting.
      perform id from private.access_tokens where token_hash=decode(p_token_hash,'hex') for update;
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
      -- Same credential -> owner order as personal writes and T19 deletion.
      perform id from private.access_tokens where participant_id=p_participant_id order by id for update;
      select slug into target_slug from public.participants where id=p_participant_id for key share;
      if not found then raise exception 'Participant not found' using errcode='P0002'; end if;
    elsif p_participant_id is not null then
      raise exception 'Unexpected participant' using errcode='22023';
    end if;

    -- Target locks can wait; revalidate the organizer before any lifecycle write.
    actor := private.require_access(p_token_hash,p_participant_id,true);
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
notify pgrst,'reload schema';
