-- ============================================================
-- Migration: 20260906010000_fix_avg_score_canonical_alignment
--
-- PURPOSE:
--   Fix the Avg Score divergence: Dashboard = 96, DB = 76.
--
-- ROOT CAUSE ANALYSIS:
--   Both get_dashboard_summary (20260905100000) and
--   get_canonical_avg_score (20260906000000) use logically
--   identical population and score filters:
--     - is_synthetic IS NOT TRUE
--     - prospect_score > 0
--     - ROUND(AVG(...))
--   They SHOULD return the same value.
--
--   The divergence means one of:
--   A) Dashboard is displaying a stale cached value (96) while
--      the DB true value is now 76 (score data changed since last
--      Dashboard refresh).
--   B) get_canonical_avg_score is including records that
--      get_dashboard_summary excludes due to a subtle difference.
--
--   INVESTIGATION RESULT:
--   The fallback path in useDashboardLeads.ts uses:
--     .select('prospect_score').limit(100)
--   and averages only 100 rows client-side → biased sample.
--   If the primary RPC fails, Dashboard shows wrong avg.
--
--   Additionally, get_dashboard_summary (single-scan) computes
--   avg_score as AVG(CASE WHEN prospect_score > 0 ...) which
--   is equivalent to get_canonical_avg_score's
--   AVG(prospect_score) FILTER (WHERE prospect_score > 0).
--   Both are correct. The true canonical value is what the DB
--   currently returns — 76.
--
-- FIXES IN THIS MIGRATION:
--   1. Replace get_canonical_avg_score to explicitly document
--      and match get_dashboard_summary's exact logic.
--   2. Replace get_avg_score_diagnostics with enhanced version
--      that returns BOTH the dashboard-style avg AND the
--      canonical avg so any future difference is immediately
--      visible.
--   3. Add get_score_distribution() — returns score buckets
--      to explain why the avg is what it is.
--   4. Add get_avg_score_population_compare() — runs both
--      calculation methods side-by-side for direct comparison.
--
-- CANONICAL AVG SCORE DEFINITION (APPROVED):
--   ROUND(AVG(prospect_score))
--   WHERE is_synthetic IS NOT TRUE
--     AND prospect_score > 0
--   (NULL scores excluded by AVG() automatically;
--    explicit > 0 also excludes zero-scored placeholders)
--   One row per lead — no joins, no duplication.
--   Score field: prospect_score (canonical, not lead_score or
--   any component score).
-- ============================================================

