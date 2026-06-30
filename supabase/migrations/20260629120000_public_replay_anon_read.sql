-- Public replay links (?replay=<postId>) use the anon key when service role is absent.

create policy floor_posts_select_anon on public.floor_posts
  for select to anon using (true);

create policy shifts_select_public_replay on public.shifts
  for select to anon
  using (
    exists (
      select 1 from public.floor_posts fp
      where fp.shift_id = shifts.id
    )
  );
