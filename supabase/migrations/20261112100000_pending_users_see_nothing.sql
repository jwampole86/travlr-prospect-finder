-- Many policies let "any signed-in user" in (using true, auth.uid() is not null, auth.role() = 'authenticated'). Because anyone can create an
-- account, that meant anyone could read tables such as lead activity, the lead facts and sync logs through the public API. Those policies now
-- also require a granted role, so an account with no role ('pending') or no sign-in ('anonymous') sees nothing. People who already have a role
-- are unaffected. Public forms and reference data are left as they are.
do $$
declare
  p record;
  new_expr constant text := $e$(public.get_my_role() not in ('pending', 'anonymous'))$e$;
  open_pattern constant text[] := array['true', '(auth.uid() IS NOT NULL)', '(auth.role() = ''authenticated''::text)'];
  keep constant text[] := array['homeowner_questionnaires', 'estimate_inquiries', 'roi_calculator_submissions', 'link_clicks', 'regulation_rules', 'state_compliance_rules'];
  using_open boolean;
  check_open boolean;
  stmt text;
begin
  for p in
    select policyname, tablename, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename <> all (keep)
  loop
    using_open := p.qual = any (open_pattern);
    check_open := p.with_check = any (open_pattern);
    if p.cmd in ('SELECT', 'DELETE') then check_open := false; end if;
    if p.cmd = 'INSERT' then using_open := false; end if;
    if not (using_open or check_open) then continue; end if;
    stmt := format('alter policy %I on public.%I', p.policyname, p.tablename);
    if using_open then stmt := stmt || ' using ' || new_expr; end if;
    if check_open then stmt := stmt || ' with check ' || new_expr; end if;
    execute stmt;
  end loop;
end $$;
