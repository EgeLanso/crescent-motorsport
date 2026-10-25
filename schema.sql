-- =====================================================================
-- Crescent Motorsport — TAM Supabase şeması (tek dosya, tekrar çalıştırılabilir)
-- Supabase Dashboard > SQL Editor'a yapıştırıp çalıştır.
-- Güvenle birden fazla kez çalıştırabilirsin: mevcut kayıtları silmez.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Yetkili adminler ----------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- Pilotlar ----------
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  number integer,
  tag text not null default 'Driver',
  main_car text,
  car_image_url text,
  lfm_profile_url text,
  total_starts integer not null default 0 check (total_starts >= 0),
  total_wins integer not null default 0 check (total_wins >= 0),
  total_podiums integer not null default 0 check (total_podiums >= 0),
  total_poles integer not null default 0 check (total_poles >= 0),
  created_at timestamptz not null default now()
);
-- Eski kurulumlardan yükseltme için:
alter table public.drivers add column if not exists main_car text;
alter table public.drivers add column if not exists car_image_url text;
alter table public.drivers add column if not exists lfm_profile_url text;
alter table public.drivers add column if not exists total_starts integer not null default 0;
alter table public.drivers add column if not exists total_wins integer not null default 0;
alter table public.drivers add column if not exists total_podiums integer not null default 0;
alter table public.drivers add column if not exists total_poles integer not null default 0;

-- ---------- Yarış sonuçları ----------
create table if not exists public.race_results (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  race_date date not null,
  game text not null,
  race_class text not null,
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

-- ---------- Pilot tur zamanları ----------
create table if not exists public.driver_lap_times (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  lap_date date,
  game text not null,
  race_class text not null,
  car text not null,
  track text not null,
  lap_time text not null,
  image_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Takvim ----------
create table if not exists public.race_schedule (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_date date not null,
  event_time time,
  game text,
  race_class text,
  track text,
  drivers text,
  car text,
  event_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- Klasman artık serbest metin (Formula 1, GT3 Cup gibi yeni adlar eklenebilsin diye).
-- Eski sürümdeki sabit liste kısıtlamalarını kaldırır:
alter table public.race_results     drop constraint if exists race_results_race_class_check;
alter table public.driver_lap_times drop constraint if exists driver_lap_times_race_class_check;
alter table public.race_schedule    drop constraint if exists race_schedule_race_class_check;

-- ---------- Takım fotoğrafları (açıklama kaydı) ----------
create table if not exists public.team_photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  image_url text,
  caption text,
  created_at timestamptz not null default now()
);

-- ---------- Takıma katılma başvuruları ----------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  contact text not null check (char_length(contact) between 3 and 120),
  sims text check (sims is null or char_length(sims) <= 200),
  experience text not null default 'intermediate' check (experience in ('beginner','intermediate','experienced')),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'new' check (status in ('new','read')),
  created_at timestamptz not null default now()
);

-- ---------- Satır düzeyi güvenlik (RLS) ----------
alter table public.admin_users      enable row level security;
alter table public.drivers          enable row level security;
alter table public.race_results     enable row level security;
alter table public.driver_lap_times enable row level security;
alter table public.race_schedule    enable row level security;
alter table public.team_photos      enable row level security;
alter table public.applications     enable row level security;

grant select on public.drivers, public.race_results, public.driver_lap_times,
                public.race_schedule, public.team_photos to anon, authenticated;
grant select on public.admin_users to authenticated;
grant insert, update, delete on public.drivers, public.race_results, public.driver_lap_times,
                public.race_schedule, public.team_photos to authenticated;
-- Başvuru formu: ziyaretçiler SADECE ekleyebilir, okuyamaz. Okuma/silme sadece admin.
grant insert on public.applications to anon, authenticated;
grant select, update, delete on public.applications to authenticated;

-- Eski politikaları temizle
drop policy if exists "Admins can see their own admin row" on public.admin_users;
drop policy if exists "Anyone can read drivers"       on public.drivers;
drop policy if exists "Anyone can read race results"  on public.race_results;
drop policy if exists "Anyone can read lap times"     on public.driver_lap_times;
drop policy if exists "Anyone can read race schedule" on public.race_schedule;
drop policy if exists "Anyone can read team photos"   on public.team_photos;
drop policy if exists "Admins manage drivers"         on public.drivers;
drop policy if exists "Admins manage race results"    on public.race_results;
drop policy if exists "Admins manage lap times"       on public.driver_lap_times;
drop policy if exists "Admins manage schedule"        on public.race_schedule;
drop policy if exists "Admins manage team photos"     on public.team_photos;
drop policy if exists "Anyone can apply"              on public.applications;
drop policy if exists "Admins read applications"      on public.applications;
drop policy if exists "Admins update applications"    on public.applications;
drop policy if exists "Admins delete applications"    on public.applications;

create policy "Admins can see their own admin row" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

-- Herkese açık okuma
create policy "Anyone can read drivers"       on public.drivers          for select to anon, authenticated using (true);
create policy "Anyone can read race results"  on public.race_results     for select to anon, authenticated using (true);
create policy "Anyone can read lap times"     on public.driver_lap_times for select to anon, authenticated using (true);
create policy "Anyone can read race schedule" on public.race_schedule    for select to anon, authenticated using (true);
create policy "Anyone can read team photos"   on public.team_photos      for select to anon, authenticated using (true);

-- Yazma: sadece admin_users listesindeki hesaplar
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
create policy "Admins manage team photos" on public.team_photos for all to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

-- Başvurular
create policy "Anyone can apply" on public.applications for insert to anon, authenticated
  with check (status = 'new');
create policy "Admins read applications" on public.applications for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Admins update applications" on public.applications for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Admins delete applications" on public.applications for delete to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

-- ---------- Storage: takım fotoğrafları (herkese açık okuma, sadece admin yazma) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-photos', 'team-photos', true, 52428800,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read team photos"   on storage.objects;
drop policy if exists "Admins upload team photos" on storage.objects;
drop policy if exists "Admins update team photos" on storage.objects;
drop policy if exists "Admins delete team photos" on storage.objects;

create policy "Public read team photos" on storage.objects for select to anon, authenticated
  using (bucket_id = 'team-photos');
create policy "Admins upload team photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'team-photos' and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Admins update team photos" on storage.objects for update to authenticated
  using (bucket_id = 'team-photos' and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (bucket_id = 'team-photos' and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "Admins delete team photos" on storage.objects for delete to authenticated
  using (bucket_id = 'team-photos' and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

-- ---------- Son adım: admin hesabını yetkilendir ----------
-- Authentication > Users'tan kendi kullanıcının UUID'sini kopyala, aşağıdaki satırın başındaki -- işaretini sil ve çalıştır:
-- insert into public.admin_users (user_id) values ('PASTE_AUTH_USER_UUID_HERE');
