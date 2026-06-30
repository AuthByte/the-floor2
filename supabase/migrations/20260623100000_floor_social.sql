-- Members-only social feed for THE FLOOR

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  handle text unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.floor_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  shift_id uuid references public.shifts (id) on delete set null,
  run_id text,
  caption text,
  tickers text[] not null default '{}',
  model text not null default '',
  analyst_count int not null default 0,
  ts_ms bigint not null,
  snapshot jsonb not null default '{}'::jsonb,
  hero_artifact_url text,
  like_count int not null default 0,
  comment_count int not null default 0,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists floor_posts_author_shift_idx
  on public.floor_posts (author_id, shift_id)
  where shift_id is not null;

create unique index if not exists floor_posts_author_run_idx
  on public.floor_posts (author_id, run_id)
  where run_id is not null;

create index if not exists floor_posts_published_idx
  on public.floor_posts (published_at desc);

create table if not exists public.post_likes (
  post_id uuid not null references public.floor_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on public.post_likes (user_id);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.floor_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx
  on public.post_comments (post_id, created_at asc);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(split_part(new.email, '@', 1), ''),
      'desk_analyst'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Like / comment count maintenance
create or replace function public.floor_posts_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.floor_posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.floor_posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.floor_posts_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.floor_posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.floor_posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count
  after insert or delete on public.post_likes
  for each row execute function public.floor_posts_like_count();

drop trigger if exists post_comments_count on public.post_comments;
create trigger post_comments_count
  after insert or delete on public.post_comments
  for each row execute function public.floor_posts_comment_count();

-- RLS
alter table public.profiles enable row level security;
alter table public.floor_posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

-- profiles: authenticated read, own update
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id)
  with check (auth.uid() = id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- floor_posts: members-only
create policy floor_posts_select_authenticated on public.floor_posts
  for select to authenticated using (true);

create policy floor_posts_insert_own on public.floor_posts
  for insert to authenticated with check (auth.uid() = author_id);

create policy floor_posts_update_own on public.floor_posts
  for update to authenticated using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy floor_posts_delete_own on public.floor_posts
  for delete to authenticated using (auth.uid() = author_id);

-- post_likes
create policy post_likes_select_authenticated on public.post_likes
  for select to authenticated using (true);

create policy post_likes_insert_own on public.post_likes
  for insert to authenticated with check (auth.uid() = user_id);

create policy post_likes_delete_own on public.post_likes
  for delete to authenticated using (auth.uid() = user_id);

-- post_comments
create policy post_comments_select_authenticated on public.post_comments
  for select to authenticated using (true);

create policy post_comments_insert_own on public.post_comments
  for insert to authenticated with check (auth.uid() = user_id);

create policy post_comments_update_own on public.post_comments
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy post_comments_delete_own on public.post_comments
  for delete to authenticated using (auth.uid() = user_id);
