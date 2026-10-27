-- No participants, gifts or access credentials are seeded by migrations.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
-- PostgreSQL's implicit PUBLIC function EXECUTE is global: a per-schema revoke alone
-- cannot remove it. Tighten future functions created by this migration owner as well.
alter default privileges revoke execute on functions from public, anon, authenticated;

-- Syntactic defense only. DNS/redirect/SSRF validation belongs to the future server transport.
create function private.is_https_url(value text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare host text;
begin
  if value is null then return true; end if;
  if length(value) > 2048 or value ~ '[[:space:][:cntrl:]\\]'
     or value !~ '^https://[A-Za-z0-9.-]+(:443)?([/?#]|$)' then return false; end if;
  host := lower(substring(value from '^https://([^/:?#]+)'));
  return host ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'
    and host !~ '\.\.' and host !~ '(^|\.)localhost$'
    and host !~ '\.(local|internal|localhost|test|invalid)$';
end;
$$;

create function private.valid_gift_details(kind text, value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare pair record; allowed text[]; item jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'object' or octet_length(value::text) > 8192 then
    return false;
  end if;
  if kind = 'clothing' then
    allowed := array['subtype','size','size_system','color','alternative_colors','fit','brand','material','notes'];
  elsif kind = 'object' then
    allowed := array['category','brand','model','color','dimensions','material','specifications','notes'];
  else return false;
  end if;
  for pair in select * from jsonb_each(value) loop
    if not (pair.key = any(allowed)) then return false; end if;
    if pair.key = 'alternative_colors' then
      if jsonb_typeof(pair.value) <> 'array' then return false; end if;
      if jsonb_array_length(pair.value) > 8 then return false; end if;
      for item in select * from jsonb_array_elements(pair.value) loop
        if jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 80 then return false; end if;
      end loop;
    elsif jsonb_typeof(pair.value) <> 'string' or length(pair.value #>> '{}') >
      (case when pair.key in ('notes','specifications') then 1000 else 120 end) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create function private.stamp_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    NEW.version := 1;
    NEW.created_at := transaction_timestamp();
  else
    NEW.version := OLD.version + 1;
    NEW.created_at := OLD.created_at;
  end if;
  NEW.updated_at := transaction_timestamp();
  return NEW;
end;
$$;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and length(name) between 1 and 80),
  slug text not null unique check (length(slug) between 1 and 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  photo_path text check (length(photo_path) between 1 and 512),
  photo_url text check (private.is_https_url(photo_url)),
  avatar_key text not null default 'gift' check (avatar_key in ('gift','tree','star','snowflake','bell','reindeer')),
  personal_message text check (length(personal_message) <= 500),
  general_preferences text check (length(general_preferences) <= 2000),
  display_order integer not null default 0 check (display_order >= 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  constraint participants_one_photo_source check (num_nonnulls(photo_path, photo_url) <= 1)
);
create index participants_display_order_idx on public.participants (display_order, name, id);
create trigger participants_stamp before insert or update on public.participants
  for each row execute function private.stamp_version();

create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  title text not null check (title = btrim(title) and length(title) between 1 and 120),
  description text check (length(description) <= 2000),
  image_path text check (length(image_path) between 1 and 512),
  image_url text check (private.is_https_url(image_url)),
  product_url text check (private.is_https_url(product_url)),
  reference_price numeric(12,2) check (reference_price >= 0 and reference_price <> 'NaN'::numeric),
  currency text default 'PEN' check (currency ~ '^[A-Z]{3}$'),
  gift_type text not null check (gift_type in ('clothing','object')),
  details jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  constraint gifts_participant_position_key unique (participant_id, position),
  constraint gifts_price_requires_currency check (reference_price is null or currency is not null),
  constraint gifts_one_image_source check (num_nonnulls(image_path, image_url) <= 1),
  constraint gifts_valid_details check (private.valid_gift_details(gift_type, details))
);
create trigger gifts_stamp before insert or update on public.gifts
  for each row execute function private.stamp_version();

create table public.event_settings (
  id smallint primary key default 1 check (id = 1),
  title text not null check (title = btrim(title) and length(title) between 1 and 100),
  welcome_message text not null check (length(btrim(welcome_message)) between 1 and 500),
  exchange_date date,
  default_currency text not null default 'PEN' check (default_currency = 'PEN'),
  suggested_budget numeric(12,2) check (suggested_budget >= 0 and suggested_budget <> 'NaN'::numeric),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp()
);
create trigger event_settings_stamp before insert or update on public.event_settings
  for each row execute function private.stamp_version();
insert into public.event_settings (title, welcome_message)
values ('Amigo Secreto 2026', '¡Bienvenido a nuestro Amigo Secreto! Comparte tres ideas para inspirar un regalo especial.');

create table private.access_tokens (
  id uuid primary key default gen_random_uuid(),
  access_type text not null check (access_type in ('participant','organizer')),
  participant_id uuid references public.participants(id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz check (expires_at > created_at),
  revoked_at timestamptz check (revoked_at >= created_at),
  constraint access_tokens_owner_matches_type check (
    (access_type = 'participant' and participant_id is not null) or
    (access_type = 'organizer' and participant_id is null)
  )
);
create index access_tokens_participant_idx on private.access_tokens(participant_id);
create unique index access_tokens_one_live_participant_idx on private.access_tokens(participant_id)
  where access_type = 'participant' and revoked_at is null;
create unique index access_tokens_one_live_organizer_idx on private.access_tokens(access_type)
  where access_type = 'organizer' and revoked_at is null;

create table private.rate_limits (
  key_hash bytea not null check (octet_length(key_hash) = 32),
  operation text not null check (operation in ('access','mutation','import','upload')),
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null check (expires_at > window_start),
  primary key (key_hash, operation, window_start)
);
create index rate_limits_expiry_idx on private.rate_limits(expires_at);

create table private.media_assets (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  storage_path text not null unique check (
    length(storage_path) <= 512 and
    storage_path ~ '^[0-9a-f-]{36}/(avatar|gift)/[0-9a-f-]{36}\.(webp|jpg|png)$' and
    split_part(storage_path, '/', 1) = participant_id::text
  ),
  created_by_token_id uuid references private.access_tokens(id) on delete set null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 3145728),
  state text not null default 'pending' check (state in ('pending','attached')),
  created_at timestamptz not null default transaction_timestamp(),
  unique (participant_id, storage_path)
);
create index media_assets_token_idx on private.media_assets(created_by_token_id);
create index media_assets_pending_idx on private.media_assets(created_at) where state = 'pending';

-- Composite FKs prevent associating another participant's file even from a buggy server.
alter table public.participants add constraint participants_owned_photo_fk
  foreign key (id, photo_path) references private.media_assets(participant_id, storage_path)
  deferrable initially immediate;
alter table public.gifts add constraint gifts_owned_image_fk
  foreign key (participant_id, image_path) references private.media_assets(participant_id, storage_path)
  deferrable initially immediate;

comment on schema private is 'Never expose in Data API. Contains authorization and maintenance data.';
comment on table private.access_tokens is 'Only SHA-256 of random 256-bit capability tokens. No raw credentials.';
comment on column public.event_settings.suggested_budget is 'Reserved, not configurable by the MVP UI.';