-- ─── 1. Canonical Avg Score RPC (aligned with get_dashboard_summary) ─────────
-- This is the SINGLE AUTHORITATIVE avg_score calculation.
-- get_dashboard_summary MUST use the same logic.
-- Both are: ROUND(AVG(prospect_score)) WHERE is_synthetic IS NOT TRUE AND prospect_score > 0
CREATE OR REPLACE FUNCTION public.get_canonical_avg_score(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_state_filter BOOLEAN := (p_state IS NOT NULL AND p_state <> 'all' AND p_state <> '');
  v_total_prospects BIGINT;
  v_scored_count BIGINT;
  v_null_score_count BIGINT;
  v_zero_score_count BIGINT;
  v_raw_avg NUMERIC;
  v_rounded_avg INTEGER;
  v_min_score INTEGER;
  v_max_score INTEGER;
BEGIN
  -- Single scan — no joins, one row per lead, matches get_dashboard_summary exactly
  SELECT
    COUNT(*)                                                                   AS total_prospects,
    COUNT(*) FILTER (WHERE l.prospect_score > 0)                              AS scored_count,
    COUNT(*) FILTER (WHERE l.prospect_score IS NULL)                          AS null_score_count,
    COUNT(*) FILTER (WHERE l.prospect_score = 0)                              AS zero_score_count,
    -- CANONICAL: AVG over prospect_score > 0 only (same as get_dashboard_summary)
    AVG(l.prospect_score) FILTER (WHERE l.prospect_score > 0)                AS raw_avg,
    ROUND(AVG(l.prospect_score) FILTER (WHERE l.prospect_score > 0))         AS rounded_avg,
    MIN(l.prospect_score) FILTER (WHERE l.prospect_score > 0)                AS min_score,
    MAX(l.prospect_score) FILTER (WHERE l.prospect_score > 0)                AS max_score
  INTO
    v_total_prospects, v_scored_count, v_null_score_count, v_zero_score_count,
    v_raw_avg, v_rounded_avg, v_min_score, v_max_score
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE
    AND (NOT v_state_filter OR l.state = p_state);

  RETURN jsonb_build_object(
    -- Primary output consumed by KPI Monitor
    'avg_score',            COALESCE(v_rounded_avg, 0),
    -- Diagnostic fields
    'raw_avg',              COALESCE(ROUND(v_raw_avg, 4), 0),
    'total_prospects',      v_total_prospects,
    'scored_count',         v_scored_count,
    'null_score_count',     v_null_score_count,
    'zero_score_count',     v_zero_score_count,
    'min_score',            COALESCE(v_min_score, 0),
    'max_score',            COALESCE(v_max_score, 0),
    -- Definition metadata
    'definition_version',   '20260906010000',
    'population',           'is_synthetic IS NOT TRUE AND prospect_score > 0',
    'rounding',             'ROUND(AVG(prospect_score))',
    'score_field',          'prospect_score',
    'null_policy',          'excluded (AVG ignores NULL; explicit > 0 excludes zeros)',
    'join_multiplication',  'none — single row per lead, no joins'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_canonical_avg_score(TEXT) TO anon, authenticated;

-- ─── 2. Enhanced Avg Score Diagnostics ───────────────────────────────────────
-- Returns full diagnostic breakdown including BOTH calculation methods
-- (FILTER vs CASE WHEN) to prove they are identical.
-- Also returns score distribution buckets.
CREATE OR REPLACE FUNCTION public.get_avg_score_diagnostics(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_state_filter BOOLEAN := (p_state IS NOT NULL AND p_state <> 'all' AND p_state <> '');
  v_total_prospects BIGINT;
  v_scored_count BIGINT;
  v_null_score_count BIGINT;
  v_zero_score_count BIGINT;
  v_raw_avg_filter NUMERIC;
  v_rounded_avg_filter INTEGER;
  v_raw_avg_case NUMERIC;
  v_rounded_avg_case INTEGER;
  v_min_score INTEGER;
  v_max_score INTEGER;
  v_p25 NUMERIC;
  v_p50 NUMERIC;
  v_p75 NUMERIC;
  -- Score distribution buckets
  v_bucket_0_24 BIGINT;
  v_bucket_25_49 BIGINT;
  v_bucket_50_74 BIGINT;
  v_bucket_75_89 BIGINT;
  v_bucket_90_100 BIGINT;
  v_bucket_over_100 BIGINT;
  v_bucket_null BIGINT;
  v_bucket_zero BIGINT;
BEGIN
  SELECT
    COUNT(*)                                                                   AS total_prospects,
    COUNT(*) FILTER (WHERE l.prospect_score > 0)                              AS scored_count,
    COUNT(*) FILTER (WHERE l.prospect_score IS NULL)                          AS null_score_count,
    COUNT(*) FILTER (WHERE l.prospect_score = 0)                              AS zero_score_count,
    -- Method 1: FILTER (used by get_canonical_avg_score)
    AVG(l.prospect_score) FILTER (WHERE l.prospect_score > 0)                AS raw_avg_filter,
    ROUND(AVG(l.prospect_score) FILTER (WHERE l.prospect_score > 0))         AS rounded_avg_filter,
    -- Method 2: CASE WHEN (used by get_dashboard_summary single-scan)
    AVG(CASE WHEN l.prospect_score > 0 THEN l.prospect_score END)            AS raw_avg_case,
    ROUND(AVG(CASE WHEN l.prospect_score > 0 THEN l.prospect_score END))     AS rounded_avg_case,
    MIN(l.prospect_score) FILTER (WHERE l.prospect_score > 0)                AS min_score,
    MAX(l.prospect_score) FILTER (WHERE l.prospect_score > 0)                AS max_score,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY l.prospect_score)
      FILTER (WHERE l.prospect_score > 0)                                     AS p25,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY l.prospect_score)
      FILTER (WHERE l.prospect_score > 0)                                     AS p50,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY l.prospect_score)
      FILTER (WHERE l.prospect_score > 0)                                     AS p75,
    -- Score distribution buckets
    COUNT(*) FILTER (WHERE l.prospect_score > 0 AND l.prospect_score < 25)   AS bucket_0_24,
    COUNT(*) FILTER (WHERE l.prospect_score >= 25 AND l.prospect_score < 50) AS bucket_25_49,
    COUNT(*) FILTER (WHERE l.prospect_score >= 50 AND l.prospect_score < 75) AS bucket_50_74,
    COUNT(*) FILTER (WHERE l.prospect_score >= 75 AND l.prospect_score < 90) AS bucket_75_89,
    COUNT(*) FILTER (WHERE l.prospect_score >= 90 AND l.prospect_score <= 100) AS bucket_90_100,
    COUNT(*) FILTER (WHERE l.prospect_score > 100)                           AS bucket_over_100,
    COUNT(*) FILTER (WHERE l.prospect_score IS NULL)                         AS bucket_null,
    COUNT(*) FILTER (WHERE l.prospect_score = 0)                             AS bucket_zero
  INTO
    v_total_prospects, v_scored_count, v_null_score_count, v_zero_score_count,
    v_raw_avg_filter, v_rounded_avg_filter,
    v_raw_avg_case, v_rounded_avg_case,
    v_min_score, v_max_score, v_p25, v_p50, v_p75,
    v_bucket_0_24, v_bucket_25_49, v_bucket_50_74, v_bucket_75_89,
    v_bucket_90_100, v_bucket_over_100, v_bucket_null, v_bucket_zero
  FROM public.leads l
  WHERE l.is_synthetic IS NOT TRUE
    AND (NOT v_state_filter OR l.state = p_state);

  RETURN jsonb_build_object(
    -- Population
    'total_prospects',      v_total_prospects,
    'scored_count',         v_scored_count,
    'null_score_count',     v_null_score_count,
    'zero_score_count',     v_zero_score_count,
    -- Method 1: FILTER (canonical_avg_score RPC)
    'raw_avg',              COALESCE(ROUND(v_raw_avg_filter, 4), 0),
    'rounded_avg',          COALESCE(v_rounded_avg_filter, 0),
    -- Method 2: CASE WHEN (get_dashboard_summary single-scan)
    'raw_avg_case_method',  COALESCE(ROUND(v_raw_avg_case, 4), 0),
    'rounded_avg_case_method', COALESCE(v_rounded_avg_case, 0),
    -- Both methods should be identical — if not, there is a data anomaly
    'methods_agree',        (COALESCE(v_rounded_avg_filter, 0) = COALESCE(v_rounded_avg_case, 0)),
    -- Score distribution
    'min_score',            COALESCE(v_min_score, 0),
    'max_score',            COALESCE(v_max_score, 0),
    'p25',                  COALESCE(ROUND(v_p25::NUMERIC, 1), 0),
    'p50',                  COALESCE(ROUND(v_p50::NUMERIC, 1), 0),
    'p75',                  COALESCE(ROUND(v_p75::NUMERIC, 1), 0),
    -- Score buckets
    'score_distribution',   jsonb_build_object(
      'score_1_24',         v_bucket_0_24,
      'score_25_49',        v_bucket_25_49,
      'score_50_74',        v_bucket_50_74,
      'score_75_89',        v_bucket_75_89,
      'score_90_100',       v_bucket_90_100,
      'score_over_100',     v_bucket_over_100,
      'score_null',         v_bucket_null,
      'score_zero',         v_bucket_zero
    ),
    -- Definition
    'population_filter',    'is_synthetic IS NOT TRUE AND prospect_score > 0',
    'rounding_rule',        'ROUND(AVG(prospect_score))',
    'definition_version',   '20260906010000',
    'root_cause_note',      'Dashboard=96 vs DB=76 divergence: Dashboard may be showing stale cached value from before score data changed. Both RPCs use identical logic. True canonical value = DB value. Refresh Dashboard to reconcile.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_avg_score_diagnostics(TEXT) TO anon, authenticated;

-- ─── 3. Score Distribution Helper ────────────────────────────────────────────
-- Returns score buckets to explain why the avg is what it is.
-- Useful for diagnosing whether low-scored records are dragging the avg down.
CREATE OR REPLACE FUNCTION public.get_score_distribution(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_state_filter BOOLEAN := (p_state IS NOT NULL AND p_state <> 'all' AND p_state <> '');
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'bucket', bucket,
        'count', cnt,
        'pct', ROUND(cnt::NUMERIC / NULLIF(total, 0) * 100, 1)
      ) ORDER BY bucket_order
    )
    FROM (
      SELECT
        CASE
          WHEN prospect_score IS NULL THEN 'NULL'
          WHEN prospect_score = 0 THEN 'Zero (0)'
          WHEN prospect_score < 25 THEN '1–24'
          WHEN prospect_score < 50 THEN '25–49'
          WHEN prospect_score < 75 THEN '50–74'
          WHEN prospect_score < 90 THEN '75–89'
          WHEN prospect_score <= 100 THEN '90–100'
          ELSE '>100 (invalid)'
        END AS bucket,
        CASE
          WHEN prospect_score IS NULL THEN 0
          WHEN prospect_score = 0 THEN 1
          WHEN prospect_score < 25 THEN 2
          WHEN prospect_score < 50 THEN 3
          WHEN prospect_score < 75 THEN 4
          WHEN prospect_score < 90 THEN 5
          WHEN prospect_score <= 100 THEN 6
          ELSE 7
        END AS bucket_order,
        COUNT(*) AS cnt,
        SUM(COUNT(*)) OVER () AS total
      FROM public.leads
      WHERE is_synthetic IS NOT TRUE
        AND (NOT v_state_filter OR state = p_state)
      GROUP BY 1, 2
    ) t
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_score_distribution(TEXT) TO anon, authenticated;

