-- A request counter shared by every server instance, so AVA's per-person limit holds on serverless hosts (where each instance has its own memory).
-- One row per person per fixed window; only the server (service role) can call it.
create table if not exists public.ava_rate_hits (
  key text not null,
  window_start timestamptz not null,
  n integer not null default 0,
  primary key (key, window_start)
);
alter table public.ava_rate_hits enable row level security;

-- Counts one request and says whether it is within the limit.
create or replace function public.ava_rate_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  c integer;
begin
  insert into public.ava_rate_hits (key, window_start, n) values (left(p_key, 200), w, 1)
  on conflict (key, window_start) do update set n = public.ava_rate_hits.n + 1
  returning n into c;
  -- Housekeeping: old windows are of no use, so now and then clear them out.
  if random() < 0.02 then
    delete from public.ava_rate_hits where window_start < now() - interval '1 hour';
  end if;
  return c <= p_limit;
end $$;
revoke all on function public.ava_rate_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.ava_rate_hit(text, integer, integer) to service_role;
