-- Only bucket configuration is declarative. Never insert/delete storage.objects to manage files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wishlist-media', 'wishlist-media', true, 3145728,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public object downloads are served by Storage. No anonymous listing policy is needed.
-- Restrictive policies also block this bucket if a broad permissive policy already exists.
-- They do not affect other buckets. service_role is intentionally not a target role.
create policy wishlist_objects_no_client_access on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'wishlist-media') with check (bucket_id <> 'wishlist-media');
create policy wishlist_bucket_no_client_changes on storage.buckets as restrictive
  for all to anon, authenticated
  using (id <> 'wishlist-media') with check (id <> 'wishlist-media');

-- Storage already enables RLS on its managed tables; do not change ownership/managed grants.
