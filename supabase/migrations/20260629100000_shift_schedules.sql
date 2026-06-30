-- Scheduled shifts: Pro/day-pass automation with platform OpenRouter key

create table if not exists public.shift_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text,
  tickers text[] not null default '{}',
  ticker_query text,
  enabled boolean not null default true,
  timezone text not null default 'America/New_York',
  recurrence text not null check (recurrence in ('daily', 'weekly', 'once')),
  time_local time not null,
  days_of_week smallint[],
  run_once_at timestamptz,
  enabled_agent_keys text[] not null default '{}',
  watchlist_id uuid references public.watchlists (id) on delete set null,
  source_shift_id uuid references public.shifts (id) on delete set null,
  template_key text,
  auto_publish boolean not null default false,
  notify_email boolean not null default false,
  initial_cash numeric not null default 100000,
  run_risk_pipeline boolean not null default true,
  model_name text,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shift_schedules_user_idx
  on public.shift_schedules (user_id, created_at desc);

create index if not exists shift_schedules_due_idx
  on public.shift_schedules (enabled, next_run_at)
  where enabled = true;

create table if not exists public.shift_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.shift_schedules (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  shift_id uuid references public.shifts (id) on delete set null,
  error text,
  duration_ms int,
  metadata jsonb not null default '{}'::jsonb,
  retry_of uuid references public.shift_schedule_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (schedule_id, scheduled_for)
);

create index if not exists shift_schedule_runs_user_idx
  on public.shift_schedule_runs (user_id, created_at desc);

create table if not exists public.scheduler_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists scheduler_conversations_user_idx
  on public.scheduler_conversations (user_id, updated_at desc);

alter table public.shift_schedules enable row level security;
alter table public.shift_schedule_runs enable row level security;
alter table public.scheduler_conversations enable row level security;

create policy shift_schedules_select_own on public.shift_schedules
  for select using (auth.uid() = user_id);
create policy shift_schedules_insert_own on public.shift_schedules
  for insert with check (auth.uid() = user_id);
create policy shift_schedules_update_own on public.shift_schedules
  for update using (auth.uid() = user_id);
create policy shift_schedules_delete_own on public.shift_schedules
  for delete using (auth.uid() = user_id);

create policy shift_schedule_runs_select_own on public.shift_schedule_runs
  for select using (auth.uid() = user_id);

create policy scheduler_conversations_select_own on public.scheduler_conversations
  for select using (auth.uid() = user_id);
create policy scheduler_conversations_insert_own on public.scheduler_conversations
  for insert with check (auth.uid() = user_id);
create policy scheduler_conversations_update_own on public.scheduler_conversations
  for update using (auth.uid() = user_id);
create policy scheduler_conversations_delete_own on public.scheduler_conversations
  for delete using (auth.uid() = user_id);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'like', 'comment', 'reaction', 'follow', 'score_milestone', 'digest_published',
    'watchlist_digest', 'fork_published', 'fork_duel', 'scheduled_shift_complete',
    'scheduled_shift_failed', 'scheduled_shift_briefing'
  ));
