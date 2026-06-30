-- Watchlist auto-publish digest: post linkage + follower notifications

alter table public.floor_posts
  add column if not exists watchlist_id uuid references public.watchlists (id) on delete set null;

alter table public.floor_posts
  add column if not exists post_kind text not null default 'shift';

alter table public.floor_posts drop constraint if exists floor_posts_post_kind_check;
alter table public.floor_posts add constraint floor_posts_post_kind_check
  check (post_kind in ('shift', 'shadow_fork', 'watchlist_digest'));

create index if not exists floor_posts_watchlist_idx
  on public.floor_posts (watchlist_id)
  where watchlist_id is not null;

-- metadata column added in 20260627110000_score_notifications.sql

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'like', 'comment', 'reaction', 'follow', 'score_milestone', 'digest_published',
    'watchlist_digest', 'fork_published', 'fork_duel'
  ));

create table if not exists public.digest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  cadence text not null check (cadence in ('daily', 'weekly')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  notification_id uuid references public.notifications (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, cadence, period_start)
);

create index if not exists digest_runs_user_idx on public.digest_runs (user_id, created_at desc);

create or replace function public.notify_digest_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.post_kind <> 'watchlist_digest' and new.watchlist_id is null then
    return new;
  end if;
  insert into public.notifications (user_id, kind, actor_id, post_id, body, metadata)
  select f.follower_id, 'digest_published', new.author_id, new.id,
    coalesce(new.caption, 'shared a watchlist digest'),
    jsonb_build_object('watchlist_id', new.watchlist_id)
  from public.follows f
  where f.following_id = new.author_id
    and f.follower_id <> new.author_id;
  return new;
end;
$$;

drop trigger if exists notify_digest_published on public.floor_posts;
create trigger notify_digest_published
  after insert on public.floor_posts
  for each row
  when (new.watchlist_id is not null or new.post_kind = 'watchlist_digest')
  execute function public.notify_digest_published();
