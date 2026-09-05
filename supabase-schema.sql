create table if not exists public.mission_actions (
  id uuid primary key default gen_random_uuid(),
  mission_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  operator_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.mission_actions enable row level security;

create policy "Authenticated operators can save actions"
on public.mission_actions
for insert
to authenticated
with check (auth.uid() = operator_id);

create policy "Operators can read their actions"
on public.mission_actions
for select
to authenticated
using (auth.uid() = operator_id);
