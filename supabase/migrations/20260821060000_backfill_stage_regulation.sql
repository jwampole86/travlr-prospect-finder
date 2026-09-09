-- Migration: Backfill lead stage and regulation status
-- Root cause fixes:
-- 1. Leads imported via sync were correctly set to 'New Lead' in code, but any
--    leads that arrived before the stage default was enforced may have inherited
--    a wrong default. This migration corrects any leads that have no outreach
--    activity (no outreach_history records) but are staged as 'Contacted'.
-- 2. Regulation status was always set to 'Unknown' at sync time because the
--    regulation lookup was never wired in. This migration backfills known cities.

-- ─── 1. Fix mislabeled 'Contacted' leads that have no outreach activity ───────
-- Only reset leads that are 'Contacted' AND have no outreach_history records.
-- Leads that were genuinely contacted (have outreach records) are left alone.
UPDATE public.leads
SET
  stage = 'New Lead',
  updated_at = NOW()
WHERE
  stage = 'Contacted'
  AND id NOT IN (
    SELECT DISTINCT lead_id
    FROM public.outreach_history
    WHERE lead_id IS NOT NULL
  );

-- ─── 2. Backfill regulation_status for known cities ──────────────────────────
-- Update leads where regulation_status = 'Unknown' and city matches known rules.
-- Each city/state pair maps to the status defined in src/data/regulations.ts.

-- Colorado
UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Denver' AND state = 'CO';

UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Boulder' AND state = 'CO';

UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Aspen' AND state = 'CO';

UPDATE public.leads SET regulation_status = 'Allowed', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Breckenridge' AND state = 'CO';

UPDATE public.leads SET regulation_status = 'Allowed', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Vail' AND state = 'CO';

UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Colorado Springs' AND state = 'CO';

-- California
UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Los Angeles' AND state = 'CA';

UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Sherman Oaks' AND state = 'CA';

UPDATE public.leads SET regulation_status = 'Allowed', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Malibu' AND state = 'CA';

UPDATE public.leads SET regulation_status = 'Allowed', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Newport Beach' AND state = 'CA';

-- Nevada
UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Las Vegas' AND state = 'NV';

UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Henderson' AND state = 'NV';

-- Washington
UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Seattle' AND state = 'WA';

UPDATE public.leads SET regulation_status = 'Allowed', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Bellevue' AND state = 'WA';

UPDATE public.leads SET regulation_status = 'Allowed', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND city = 'Renton' AND state = 'WA';

-- Texas (general restricted — no specific city rules defined yet)
UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND state = 'TX';

-- Florida (general restricted)
UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND state = 'FL';

-- Utah (general restricted)
UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND state = 'UT';

-- Maine (general allowed — Portland ME is STR-friendly)
UPDATE public.leads SET regulation_status = 'Allowed', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND state = 'ME';

-- Oregon (general restricted — Portland OR has STR rules)
UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND state = 'OR';

-- Massachusetts (general restricted — Boston has STR rules)
UPDATE public.leads SET regulation_status = 'Restricted', updated_at = NOW()
WHERE regulation_status = 'Unknown' AND state = 'MA';
