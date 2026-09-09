-- Delete all leads with addresses matching "Imported Property" pattern
DELETE FROM public.leads
WHERE address ILIKE 'Imported Property%'
   OR address ILIKE '% Listing #%';

-- ─── contact_history ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_history (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lead_id     TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'note',  -- 'email' | 'call' | 'text' | 'note'
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  outcome     TEXT NOT NULL DEFAULT '',
  contacted_at TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_history_lead_id ON public.contact_history(lead_id);

ALTER TABLE public.contact_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access_contact_history" ON public.contact_history;
CREATE POLICY "open_access_contact_history" ON public.contact_history FOR ALL TO public USING (true) WITH CHECK (true);

-- ─── email_templates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_templates (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL DEFAULT '',
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'outreach',  -- 'outreach' | 'follow_up' | 'proposal' | 'closing'
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access_email_templates" ON public.email_templates;
CREATE POLICY "open_access_email_templates" ON public.email_templates FOR ALL TO public USING (true) WITH CHECK (true);

-- ─── outreach_cadences ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outreach_cadences (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lead_id     TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL DEFAULT 1,
  channel     TEXT NOT NULL DEFAULT 'email',  -- 'email' | 'call' | 'text'
  scheduled_at TEXT NOT NULL DEFAULT '',
  template_id TEXT REFERENCES public.email_templates(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'skipped'
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_cadences_lead_id ON public.outreach_cadences(lead_id);

ALTER TABLE public.outreach_cadences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access_outreach_cadences" ON public.outreach_cadences;
CREATE POLICY "open_access_outreach_cadences" ON public.outreach_cadences FOR ALL TO public USING (true) WITH CHECK (true);

-- ─── lead_reminders ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_reminders (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lead_id     TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  due_date    TEXT NOT NULL DEFAULT '',
  priority    TEXT NOT NULL DEFAULT 'medium',  -- 'low' | 'medium' | 'high'
  completed   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_reminders_lead_id ON public.lead_reminders(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_reminders_due_date ON public.lead_reminders(due_date);

ALTER TABLE public.lead_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_access_lead_reminders" ON public.lead_reminders;
CREATE POLICY "open_access_lead_reminders" ON public.lead_reminders FOR ALL TO public USING (true) WITH CHECK (true);

-- ─── Seed default email templates ────────────────────────────────────────────
INSERT INTO public.email_templates (id, name, subject, body, category) VALUES
  ('tpl-001', 'Initial Outreach', 'Interested in Your Property at {{address}}',
   'Hi {{contactName}},\n\nI came across your listing at {{address}} and I am very interested in discussing a potential long-term arrangement.\n\nI specialize in furnished rentals and can offer consistent, reliable occupancy. Would you be open to a quick call this week?\n\nBest regards,\n{{senderName}}',
   'outreach'),
  ('tpl-002', 'Follow-Up #1', 'Following Up — {{address}}',
   'Hi {{contactName}},\n\nJust following up on my previous message about {{address}}. I am still very interested and would love to connect at your convenience.\n\nWould a 15-minute call work for you?\n\nBest,\n{{senderName}}',
   'follow_up'),
  ('tpl-003', 'Proposal Introduction', 'Proposal for {{address}} — Guaranteed Rent',
   'Hi {{contactName}},\n\nThank you for speaking with me about {{address}}. As discussed, I would like to formally propose a furnished rental arrangement:\n\n• Guaranteed monthly rent: {{price}}\n• Lease term: 12 months with renewal option\n• Professional management and maintenance\n\nPlease find the full proposal attached. I look forward to your feedback.\n\nBest regards,\n{{senderName}}',
   'proposal'),
  ('tpl-004', 'Closing / Contract', 'Ready to Move Forward — {{address}}',
   'Hi {{contactName}},\n\nGreat news — we are ready to move forward with {{address}}! I have prepared the lease agreement for your review.\n\nNext steps:\n1. Review and sign the attached agreement\n2. Schedule property walkthrough\n3. Confirm move-in date\n\nPlease let me know if you have any questions.\n\nBest,\n{{senderName}}',
   'closing'),
  ('tpl-005', 'Check-In / Re-Engage', 'Checking In — Still Interested in {{address}}?',
   'Hi {{contactName}},\n\nI wanted to check in on {{address}}. Is the property still available? I remain very interested and can move quickly if so.\n\nLooking forward to hearing from you.\n\nBest,\n{{senderName}}',
   'follow_up')
ON CONFLICT (id) DO NOTHING;
