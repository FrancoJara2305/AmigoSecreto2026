-- PGlite-only minimal platform fixture, NEVER a migration or a remote SQL script.
-- Models roles/grants/storage metadata, not the Storage HTTP service or PostgREST.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

-- Model the normal protected mode of Supabase's statement-level delete guard.
-- Even DELETE matching zero rows can raise 42501 before row-level policies run.
create function storage.protect_delete() returns trigger language plpgsql as $$
begin
  raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
    using errcode = '42501';
end;
$$;
create trigger protect_objects_delete before delete on storage.objects
  for each statement execute function storage.protect_delete();
