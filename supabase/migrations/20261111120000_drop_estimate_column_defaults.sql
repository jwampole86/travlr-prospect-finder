-- A lead created without an estimate (a NAVEO form, a manual add) was silently given the table's placeholder figures, 200 a night at 65%
-- for $3,960 gross and $2,772 net, the same for every such lead and unrelated to the home. No estimate is now stored as NULL, which the
-- apps and the NAVEO recommendation already treat as "no estimate yet".
ALTER TABLE public.leads
  ALTER COLUMN estimated_adr DROP DEFAULT,
  ALTER COLUMN estimated_occupancy DROP DEFAULT,
  ALTER COLUMN estimated_gross_monthly DROP DEFAULT,
  ALTER COLUMN estimated_net_monthly DROP DEFAULT;
