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
