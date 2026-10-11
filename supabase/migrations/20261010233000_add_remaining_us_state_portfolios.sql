-- ============================================================
-- Migration: 20261010233000_add_remaining_us_state_portfolios
-- Purpose: portfolio_registry only had 29 of the 50 states (+ DC) covered —
-- add the remaining 22 so every US state (plus DC) appears in the portfolio
-- dropdown, not just the ones that happened to already have leads. Lead
-- filtering itself needs no new code: PortfolioContext/useDashboardLeads
-- already filter generically by leads.state = portfolio.stateCode for
-- whichever portfolio is selected.
-- ============================================================

INSERT INTO public.portfolio_registry (state_code, state_name, portfolio_key, portfolio_label, is_active, auto_created)
VALUES
  ('AK', 'Alaska',                  'ak', 'Alaska Portfolio',                  true, true),
  ('AL', 'Alabama',                 'al', 'Alabama Portfolio',                 true, true),
  ('AR', 'Arkansas',                'ar', 'Arkansas Portfolio',                true, true),
  ('CT', 'Connecticut',             'ct', 'Connecticut Portfolio',             true, true),
  ('DC', 'District of Columbia',    'dc', 'District of Columbia Portfolio',    true, true),
  ('DE', 'Delaware',                'de', 'Delaware Portfolio',                true, true),
  ('HI', 'Hawaii',                  'hi', 'Hawaii Portfolio',                  true, true),
  ('IA', 'Iowa',                    'ia', 'Iowa Portfolio',                    true, true),
  ('IN', 'Indiana',                 'in', 'Indiana Portfolio',                 true, true),
  ('KY', 'Kentucky',                'ky', 'Kentucky Portfolio',                true, true),
  ('LA', 'Louisiana',               'la', 'Louisiana Portfolio',               true, true),
  ('MI', 'Michigan',                'mi', 'Michigan Portfolio',                true, true),
  ('MN', 'Minnesota',               'mn', 'Minnesota Portfolio',               true, true),
  ('MS', 'Mississippi',             'ms', 'Mississippi Portfolio',             true, true),
  ('ND', 'North Dakota',            'nd', 'North Dakota Portfolio',            true, true),
  ('OK', 'Oklahoma',                'ok', 'Oklahoma Portfolio',                true, true),
  ('RI', 'Rhode Island',            'ri', 'Rhode Island Portfolio',            true, true),
  ('SC', 'South Carolina',          'sc', 'South Carolina Portfolio',          true, true),
  ('SD', 'South Dakota',            'sd', 'South Dakota Portfolio',            true, true),
  ('TN', 'Tennessee',               'tn', 'Tennessee Portfolio',               true, true),
  ('VA', 'Virginia',                'va', 'Virginia Portfolio',                true, true),
  ('WV', 'West Virginia',           'wv', 'West Virginia Portfolio',           true, true)
ON CONFLICT (state_code) DO UPDATE SET
  is_active       = true,
  state_name      = EXCLUDED.state_name,
  portfolio_label = EXCLUDED.portfolio_label,
  updated_at      = now();

-- ─── Backfill portfolio_id/portfolio_name for any leads already in these states ──
-- (Same safe, idempotent pattern as the 20260904500000 migration — only fills
-- in missing/incorrect portfolio_id, never touches agent assignments or notes.)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT pr.state_code, pr.portfolio_key, pr.portfolio_label
    FROM public.portfolio_registry pr
    WHERE pr.is_active = true
      AND pr.state_code IN ('AK','AL','AR','CT','DC','DE','HI','IA','IN','KY','LA','MI','MN','MS','ND','OK','RI','SC','SD','TN','VA','WV')
  LOOP
    UPDATE public.leads
    SET
      portfolio_id   = rec.portfolio_key,
      portfolio_name = rec.portfolio_label,
      updated_at     = now()
    WHERE
      UPPER(TRIM(state)) = rec.state_code
      AND (
        portfolio_id IS NULL
        OR portfolio_id = ''
        OR portfolio_id != rec.portfolio_key
      );
  END LOOP;
END $$;
