create table if not exists public.aerosar_dashboard_data (
  id uuid primary key default gen_random_uuid(),
  mission_id text not null unique,
  platform_name text not null default 'AEROSAR',
  mission_name text not null,
  mission_location text,
  mission_phase text,
  mission_timer_seconds integer not null default 0,
  drone_id text,
  drone_status text,
  connection_status text,
  ai_status text,
  operator_name text,
  operator_initials text,
  map_mode text,
  coordinates text,
  drone_model text,
  battery text,
  battery_time text,
  altitude text,
  speed text,
  temperature text,
  weather text,
  flight_time text,
  gps_status text,
  heading text,
  last_inference text,
  last_sync text,
  data_source text default 'SUPABASE',
  last_sync_footer text,
  map_sectors jsonb not null default '[]'::jsonb,
  detections jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace view public.aerosar_dashboard as
select
  platform_name as "platformName",
  mission_name as "missionName",
  mission_id as "missionId",
  mission_location as "missionLocation",
  mission_phase as "missionPhase",
  mission_timer_seconds as "missionTimerSeconds",
  drone_id as "droneId",
  drone_status as "droneStatus",
  connection_status as "connectionStatus",
  ai_status as "aiStatus",
  operator_name as "operatorName",
  operator_initials as "operatorInitials",
  map_mode as "mapMode",
  coordinates,
  drone_model as "droneModel",
  battery,
  battery_time as "batteryTime",
  altitude,
  speed,
  temperature,
  weather,
  flight_time as "flightTime",
  gps_status as "gpsStatus",
  heading,
  last_inference as "lastInference",
  last_sync as "lastSync",
  data_source as "dataSource",
  last_sync_footer as "lastSyncFooter",
  map_sectors as "mapSectors",
  detections,
  tasks
from public.aerosar_dashboard_data;

create table if not exists public.sos_rescue_report_records (
  id uuid primary key default gen_random_uuid(),
  mission_id text not null unique,
  report_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view public.sos_rescue_reports as
select
  mission_id,
  report_data->'mission' as mission,
  report_data->'drone' as drone,
  report_data->'sensorStatistics' as "sensorStatistics",
  report_data->'aiPerformance' as "aiPerformance",
  report_data->'detectedPeople' as "detectedPeople",
  report_data->'detectedHazards' as "detectedHazards",
  report_data->'incidentCoordinates' as "incidentCoordinates",
  report_data->'timestamps' as timestamps,
  report_data->'alertHistory' as "alertHistory",
  report_data->'dispatchActions' as "dispatchActions",
  report_data->>'generatedAt' as "generatedAt"
from public.sos_rescue_report_records;

create table if not exists public.mission_actions (
  id uuid primary key default gen_random_uuid(),
  mission_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  operator_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.mission_actions enable row level security;

alter table public.aerosar_dashboard_data enable row level security;
alter table public.sos_rescue_report_records enable row level security;

drop policy if exists "Authenticated operators can read dashboard" on public.aerosar_dashboard_data;
create policy "Authenticated operators can read dashboard"
on public.aerosar_dashboard_data
for select
to authenticated
using (true);

drop policy if exists "Authenticated operators can read reports" on public.sos_rescue_report_records;
create policy "Authenticated operators can read reports"
on public.sos_rescue_report_records
for select
to authenticated
using (true);

drop policy if exists "Authenticated operators can save actions" on public.mission_actions;
create policy "Authenticated operators can save actions"
on public.mission_actions
for insert
to authenticated
with check (auth.uid() = operator_id);

drop policy if exists "Operators can read their actions" on public.mission_actions;
create policy "Operators can read their actions"
on public.mission_actions
for select
to authenticated
using (auth.uid() = operator_id);
