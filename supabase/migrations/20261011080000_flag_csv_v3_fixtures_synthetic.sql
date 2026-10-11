-- csv-v3-001..015 are fixtures inserted by 20260905080000 (invented owners, identical $2,500 rent / ADR 200 placeholders),
-- not real prospects; they were outranking every genuine lead on the Top Scored Leads card.
UPDATE public.leads
SET is_synthetic = true
WHERE is_synthetic IS NOT TRUE
  AND id LIKE 'csv-v3-%';
