-- Migration: Seed TRAVLR Master SMS Templates
-- Timestamp: 20260814220000
-- Inserts 5 master SMS outreach templates into message_templates
-- Uses ON CONFLICT (name) DO UPDATE so re-running is safe and bodies stay current

-- Ensure tag column exists (added alongside message_templates)
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS tag TEXT;

-- Ensure unique constraint on name exists (required for ON CONFLICT (name))
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.message_templates'::regclass
      AND contype = 'u'
      AND conname = 'message_templates_name_key'
  ) THEN
    ALTER TABLE public.message_templates ADD CONSTRAINT message_templates_name_key UNIQUE (name);
  END IF;
END $$;

-- ── 1. Initial Outreach ───────────────────────────────────────────────────────
INSERT INTO public.message_templates (name, type, body, category, tag, variables, created_at, updated_at)
VALUES (
  'SMS — Initial Outreach',
  'sms',
  'Hi {{contactName}}, this is {{senderName}} with TRAVLR Vacation Homes. I came across {{address}} and wanted to reach out. We''re a luxury vacation rental and property management company, and {{localBlurb}}. We handle guests, cleaning, maintenance, and pricing so owners don''t have to. Would you be open to a quick call?',
  'Initial Outreach',
  'outreach',
  ARRAY['{{contactName}}','{{senderName}}','{{address}}','{{localBlurb}}'],
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE
  SET body       = EXCLUDED.body,
      category   = EXCLUDED.category,
      tag        = EXCLUDED.tag,
      variables  = EXCLUDED.variables,
      updated_at = NOW();

-- ── 2. Follow-Up #1 ───────────────────────────────────────────────────────────
INSERT INTO public.message_templates (name, type, body, category, tag, variables, created_at, updated_at)
VALUES (
  'SMS — Follow-Up #1',
  'sms',
  'Hi {{contactName}}, just following up on my message about {{address}}. We''re still very interested and would love to connect. {{localBlurb}}. Would you be open to a quick call this week?',
  'Follow-Up',
  'follow up',
  ARRAY['{{contactName}}','{{senderName}}','{{address}}','{{localBlurb}}'],
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE
  SET body       = EXCLUDED.body,
      category   = EXCLUDED.category,
      tag        = EXCLUDED.tag,
      variables  = EXCLUDED.variables,
      updated_at = NOW();

-- ── 3. Check-In / Re-Engage ───────────────────────────────────────────────────
INSERT INTO public.message_templates (name, type, body, category, tag, variables, created_at, updated_at)
VALUES (
  'SMS — Check-In / Re-Engage',
  'sms',
  'Hi {{contactName}}, wanted to check back in regarding {{address}}. Is the property still available? We remain interested and would be happy to reconnect whenever the timing makes sense.',
  'Follow-Up',
  'follow up',
  ARRAY['{{contactName}}','{{senderName}}','{{address}}'],
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE
  SET body       = EXCLUDED.body,
      category   = EXCLUDED.category,
      tag        = EXCLUDED.tag,
      variables  = EXCLUDED.variables,
      updated_at = NOW();

-- ── 4. Proposal Introduction ──────────────────────────────────────────────────
INSERT INTO public.message_templates (name, type, body, category, tag, variables, created_at, updated_at)
VALUES (
  'SMS — Proposal Introduction',
  'sms',
  'Hi {{contactName}}, thanks again for speaking with me about {{address}}. I''d like to formally propose {{proposedRent}}/month for {{leaseTerm}}, starting {{proposedStartDate}}. TRAVLR would handle the full guest and property experience, including cleaning, maintenance, guest services, concierge, and pricing. Happy to talk through any questions.',
  'Proposal',
  'proposal',
  ARRAY['{{contactName}}','{{senderName}}','{{address}}','{{proposedRent}}','{{leaseTerm}}','{{proposedStartDate}}'],
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE
  SET body       = EXCLUDED.body,
      category   = EXCLUDED.category,
      tag        = EXCLUDED.tag,
      variables  = EXCLUDED.variables,
      updated_at = NOW();

-- ── 5. Closing / Contract ─────────────────────────────────────────────────────
INSERT INTO public.message_templates (name, type, body, category, tag, variables, created_at, updated_at)
VALUES (
  'SMS — Closing / Contract',
  'sms',
  'Hi {{contactName}}, great news — we''re ready to move forward with {{address}}! I''ll send over the agreement for your review. Once everything looks good, we''ll coordinate the walkthrough and get the start date locked in. Excited to work together!',
  'Closing',
  'closing',
  ARRAY['{{contactName}}','{{senderName}}','{{address}}'],
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE
  SET body       = EXCLUDED.body,
      category   = EXCLUDED.category,
      tag        = EXCLUDED.tag,
      variables  = EXCLUDED.variables,
      updated_at = NOW();