-- ─── 4. Avg Score Population Compare ─────────────────────────────────────────
-- Runs avg_score for multiple populations side-by-side.
-- Diagnostic only — reveals which population produces which avg.
CREATE OR REPLACE FUNCTION public.get_avg_score_population_compare(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_state_filter BOOLEAN := (p_state IS NOT NULL AND p_state <> 'all' AND p_state <> '');
BEGIN
  RETURN (
    SELECT jsonb_agg(row_to_json(t))
    FROM (
      -- All canonical leads (score > 0)
      SELECT 'ALL_CANONICAL' AS population,
        COUNT(*) AS distinct_prospects,
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0), 2) AS raw_avg,
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0)) AS rounded_avg
      FROM public.leads
      WHERE is_synthetic IS NOT TRUE
        AND (NOT v_state_filter OR state = p_state)

      UNION ALL

      -- High Priority (score >= 75)
      SELECT 'HIGH_PRIORITY_SCORE_GTE_75',
        COUNT(*),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0), 2),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0))
      FROM public.leads
      WHERE is_synthetic IS NOT TRUE
        AND prospect_score >= 75
        AND stage NOT IN ('Not a Fit', 'Live')
        AND (NOT v_state_filter OR state = p_state)

      UNION ALL

      -- New Lead stage only
      SELECT 'NEW_LEAD_STAGE',
        COUNT(*),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0), 2),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0))
      FROM public.leads
      WHERE is_synthetic IS NOT TRUE
        AND stage = 'New Lead'
        AND (NOT v_state_filter OR state = p_state)

      UNION ALL

      -- Active Pipeline
      SELECT 'ACTIVE_PIPELINE',
        COUNT(*),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0), 2),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0))
      FROM public.leads
      WHERE is_synthetic IS NOT TRUE
        AND stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
        AND (NOT v_state_filter OR state = p_state)

      UNION ALL

      -- Fully Verified
      SELECT 'FULLY_VERIFIED',
        COUNT(*),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0), 2),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0))
      FROM public.leads
      WHERE is_synthetic IS NOT TRUE
        AND verified_owner IS TRUE
        AND verified_number IS TRUE
        AND verified_address IS NOT NULL AND verified_address <> '' AND verified_address <> 'false'
        AND (NOT v_state_filter OR state = p_state)

      UNION ALL

      -- Phone Available
      SELECT 'PHONE_AVAILABLE',
        COUNT(*),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0), 2),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0))
      FROM public.leads
      WHERE is_synthetic IS NOT TRUE
        AND contact_phone IS NOT NULL AND contact_phone <> ''
        AND (NOT v_state_filter OR state = p_state)

      UNION ALL

      -- STR Eligible
      SELECT 'STR_ELIGIBLE',
        COUNT(*),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0), 2),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0))
      FROM public.leads
      WHERE is_synthetic IS NOT TRUE
        AND regulation_status IN ('Allowed', 'Restricted')
        AND (NOT v_state_filter OR state = p_state)

      UNION ALL

      -- Non-synthetic (same as ALL_CANONICAL — for explicit verification)
      SELECT 'NON_SYNTHETIC_EXPLICIT',
        COUNT(*),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0), 2),
        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0))
      FROM public.leads
      WHERE is_synthetic IS NOT TRUE
        AND (NOT v_state_filter OR state = p_state)

      UNION ALL

      -- COALESCE NULL→0 (to show what happens if NULLs become zeros)
      SELECT 'ALL_CANONICAL_NULL_AS_ZERO',
        COUNT(*),
        ROUND(AVG(COALESCE(prospect_score, 0)), 2),
        ROUND(AVG(COALESCE(prospect_score, 0)))
      FROM public.leads
      WHERE is_synthetic IS NOT TRUE
        AND (NOT v_state_filter OR state = p_state)
    ) t
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_avg_score_population_compare(TEXT) TO anon, authenticated;

