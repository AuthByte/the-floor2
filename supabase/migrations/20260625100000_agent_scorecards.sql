-- Agent scorecards: per-prediction outcomes + rolled aggregates

create table if not exists public.target_outcomes (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.shifts (id) on delete cascade,
  post_id uuid references public.floor_posts (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id text,
  agent_key text not null,
  ticker text not null,
  published_at timestamptz not null,
  signal text not null check (signal in ('bullish', 'bearish', 'neutral')),
  confidence numeric,
  reference_price numeric,
  price_target numeric,
  upside_pct numeric,
  time_horizon_months int not null default 12,
  outcome_price numeric,
  outcome_at timestamptz,
  return_pct numeric,
  direction_correct boolean,
  target_error_pct numeric,
  target_hit boolean,
  scoring_status text not null default 'pending'
    check (scoring_status in ('pending', 'scored', 'skipped', 'error')),
  scored_at timestamptz,
  unique (shift_id, agent_key, ticker)
);

create index if not exists target_outcomes_due_idx
  on public.target_outcomes (scoring_status, published_at)
  where scoring_status = 'pending';

create index if not exists target_outcomes_agent_idx
  on public.target_outcomes (agent_key, published_at desc);

create table if not exists public.agent_scorecards (
  agent_key text primary key,
  predictions_scored int not null default 0,
  with_price_target int not null default 0,
  direction_hit_rate numeric,
  target_hit_rate numeric,
  avg_confidence numeric,
  updated_at timestamptz not null default now()
);

alter table public.floor_posts add column if not exists forked_from_post_id uuid references public.floor_posts (id) on delete set null;
alter table public.floor_posts add column if not exists fork_meta jsonb not null default '{}'::jsonb;

alter table public.target_outcomes enable row level security;
alter table public.agent_scorecards enable row level security;

create policy target_outcomes_owner on public.target_outcomes
  for all using (auth.uid() = user_id);

create policy agent_scorecards_read on public.agent_scorecards
  for select using (true);
