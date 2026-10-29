-- User-provided roster, LOCAL ONLY. Not a schema migration or a production seed.
-- Run via npm run participants:local. No private links, Auth users or invented wishes.
begin;
do $$
begin
  if current_setting('app.seed_environment', true) is distinct from 'local' then
    raise exception 'Roster disabled: use the local-only participant runner.';
  end if;
end;
$$;

lock table public.participants, public.gifts, private.access_tokens, private.media_assets in share row exclusive mode;
create temporary table initial_roster (
  id uuid primary key, name text not null, slug text not null unique, avatar_key text not null,
  display_order integer not null, demo_name text not null, demo_slug text not null
) on commit drop;
insert into initial_roster values
 ('11111111-1111-4111-8111-000000000001','Melyza','melyza','star',1,'Ana','ana'),
 ('11111111-1111-4111-8111-000000000002','Karina','karina','reindeer',2,'Bruno','bruno'),
 ('11111111-1111-4111-8111-000000000003','Norma','norma','bell',3,'Camila','camila'),
 ('11111111-1111-4111-8111-000000000004','Magaly','magaly','tree',4,'Diego','diego'),
 ('11111111-1111-4111-8111-000000000005','Cesar','cesar','snowflake',5,'Elena','elena'),
 ('11111111-1111-4111-8111-000000000006','Fabrizio','fabrizio','gift',6,'Gabriel','gabriel'),
 ('11111111-1111-4111-8111-000000000007','Brandon','brandon','star',7,'Lucía','lucia'),
 ('11111111-1111-4111-8111-000000000008','Pamela','pamela','reindeer',8,'Mateo','mateo'),
 ('11111111-1111-4111-8111-000000000009','Franco','franco','bell',9,'Natalia','natalia'),
 ('11111111-1111-4111-8111-000000000010','Derek Leonardo','derek-leonardo','tree',10,'Sofía','sofia'),
 ('11111111-1111-4111-8111-000000000011','Alice','alice','gift',11,'Tomás','tomas');

do $$
begin
  if exists (select 1 from public.participants p where not exists (select 1 from initial_roster r where r.id = p.id)) then
    raise exception 'Roster refused: unrelated participants exist. No data was changed.';
  end if;
  if exists (select 1 from initial_roster r join public.participants p on p.slug = r.slug where p.id <> r.id) then
    raise exception 'Roster refused: slug conflict. No data was changed.';
  end if;

  if exists (select 1 from public.participants p join initial_roster r using(id) where p.name = r.demo_name and p.slug = r.demo_slug) then
    -- Only replace the complete pristine T06 fixture. Updates increment version in the DB.
    if (select count(*) from public.participants p join initial_roster r using(id)
      where p.name = r.demo_name and p.slug = r.demo_slug and p.version = 1
        and p.photo_path is null and p.photo_url is null) <> 11
      or (select count(*) from public.gifts) <> 18
      or exists (select 1 from public.gifts where version <> 1 or image_path is not null or image_url is not null
        or id not in (select ('22222222-2222-4222-8222-' || lpad(n::text,12,'0'))::uuid from generate_series(1,18) n))
      or exists (select 1 from private.media_assets)
      or exists (select 1 from private.access_tokens where participant_id is not null) then
      raise exception 'Roster refused: demo has custom changes or private access. Review locally before replacing it.';
    end if;
    delete from public.gifts;
    update public.participants p set name = r.name, slug = r.slug, avatar_key = r.avatar_key,
      personal_message = null, general_preferences = null, display_order = r.display_order
      from initial_roster r where p.id = r.id;
  end if;
end;
$$;

-- Re-running does not reset names, order, slugs, preferences or gifts edited later.
insert into public.participants (id,name,slug,avatar_key,display_order)
select id,name,slug,avatar_key,display_order from initial_roster
on conflict (id) do nothing;
select count(*) as participants from public.participants;
select count(*) as gifts from public.gifts;
commit;
