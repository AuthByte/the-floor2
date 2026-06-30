-- Lock down digest_runs: cron idempotency ledger, backend service role only.

alter table public.digest_runs enable row level security;

-- Block anon/authenticated PostgREST access; service role bypasses RLS.
create policy digest_runs_deny_all on public.digest_runs
  for all using (false);
