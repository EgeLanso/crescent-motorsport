-- Crescent Motorsport complete schema for Supabase.
-- Run in Supabase Dashboard > SQL Editor. This script creates empty content tables.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  number integer,
  tag text not null default 'Driver',
  main_car text,
  car_image_url text,
  created_at timestamptz not null default now()
);

alter table public.drivers add column if not exists main_car text;
alter table public.drivers add column if not exists car_image_url text;

create table if not exists public.race_results (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  race_date date not null,
  game text not null,
  race_class text not null check (race_class in ('Hypercar','LMP2','LMP3','GT3','Other')),
  car text not null,
  track text not null,
  status text not null default 'finished' check (status in ('finished','dnf','dns')),
  position integer check (position is null or position > 0),
  best_lap text,
  lfm_url text,
  image_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_lap_times (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  lap_date date,
  game text not null,
  race_class text not null check (race_class in ('Hypercar','LMP2','LMP3','GT3','Other')),
  car text not null,
  track text not null,
  lap_time text not null,
  image_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.race_schedule (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_date date not null,
  event_time time,
  game text,
  race_class text check (race_class is null or race_class in ('Hypercar','LMP2','LMP3','GT3','Other')),
  track text,
  drivers text,
  car text,
  event_url text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.drivers enable row level security;
alter table public.race_results enable row level security;
alter table public.driver_lap_times enable row level security;
alter table public.race_schedule enable row level security;

grant select on public.drivers, public.race_results, public.driver_lap_times, public.race_schedule to anon, authenticated;
grant select on public.admin_users to authenticated;
grant insert, update, delete on public.drivers, public.race_results, public.driver_lap_times, public.race_schedule to authenticated;

drop policy if exists "Admins can see their own admin row" on public.admin_users;
drop policy if exists "Anyone can read drivers" on public.drivers;
drop policy if exists "Anyone can read race results" on public.race_results;
drop policy if exists "Anyone can read lap times" on public.driver_lap_times;
drop policy if exists "Anyone can read race schedule" on public.race_schedule;
drop policy if exists "Admins manage drivers" on public.drivers;
drop policy if exists "Admins manage race results" on public.race_results;
drop policy if exists "Admins manage lap times" on public.driver_lap_times;
drop policy if exists "Admins manage schedule" on public.race_schedule;

create policy "Admins can see their own admin row" on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

-- Public read access for site content
create policy "Anyone can read drivers" on public.drivers for select to anon, authenticated using (true);
create policy "Anyone can read race results" on public.race_results for select to anon, authenticated using (true);
create policy "Anyone can read lap times" on public.driver_lap_times for select to anon, authenticated using (true);
create policy "Anyone can read race schedule" on public.race_schedule for select to anon, authenticated using (true);

-- Only UUIDs listed in admin_users may mutate site content
create policy "Admins manage drivers" on public.drivers for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Admins manage race results" on public.race_results for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Admins manage lap times" on public.driver_lap_times for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Admins manage schedule" on public.race_schedule for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

-- No starter drivers or fake results are inserted: add everything via the admin panel.
-- After creating an admin in Authentication > Users, authorize that user's UUID:
-- insert into public.admin_users (user_id) values ('PASTE_AUTH_USER_UUID_HERE');
