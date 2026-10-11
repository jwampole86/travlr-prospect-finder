-- csv-import and tps-csv-import stored the ANNUAL projected owner net in estimated_net_monthly (net = 0.65 * 12 * gross,
-- so net/gross = 7.8 exactly). Convert those rows to monthly; the scorer then stops treating them as $35K/month.
UPDATE public.leads
SET estimated_net_monthly = ROUND(estimated_net_monthly / 12.0)
WHERE estimated_net_monthly > 0
  AND estimated_gross_monthly > 0
  AND ABS(estimated_net_monthly / estimated_gross_monthly - 7.8) < 0.05;
