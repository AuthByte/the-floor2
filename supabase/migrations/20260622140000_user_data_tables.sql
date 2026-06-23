-- Per-user cloud storage for THE FLOOR (applied to project the-floor)

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text,
  ts_ms bigint not null,
  tickers text[] not null default '{}',
  model text not null default '',
  initial_cash numeric not null default 100000,
  analyst_count int not null default 0,
  summary jsonb not null default '[]'::jsonb,
  decisions jsonb,
  prices jsonb,
  payload jsonb,
  replay jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists shifts_user_client_id_idx
  on public.shifts (user_id, client_id)
  where client_id is not null;

create index if not exists shifts_user_ts_idx on public.shifts (user_id, ts_ms desc);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  tickers text not null,
  hint text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists watchlists_user_sort_idx on public.watchlists (user_id, sort_order);

alter table public.user_settings enable row level security;
alter table public.shifts enable row level security;
alter table public.watchlists enable row level security;