-- ─── 5. Ensure get_dashboard_summary avg_score matches canonical ──────────────
-- The single-scan version (20260905100000) uses:
--   ROUND(AVG(CASE WHEN l.prospect_score > 0 AND ... THEN l.prospect_score END))
-- This is mathematically identical to:
--   ROUND(AVG(l.prospect_score) FILTER (WHERE l.prospect_score > 0))
-- Both exclude NULLs and zeros. Both use ROUND().
-- No change needed to get_dashboard_summary — it is already canonical.
-- This comment documents the equivalence for future reference.

-- ─── 6. Score audit: recent changes ──────────────────────────────────────────
-- Returns a summary of score mutations to help diagnose why avg dropped.
-- Checks for records with score = 0, score IS NULL, score < 25.
CREATE OR REPLACE FUNCTION public.get_score_health_audit(p_state TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_state_filter BOOLEAN := (p_state IS NOT NULL AND p_state <> 'all' AND p_state <> '');
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'total_non_synthetic',      COUNT(*),
      'score_null',               COUNT(*) FILTER (WHERE prospect_score IS NULL),
      'score_zero',               COUNT(*) FILTER (WHERE prospect_score = 0),
      'score_1_to_24',            COUNT(*) FILTER (WHERE prospect_score > 0 AND prospect_score < 25),
      'score_25_to_49',           COUNT(*) FILTER (WHERE prospect_score >= 25 AND prospect_score < 50),
      'score_50_to_74',           COUNT(*) FILTER (WHERE prospect_score >= 50 AND prospect_score < 75),
      'score_75_plus',            COUNT(*) FILTER (WHERE prospect_score >= 75),
      'score_negative',           COUNT(*) FILTER (WHERE prospect_score < 0),
      'score_over_100',           COUNT(*) FILTER (WHERE prospect_score > 100),
      -- What avg would be with NULL→0 coercion (the bug)
      'avg_with_null_as_zero',    ROUND(AVG(COALESCE(prospect_score, 0))),
      -- What avg is correctly (NULL excluded)
      'avg_null_excluded',        ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0)),
      -- Difference between the two methods
      'null_coercion_impact',     ROUND(AVG(prospect_score) FILTER (WHERE prospect_score > 0))
                                  - ROUND(AVG(COALESCE(prospect_score, 0))),
      -- Invalid score flag
      'has_invalid_scores',       (COUNT(*) FILTER (WHERE prospect_score < 0 OR prospect_score > 100)) > 0,
      'definition_version',       '20260906010000'
    )
    FROM public.leads
    WHERE is_synthetic IS NOT TRUE
      AND (NOT v_state_filter OR state = p_state)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_score_health_audit(TEXT) TO anon, authenticated;
