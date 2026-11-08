-- Starcast database schema for Supabase (Postgres + PostGIS).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste this file -> Run.
-- Safe to run again: it only creates what is missing.
--
-- Security: every table has row-level security (RLS). Each signed-in person can read and
-- change only their own rows; visitors who are not signed in can read nothing.

create extension if not exists postgis with schema extensions;

-------------------------------------------------------------------------------
-- 1. Everything a person keeps in Starcast (gear, log, settings...), as one JSON document.
--    The app already stores these as named keys in the browser; this mirrors them.
-------------------------------------------------------------------------------
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists "user_state: own row" on public.user_state;
create policy "user_state: own row" on public.user_state
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- 2. Saved observing locations as real geography points, so they can be queried spatially
--    (distance, nearest dark site, clustering, map services) as Starcast grows.
-------------------------------------------------------------------------------
create table if not exists public.saved_locations (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id  text not null,                       -- the app's own id for the spot
  name       text not null check (char_length(name) between 1 and 120),
  geom       extensions.geography(Point, 4326) not null,
  bortle     smallint check (bortle between 1 and 9),
  is_home    boolean not null default false,
  alerts     boolean not null default true,
  horizon    smallint[] check (horizon is null or array_length(horizon, 1) = 8),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create index if not exists saved_locations_geom_idx on public.saved_locations using gist (geom);
create index if not exists saved_locations_user_idx on public.saved_locations (user_id);

alter table public.saved_locations enable row level security;

drop policy if exists "saved_locations: own rows" on public.saved_locations;
create policy "saved_locations: own rows" on public.saved_locations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Readable view with latitude and longitude as plain numbers (for the app and for GIS tools).
create or replace view public.saved_locations_v
with (security_invoker = true) as
select id, user_id, client_id, name, bortle, is_home, alerts, horizon, updated_at,
       extensions.st_y(geom::extensions.geometry) as lat,
       extensions.st_x(geom::extensions.geometry) as lon
from public.saved_locations;

-- Replace a person's saved locations in one call (the app sends its whole list).
create or replace function public.sync_saved_locations(spots jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  delete from public.saved_locations
   where user_id = (select auth.uid())
     and client_id not in (select s->>'client_id' from jsonb_array_elements(spots) s);
  insert into public.saved_locations as t (user_id, client_id, name, geom, bortle, is_home, alerts, horizon, updated_at)
  select (select auth.uid()),
         s->>'client_id',
         left(coalesce(nullif(s->>'name', ''), 'My spot'), 120),
         extensions.st_setsrid(extensions.st_makepoint((s->>'lon')::float8, (s->>'lat')::float8), 4326)::extensions.geography,
         nullif(s->>'bortle', '')::smallint,
         coalesce((s->>'is_home')::boolean, false),
         coalesce((s->>'alerts')::boolean, true),
         case when jsonb_typeof(s->'horizon') = 'array'
              then array(select (x)::smallint from jsonb_array_elements_text(s->'horizon') x)
              else null end,
         now()
    from jsonb_array_elements(spots) s
  on conflict (user_id, client_id) do update
     set name = excluded.name, geom = excluded.geom, bortle = excluded.bortle,
         is_home = excluded.is_home, alerts = excluded.alerts, horizon = excluded.horizon,
         updated_at = now();
end;
$$;

revoke all on function public.sync_saved_locations(jsonb) from public, anon;
grant execute on function public.sync_saved_locations(jsonb) to authenticated;

-- Example spatial query (for later): a person's saved spots within 100 km of a point.
--   select name, round(extensions.st_distance(geom, extensions.st_makepoint(-89.40, 43.07)::extensions.geography) / 1000) as km
--     from public.saved_locations
--    where extensions.st_dwithin(geom, extensions.st_makepoint(-89.40, 43.07)::extensions.geography, 100000)
--    order by km;

-------------------------------------------------------------------------------
-- 4. Sky reports: what observers actually saw, stored next to what Starcast forecast for
--    that place and hour. Anyone can send one (signed in or not); nobody can read other
--    people's reports. The owner reads them all in the dashboard (Table Editor), and the
--    public only sees totals through sky_report_stats().
--    Locations are rounded to 0.1° (about 10 km) before they are stored.
-------------------------------------------------------------------------------
create table if not exists public.sky_reports (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  user_id      uuid default auth.uid() references auth.users (id) on delete set null,
  observed_at  timestamptz not null,
  lat          numeric(4,1) not null check (lat between -90 and 90),
  lon          numeric(4,1) not null check (lon between -180 and 180),
  cloud        smallint not null check (cloud in (0, 25, 50, 75, 100)),
  transparency smallint check (transparency between 1 and 5),
  seeing       smallint check (seeing between 1 and 5),
  note         text check (char_length(note) <= 280),
  fc_cloud     real check (fc_cloud between 0 and 100),
  fc_seeing    real check (fc_seeing between 0 and 5),
  fc_transp    real check (fc_transp between 0 and 5),
  fc_source    text check (char_length(fc_source) <= 20),
  app_version  text check (char_length(app_version) <= 12)
);

-- Reports must describe the sky around now (not far past or future), and arrive rounded.
create or replace function public.sky_reports_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  if new.observed_at < now() - interval '3 hours' or new.observed_at > now() + interval '15 minutes' then
    raise exception 'a sky report must be about the sky right now';
  end if;
  new.lat := round(new.lat, 1);
  new.lon := round(new.lon, 1);
  if new.user_id is distinct from (select auth.uid()) then
    new.user_id := (select auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists sky_reports_check on public.sky_reports;
create trigger sky_reports_check before insert on public.sky_reports
  for each row execute function public.sky_reports_check();

alter table public.sky_reports enable row level security;

drop policy if exists "sky_reports: anyone can send" on public.sky_reports;
create policy "sky_reports: anyone can send" on public.sky_reports
  for insert to anon, authenticated
  with check (true);

drop policy if exists "sky_reports: read own" on public.sky_reports;
create policy "sky_reports: read own" on public.sky_reports
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.sky_reports from anon, authenticated;
grant insert (observed_at, lat, lon, cloud, transparency, seeing, note, fc_cloud, fc_seeing, fc_transp, fc_source, app_version)
  on public.sky_reports to anon, authenticated;
grant select on public.sky_reports to authenticated;

-- Map-ready view for GIS tools (owner only; it reads through the same security rules).
create or replace view public.sky_reports_v
with (security_invoker = true) as
select *, extensions.st_setsrid(extensions.st_makepoint(lon::float8, lat::float8), 4326)::extensions.geography as geog
from public.sky_reports;

-- Public totals: how many reports, and how often the cloud forecast was close.
create or replace function public.sky_report_stats()
returns table (reports bigint, with_forecast bigint, cloud_within_25 numeric, mean_cloud_error numeric)
language sql
security definer
set search_path = ''
stable
as $$
  select count(*),
         count(fc_cloud),
         round(100.0 * avg(case when abs(fc_cloud - cloud) <= 25 then 1 else 0 end) filter (where fc_cloud is not null), 0),
         round(avg(abs(fc_cloud - cloud)) filter (where fc_cloud is not null)::numeric, 1)
    from public.sky_reports;
$$;

revoke all on function public.sky_report_stats() from public;
grant execute on function public.sky_report_stats() to anon, authenticated;
