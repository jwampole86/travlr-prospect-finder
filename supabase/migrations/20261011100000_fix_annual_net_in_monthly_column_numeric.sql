-- 20261011090000 matched nothing: net/gross was integer division (7.8 truncates to 7). Same repair with numeric division.
UPDATE public.leads
SET estimated_net_monthly = ROUND(estimated_net_monthly / 12.0)
WHERE estimated_net_monthly > 0
  AND estimated_gross_monthly > 0
  AND ABS(estimated_net_monthly::numeric / estimated_gross_monthly - 7.8) < 0.05;
