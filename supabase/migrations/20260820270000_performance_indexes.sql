-- ============================================================
-- Migration: Performance indexes for high-volume queries
-- Timestamp: 20260820270000
-- Purpose: Add missing indexes for dashboard, lead management,
--          pipeline, and agent dashboard queries that have grown
--          expensive as lead volume has increased across all 10
--          portfolios. Also adds partial indexes for common
--          filtered queries.
-- ============================================================

-- ── leads table: composite indexes for common filter patterns ──

-- Dashboard: filter by state + sort by prospect_score (TopLeadsTable, KPI grid)
CREATE INDEX IF NOT EXISTS idx_leads_state_score
  ON public.leads (state, prospect_score DESC)
  WHERE stage != 'Not a Fit';

-- Lead Management: filter by stage + state (most common combined filter)
CREATE INDEX IF NOT EXISTS idx_leads_stage_state
  ON public.leads (stage, state);

-- Pipeline Board: filter by stage for kanban columns
CREATE INDEX IF NOT EXISTS idx_leads_stage_created
  ON public.leads (stage, created_at DESC);

-- Portfolio switch: state-only filter (used by filterLeadsByPortfolio)
CREATE INDEX IF NOT EXISTS idx_leads_state_created
  ON public.leads (state, created_at DESC);

-- Top Scored Leads widget: score + stage filter (excludes Not a Fit)
CREATE INDEX IF NOT EXISTS idx_leads_score_desc
  ON public.leads (prospect_score DESC, id)
  WHERE stage != 'Not a Fit';

-- Enrichment auto-enrich: score >= 70 + stage filter
CREATE INDEX IF NOT EXISTS idx_leads_score_stage_partial
  ON public.leads (prospect_score DESC, stage)
  WHERE prospect_score >= 70;

-- ── sync_events: index for SyncStatusTicker DB status reads ──

-- Fetch most recent sync event per operation_id (source name / portfolio)
CREATE INDEX IF NOT EXISTS idx_sync_events_operation_created
  ON public.sync_events (operation_id, created_at DESC);

-- Filter by status for success/failed queries
CREATE INDEX IF NOT EXISTS idx_sync_events_status_created
  ON public.sync_events (status, created_at DESC);

-- ── lead_enrichments: indexes for enrichment cost queries ──

-- Cost summary by provider + stage
CREATE INDEX IF NOT EXISTS idx_enrichment_logs_provider_stage
  ON public.enrichment_api_logs (provider, stage, called_at DESC);

-- Auto-enrich lookup: lead_id + enrichment_status
CREATE INDEX IF NOT EXISTS idx_lead_enrichments_lead_status
  ON public.lead_enrichments (lead_id, enrichment_status);

-- ── call_sessions: indexes for agent dashboard call log queries ──

-- Agent dashboard: filter by user_id + created_at
CREATE INDEX IF NOT EXISTS idx_call_sessions_agent_created
  ON public.call_sessions (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Lead record: filter by lead_id
CREATE INDEX IF NOT EXISTS idx_call_sessions_lead_created
  ON public.call_sessions (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;

-- ── activity_events: index for activity feed queries ──

CREATE INDEX IF NOT EXISTS idx_activity_events_created
  ON public.activity_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_lead_created
  ON public.activity_events (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;

-- ── outreach_history: index for agent outreach queries ──

CREATE INDEX IF NOT EXISTS idx_outreach_history_lead_created
  ON public.outreach_history (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_history_status
  ON public.outreach_history (status, created_at DESC);

-- ── app_notifications: index for notification drawer queries ──

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_read_created
  ON public.app_notifications (user_id, read, created_at DESC)
  WHERE user_id IS NOT NULL;
