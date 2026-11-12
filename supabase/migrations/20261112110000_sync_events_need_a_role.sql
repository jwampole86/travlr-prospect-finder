-- sync_events rows written by scheduled jobs have no user and were readable by any signed-in account.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'sync_events' and cmd = 'ALL' and roles && array['authenticated']::name[]
  loop
    execute format('alter policy %I on public.sync_events using (public.get_my_role() not in (''pending'', ''anonymous'') and (user_id = auth.uid() or user_id is null)) with check (public.get_my_role() not in (''pending'', ''anonymous'') and (user_id = auth.uid() or user_id is null))', p.policyname);
  end loop;
end $$;
