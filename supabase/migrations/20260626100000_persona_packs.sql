-- Persona packs: custom floor analysts minted from social profiles / archives

create table if not exists public.persona_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  callsign text not null,
  desk_label text not null,
  persona_text text not null,
  investing_style text not null,
  checklist jsonb not null default '[]'::jsonb,
  metric_profile jsonb not null default '{}'::jsonb,
  source jsonb not null default '{}'::jsonb,
  pack_version int not null default 1,
  pack_body jsonb not null default '{}'::jsonb,
  room_image_url text,
  accent_color text,
  sprite_sheet_url text,
  visibility text not null default 'private'
    check (visibility in ('private', 'unlisted', 'public')),
  moderation_status text not null default 'approved'
    check (moderation_status in ('pending', 'approved', 'rejected', 'flagged')),
  moderation_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists persona_packs_owner_idx on public.persona_packs (owner_id, updated_at desc);
create index if not exists persona_packs_public_idx on public.persona_packs (visibility, moderation_status, created_at desc)
  where visibility = 'public' and moderation_status = 'approved';

create table if not exists public.persona_ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'fetching', 'digesting', 'rendering_room', 'complete', 'failed')),
  source_type text not null check (source_type in ('x_profile', 'x_archive', 'text_paste')),
  source_ref text not null,
  progress jsonb not null default '{}'::jsonb,
  persona_pack_id uuid references public.persona_packs (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists persona_ingest_jobs_owner_idx on public.persona_ingest_jobs (owner_id, created_at desc);

create table if not exists public.persona_ingest_chunks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.persona_ingest_jobs (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists persona_ingest_chunks_job_idx on public.persona_ingest_chunks (job_id, chunk_index);

-- Extensions to existing social tables
alter table public.member_desks
  add column if not exists persona_pack_ids uuid[] not null default '{}';

alter table public.floor_posts
  add column if not exists persona_pack_ids uuid[] not null default '{}';

-- RLS
alter table public.persona_packs enable row level security;
alter table public.persona_ingest_jobs enable row level security;
alter table public.persona_ingest_chunks enable row level security;

create policy persona_packs_select on public.persona_packs
  for select to authenticated
  using (
    owner_id = auth.uid()
    or visibility = 'public'
    or visibility = 'unlisted'
  );

create policy persona_packs_insert on public.persona_packs
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy persona_packs_update on public.persona_packs
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy persona_packs_delete on public.persona_packs
  for delete to authenticated
  using (owner_id = auth.uid());

create policy persona_ingest_jobs_select on public.persona_ingest_jobs
  for select to authenticated
  using (owner_id = auth.uid());

create policy persona_ingest_jobs_insert on public.persona_ingest_jobs
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy persona_ingest_jobs_update on public.persona_ingest_jobs
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy persona_ingest_chunks_select on public.persona_ingest_chunks
  for select to authenticated
  using (owner_id = auth.uid());

create policy persona_ingest_chunks_insert on public.persona_ingest_chunks
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy persona_ingest_chunks_delete on public.persona_ingest_chunks
  for delete to authenticated
  using (owner_id = auth.uid());

-- updated_at maintenance
create or replace function public.persona_packs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists persona_packs_updated on public.persona_packs;
create trigger persona_packs_updated
  before update on public.persona_packs
  for each row execute function public.persona_packs_set_updated_at();

create or replace function public.persona_ingest_jobs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists persona_ingest_jobs_updated on public.persona_ingest_jobs;
create trigger persona_ingest_jobs_updated
  before update on public.persona_ingest_jobs
  for each row execute function public.persona_ingest_jobs_set_updated_at();
