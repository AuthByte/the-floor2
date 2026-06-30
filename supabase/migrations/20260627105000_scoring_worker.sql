-- Scoring worker indexes, public leaderboard view, and audit table

create index if not exists target_outcomes_post_idx
  on public.target_outcomes (post_id)
  where post_id is not null;

create index if not exists target_outcomes_shift_pending_idx
  on public.target_outcomes (shift_id)
  where scoring_status = 'pending' and shift_id is not null;

create index if not exists agent_scorecards_dir_idx
  on public.agent_scorecards (direction_hit_rate desc nulls last);

create index if not exists agent_scorecards_n_idx
  on public.agent_scorecards (predictions_scored desc);

create or replace view public.agent_scorecards_public as
select
  agent_key,
  predictions_scored,
  with_price_target,
  direction_hit_rate,
  target_hit_rate,
  avg_confidence,
  updated_at
from public.agent_scorecards
where predictions_scored >= 10;

grant select on public.agent_scorecards_public to anon, authenticated;

create table if not exists public.scoring_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  pending_checked int not null default 0,
  scored_count int not null default 0,
  post_refresh_count int not null default 0,
  notification_count int not null default 0,
  error_count int not null default 0,
  duration_ms int,
  trigger_source text not null default 'cron'
    check (trigger_source in ('cron', 'manual', 'local')),
  error_summary text
);

alter table public.scoring_runs enable row level security;
