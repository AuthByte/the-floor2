-- Storage, artifact index, flow tables, shift run_id (the-floor project)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shift-artifacts', 'shift-artifacts', true, 10485760, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do nothing;

alter table public.shifts add column if not exists run_id text;
create unique index if not exists shifts_user_run_id_idx
  on public.shifts (user_id, run_id) where run_id is not null;

-- See Supabase dashboard for full RLS policies applied via MCP migration storage_and_flow_tables
