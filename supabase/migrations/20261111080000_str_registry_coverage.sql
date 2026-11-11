-- How well each market's candidate listings are covered by a public licence list: how many were checked (candidates are the listings the matcher looks at), how many had a list
-- nearby, and how many came out as a probable match. Used by the Co-Host screen.
create or replace function public.str_registry_coverage()
returns table (market text, candidates bigint, checked bigint, covered bigint, probable bigint)
language sql stable security definer set search_path = public as $$
  select l.market,
         count(*),
         count(*) filter (where l.match_status is not null),
         count(*) filter (where l.match_status is not null and l.match_status <> 'no_registry_nearby'),
         count(*) filter (where l.match_status = 'unique')
  from public.str_listings l
  where l.segment = 'candidate' or (l.segment = 'new_or_dormant' and l.is_luxury)
  group by l.market
$$;
revoke all on function public.str_registry_coverage() from public, anon, authenticated;
grant execute on function public.str_registry_coverage() to service_role;
