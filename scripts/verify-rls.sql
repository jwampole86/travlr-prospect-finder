-- Read-only isolation check, run inside a transaction that is rolled back.
-- For every public table it counts the rows visible to (1) a caller who is not signed in and (2) a signed-in user who belongs to no organization,
-- which is what a member of a different organization looks like to the organization policies. Any table that shows rows is listed as a leak.
begin;
create temp table rls_leaks (tbl text, caller text, visible bigint) on commit drop;
grant all on rls_leaks to public;
do $$
declare
  r record;
  n bigint;
  who text;
begin
  for r in
    select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r' order by 1
  loop
    foreach who in array array['anon', 'stranger'] loop
      begin
        if who = 'anon' then
          set local role anon;
        else
          set local role authenticated;
          perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
        end if;
        execute format('select count(*) from public.%I', r.relname) into n;
        reset role;
        if n > 0 then insert into rls_leaks values (r.relname, who, n); end if;
      exception when others then
        reset role; -- permission denied counts as no access
      end;
    end loop;
  end loop;
end $$;
select tbl, caller, visible from rls_leaks order by 1, 2;
rollback;
