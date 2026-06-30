-- Social expansion: follows, reactions, notifications, scores, presence, desks, shadow comments

-- Profile extras
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists follower_count int not null default 0;
alter table public.profiles add column if not exists following_count int not null default 0;

-- Follow graph
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows (following_id);

-- Tagged reactions (beyond likes)
create table if not exists public.post_reactions (
  post_id uuid not null references public.floor_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null check (reaction in ('contrarian', 'bear_case', 'nailed_it')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction)
);

create index if not exists post_reactions_post_idx on public.post_reactions (post_id);

-- Reaction summary on posts
alter table public.floor_posts add column if not exists reaction_counts jsonb not null default '{}'::jsonb;
alter table public.floor_posts add column if not exists scorecard jsonb not null default '{}'::jsonb;
alter table public.floor_posts add column if not exists scores_updated_at timestamptz;

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'like', 'comment', 'reaction', 'follow', 'score_milestone', 'digest_published'
  )),
  actor_id uuid references public.profiles (id) on delete set null,
  post_id uuid references public.floor_posts (id) on delete cascade,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- Live shift presence (opt-in)
create table if not exists public.shift_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tickers text[] not null default '{}',
  model text not null default '',
  analyst_count int not null default 0,
  visible boolean not null default true,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shift_presence_updated_idx on public.shift_presence (updated_at desc);

-- Saved member desks (agent rosters)
create table if not exists public.member_desks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  enabled_agents text[] not null default '{}',
  model text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_desks_user_idx on public.member_desks (user_id, updated_at desc);
create index if not exists member_desks_public_idx on public.member_desks (is_public, updated_at desc)
  where is_public = true;

-- Shadow verdict comments + watchlist digest flag on comments
alter table public.post_comments add column if not exists kind text not null default 'text'
  check (kind in ('text', 'shadow_verdict'));
alter table public.post_comments add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Watchlist auto-publish
alter table public.watchlists add column if not exists auto_publish boolean not null default false;

-- Allow members to read shifts linked to published posts (for floor replay)
create policy shifts_select_published on public.shifts
  for select to authenticated
  using (
    exists (
      select 1 from public.floor_posts fp
      where fp.shift_id = shifts.id
    )
  );

-- Follow count maintenance
create or replace function public.profiles_follow_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set follower_count = follower_count + 1 where id = new.following_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    update public.profiles set follower_count = greatest(0, follower_count - 1) where id = old.following_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists follows_count on public.follows;
create trigger follows_count
  after insert or delete on public.follows
  for each row execute function public.profiles_follow_count();

-- Reaction count maintenance
create or replace function public.floor_posts_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  counts jsonb;
begin
  select coalesce(jsonb_object_agg(reaction, cnt), '{}'::jsonb)
  into counts
  from (
    select reaction, count(*)::int as cnt
    from public.post_reactions
    where post_id = coalesce(new.post_id, old.post_id)
    group by reaction
  ) s;

  update public.floor_posts
  set reaction_counts = counts
  where id = coalesce(new.post_id, old.post_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists post_reactions_count on public.post_reactions;
create trigger post_reactions_count
  after insert or delete on public.post_reactions
  for each row execute function public.floor_posts_reaction_counts();

-- Notification triggers
create or replace function public.notify_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
begin
  select author_id into author from public.floor_posts where id = new.post_id;
  if author is not null and author <> new.user_id then
    insert into public.notifications (user_id, kind, actor_id, post_id, body)
    values (author, 'like', new.user_id, new.post_id, 'liked your shared run');
  end if;
  return new;
end;
$$;

create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
begin
  select author_id into author from public.floor_posts where id = new.post_id;
  if author is not null and author <> new.user_id then
    insert into public.notifications (user_id, kind, actor_id, post_id, body)
    values (author, 'comment', new.user_id, new.post_id, 'commented on your shared run');
  end if;
  return new;
end;
$$;

create or replace function public.notify_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, kind, actor_id, body)
  values (new.following_id, 'follow', new.follower_id, 'started following you');
  return new;
end;
$$;

drop trigger if exists notify_like on public.post_likes;
create trigger notify_like
  after insert on public.post_likes
  for each row execute function public.notify_post_like();

drop trigger if exists notify_comment on public.post_comments;
create trigger notify_comment
  after insert on public.post_comments
  for each row execute function public.notify_post_comment();

drop trigger if exists notify_follow on public.follows;
create trigger notify_follow
  after insert on public.follows
  for each row execute function public.notify_follow();

-- RLS
alter table public.follows enable row level security;
alter table public.post_reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.shift_presence enable row level security;
alter table public.member_desks enable row level security;

create policy follows_select_authenticated on public.follows
  for select to authenticated using (true);
create policy follows_insert_own on public.follows
  for insert to authenticated with check (auth.uid() = follower_id);
create policy follows_delete_own on public.follows
  for delete to authenticated using (auth.uid() = follower_id);

create policy post_reactions_select on public.post_reactions
  for select to authenticated using (true);
create policy post_reactions_insert_own on public.post_reactions
  for insert to authenticated with check (auth.uid() = user_id);
create policy post_reactions_delete_own on public.post_reactions
  for delete to authenticated using (auth.uid() = user_id);

create policy notifications_select_own on public.notifications
  for select to authenticated using (auth.uid() = user_id);
create policy notifications_update_own on public.notifications
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy shift_presence_select on public.shift_presence
  for select to authenticated using (visible = true or auth.uid() = user_id);
create policy shift_presence_upsert_own on public.shift_presence
  for insert to authenticated with check (auth.uid() = user_id);
create policy shift_presence_update_own on public.shift_presence
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy shift_presence_delete_own on public.shift_presence
  for delete to authenticated using (auth.uid() = user_id);

create policy member_desks_select on public.member_desks
  for select to authenticated using (is_public = true or auth.uid() = user_id);
create policy member_desks_insert_own on public.member_desks
  for insert to authenticated with check (auth.uid() = user_id);
create policy member_desks_update_own on public.member_desks
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy member_desks_delete_own on public.member_desks
  for delete to authenticated using (auth.uid() = user_id);
