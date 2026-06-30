-- Billing & entitlements for THE FLOOR (Stripe-backed)

alter table public.profiles
  add column if not exists plan_tier text not null default 'free'
    check (plan_tier in ('free', 'pro', 'day_pass'));

alter table public.profiles
  add column if not exists stripe_customer_id text;

alter table public.profiles
  add column if not exists stripe_subscription_id text;

alter table public.profiles
  add column if not exists entitlement_expires_at timestamptz;

alter table public.profiles
  add column if not exists shifts_used_this_period int not null default 0;

alter table public.profiles
  add column if not exists billing_period_start timestamptz not null default date_trunc('month', now());

create unique index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_user_idx on public.billing_events (user_id, created_at desc);

alter table public.billing_events enable row level security;

-- Users cannot read billing_events directly; backend uses service role
create policy billing_events_deny_all on public.billing_events
  for all using (false);

comment on column public.profiles.plan_tier is 'free | pro (subscription) | day_pass (24h one-time)';
comment on column public.profiles.shifts_used_this_period is 'Resets each billing_period_start month for free tier gating';
