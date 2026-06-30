-- Notification metadata + dedupe for score milestones

alter table public.notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists notifications_score_milestone_dedupe
  on public.notifications (
    user_id,
    kind,
    coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
    (metadata->>'milestone_key')
  )
  where kind = 'score_milestone' and (metadata->>'milestone_key') is not null;

alter table public.profiles
  add column if not exists score_alert_opt_out boolean not null default false;

comment on column public.profiles.score_alert_opt_out is
  'When true, suppress score_milestone notifications to followers (author still receives own milestones)';
