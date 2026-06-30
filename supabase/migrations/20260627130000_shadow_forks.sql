-- Shadow forks: indexes + fork_published notification trigger
-- post_kind column added in 20260627120000_watchlist_digest.sql (includes shadow_fork)

create index if not exists floor_posts_forked_from_idx
  on public.floor_posts (forked_from_post_id)
  where forked_from_post_id is not null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'floor_posts'
      and column_name = 'post_kind'
  ) then
    create index if not exists floor_posts_kind_published_idx
      on public.floor_posts (post_kind, published_at desc)
      where post_kind = 'shadow_fork';
  end if;
end $$;

-- notifications_kind_check extended in 20260627120000_watchlist_digest.sql

create or replace function public.notify_fork_published()
returns trigger language plpgsql security definer set search_path = public as $$
declare parent_author uuid;
begin
  if new.forked_from_post_id is null then return new; end if;
  select author_id into parent_author from public.floor_posts where id = new.forked_from_post_id;
  if parent_author is not null and parent_author <> new.author_id then
    insert into public.notifications (user_id, kind, actor_id, post_id, body)
    values (parent_author, 'fork_published', new.author_id, new.id, 'forked your shared run');
  end if;
  return new;
end; $$;

drop trigger if exists notify_fork on public.floor_posts;
create trigger notify_fork after insert on public.floor_posts
  for each row when (new.forked_from_post_id is not null)
  execute function public.notify_fork_published();
