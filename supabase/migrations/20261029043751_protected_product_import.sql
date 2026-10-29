-- T16: operational replay protection. No participant token/database key reaches Node transport.
create table private.import_requests (
  nonce_hash bytea primary key check(octet_length(nonce_hash)=32),
  url_hash bytea not null check(octet_length(url_hash)=32),
  token_id uuid not null references private.access_tokens(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check(expires_at>created_at),
  claimed_at timestamptz check(claimed_at>=created_at)
);
create index import_requests_expiry_idx on private.import_requests(expires_at);
create index import_requests_token_idx on private.import_requests(token_id);
create index import_requests_participant_idx on private.import_requests(participant_id);
alter table private.import_requests enable row level security;
revoke all on private.import_requests from public,anon,authenticated;
grant select,insert,update,delete on private.import_requests to service_role;

create function public.server_prepare_import(p_token_hash text,p_participant_id uuid,p_url_hash text,p_nonce_hash text,p_expires_at timestamptz)
returns jsonb language plpgsql set search_path='' as $$
declare quota jsonb; scope jsonb;
begin
  if p_participant_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or
    p_url_hash is null or p_url_hash !~ '^[0-9a-f]{64}$' or p_nonce_hash is null or p_nonce_hash !~ '^[0-9a-f]{64}$' or
    p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '31 seconds' then
    return jsonb_build_object('ok',false,'error','INVALID_REQUEST','status',422);
  end if;
  quota:=private.operation_quota('import',p_token_hash);
  if not (quota->>'ok')::boolean then return quota; end if;
  delete from private.import_requests where ctid in (
    select ctid from private.import_requests where expires_at<=clock_timestamp()
    order by expires_at limit 100 for update skip locked
  );
  begin
    scope:=private.require_access(p_token_hash,p_participant_id,false);
    perform 1 from public.participants where id=p_participant_id for key share;
    if not found then raise exception 'Missing participant' using errcode='P0002'; end if;
    scope:=private.require_access(p_token_hash,p_participant_id,false);
    if p_expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'error','INVALID_REQUEST','status',422); end if;
    insert into private.import_requests(nonce_hash,url_hash,token_id,participant_id,expires_at)
      values(decode(p_nonce_hash,'hex'),decode(p_url_hash,'hex'),(scope->>'token_id')::uuid,p_participant_id,p_expires_at);
    return jsonb_build_object('ok',true);
  exception
    when sqlstate '28000' then return jsonb_build_object('ok',false,'error','ACCESS_UNAVAILABLE','status',401);
    when insufficient_privilege then return jsonb_build_object('ok',false,'error','FORBIDDEN','status',403);
    when no_data_found then return jsonb_build_object('ok',false,'error','NOT_FOUND','status',404);
    when unique_violation then return jsonb_build_object('ok',false,'error','INVALID_REQUEST','status',422);
  end;
end;
$$;

create function public.server_claim_import(p_nonce_hash text,p_url_hash text)
returns jsonb language plpgsql set search_path='' as $$
declare reservation private.import_requests%rowtype; token_hash text;
begin
  if p_nonce_hash is null or p_nonce_hash !~ '^[0-9a-f]{64}$' or p_url_hash is null or p_url_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false);
  end if;
  select * into reservation from private.import_requests where nonce_hash=decode(p_nonce_hash,'hex');
  if not found or reservation.claimed_at is not null or reservation.url_hash<>decode(p_url_hash,'hex') or reservation.expires_at<=clock_timestamp() then
    return jsonb_build_object('ok',false);
  end if;
  begin
    -- Credential -> owner -> nonce; expiration/revocation are checked again after waiting.
    select encode(a.token_hash,'hex') into token_hash from private.access_tokens a where id=reservation.token_id;
    perform private.require_access(token_hash,reservation.participant_id,false);
    perform 1 from public.participants where id=reservation.participant_id for key share;
    if not found then return jsonb_build_object('ok',false); end if;
    select * into reservation from private.import_requests where nonce_hash=decode(p_nonce_hash,'hex') for update;
    if not found or reservation.claimed_at is not null or reservation.expires_at<=clock_timestamp() or reservation.url_hash<>decode(p_url_hash,'hex') then
      return jsonb_build_object('ok',false);
    end if;
    perform private.require_access(token_hash,reservation.participant_id,false);
    update private.import_requests set claimed_at=clock_timestamp() where nonce_hash=reservation.nonce_hash;
    return jsonb_build_object('ok',true);
  exception when sqlstate '28000' or insufficient_privilege then return jsonb_build_object('ok',false);
  end;
end;
$$;

revoke all on function public.server_prepare_import(text,uuid,text,text,timestamptz),public.server_claim_import(text,text) from public,anon,authenticated;
grant execute on function public.server_prepare_import(text,uuid,text,text,timestamptz),public.server_claim_import(text,text) to service_role;
