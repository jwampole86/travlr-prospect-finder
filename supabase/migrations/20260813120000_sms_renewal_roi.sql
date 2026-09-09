-- Migration: SMS logs, renewal alerts, ROI calculator leads support
-- Timestamp: 20260813120000

-- ============================================================
-- SMS LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  template_id TEXT,
  template_label TEXT,
  sent_by TEXT NOT NULL DEFAULT 'agent',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tcpa_acknowledged BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sms_logs' AND policyname = 'sms_logs_read'
  ) THEN
    CREATE POLICY sms_logs_read ON public.sms_logs
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sms_logs' AND policyname = 'sms_logs_insert'
  ) THEN
    CREATE POLICY sms_logs_insert ON public.sms_logs
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================================
-- RENEWAL ALERTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.renewal_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  owner_name TEXT,
  owner_email TEXT,
  owner_phone TEXT,
  assigned_agent TEXT,
  renewal_date DATE NOT NULL,
  days_until_renewal INTEGER,
  risk_score TEXT NOT NULL DEFAULT 'medium' CHECK (risk_score IN ('critical', 'high', 'medium', 'low')),
  risk_factors TEXT[] DEFAULT '{}',
  occupancy_trend NUMERIC(5,2) DEFAULT 0,
  last_login_days_ago INTEGER DEFAULT 0,
  open_requests INTEGER DEFAULT 0,
  current_occupancy NUMERIC(5,2) DEFAULT 0,
  monthly_revenue NUMERIC(12,2) DEFAULT 0,
  agreement_year INTEGER DEFAULT 1,
  alert_sent_60d BOOLEAN DEFAULT FALSE,
  alert_sent_30d BOOLEAN DEFAULT FALSE,
  alert_sent_7d BOOLEAN DEFAULT FALSE,
  resolved BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.renewal_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'renewal_alerts' AND policyname = 'renewal_alerts_read'
  ) THEN
    CREATE POLICY renewal_alerts_read ON public.renewal_alerts
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'renewal_alerts' AND policyname = 'renewal_alerts_write'
  ) THEN
    CREATE POLICY renewal_alerts_write ON public.renewal_alerts
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================================
-- ROI CALCULATOR SUBMISSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roi_calculator_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  property_type TEXT NOT NULL,
  bedrooms TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  estimated_adr NUMERIC(10,2),
  estimated_occupancy NUMERIC(5,2),
  estimated_gross_monthly NUMERIC(12,2),
  estimated_net_monthly NUMERIC(12,2),
  estimated_annual_net NUMERIC(12,2),
  market_tier TEXT,
  lead_id TEXT,
  converted_to_lead BOOLEAN DEFAULT FALSE,
  ip_address TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.roi_calculator_submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'roi_calculator_submissions' AND policyname = 'roi_calc_anon_insert'
  ) THEN
    CREATE POLICY roi_calc_anon_insert ON public.roi_calculator_submissions
      FOR INSERT WITH CHECK (TRUE);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'roi_calculator_submissions' AND policyname = 'roi_calc_auth_read'
  ) THEN
    CREATE POLICY roi_calc_auth_read ON public.roi_calculator_submissions
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================================
-- Extend activity_events to support sms_sent type (if column exists as enum, add value)
-- ============================================================
DO $$ BEGIN
  -- If type column is a plain text column, no action needed
  -- If it's an enum, add sms_sent value safely
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'activity_event_type'
  ) THEN
    BEGIN
      ALTER TYPE activity_event_type ADD VALUE IF NOT EXISTS 'sms_sent';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
