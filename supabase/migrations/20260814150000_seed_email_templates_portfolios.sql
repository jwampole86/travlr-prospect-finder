-- Migration: Seed all TRAVLR email templates (portfolio + master)
-- Timestamp: 20260814150000
-- Inserts CO, CA, NV, WA portfolio templates (5 steps each) + 5 master templates
-- Uses ON CONFLICT DO NOTHING so re-running is safe

-- Ensure portfolio column exists on email_templates
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS portfolio TEXT;

-- ─── Colorado ────────────────────────────────────────────────────────────────
INSERT INTO public.email_templates (name, subject, body, category, portfolio) VALUES
(
  'CO — Initial Outreach',
  'Interested in Your Property at {{address}}',
  'Hi {{contactName}},

I came across {{address}} and wanted to reach out directly — I''m with TRAVLR Vacation Homes, a boutique luxury vacation rental and property management company. We launched our Colorado subsidiary in early 2025 and are actively growing our portfolio across Aspen, Breckenridge, and Vail, which is what brought {{address}} to my attention.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I''d love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'initial_outreach',
  'CO'
),
(
  'CO — Follow-Up #1',
  'Following Up — {{address}}',
  'Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, TRAVLR Vacation Homes has managed luxury vacation properties for homeowners for over 10 years, and launched our Colorado operation in early 2025, now serving Aspen, Breckenridge, and Vail. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn''t the right time, no worries at all — just let me know and I''ll follow up down the line. But if you''re open to it, I''m happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'follow_up_1',
  'CO'
),
(
  'CO — Check-In / Re-Engage',
  'Checking In — Still Interested in {{address}}?',
  'Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I''m with TRAVLR Vacation Homes — we bring 10+ years of luxury vacation rental management experience and have been building our Colorado presence across Aspen, Breckenridge, and Vail since early 2025. Happy to share references or more on how we operate if that''s helpful.

If your plans have changed or you''ve already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you''re still open to exploring this, I''d love to reconnect.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'check_in',
  'CO'
),
(
  'CO — Proposal Introduction',
  'Proposal for {{address}} — Guaranteed Rent',
  'Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I''d like to formally propose the following terms on behalf of TRAVLR Vacation Homes.

A bit more about us: TRAVLR is a boutique luxury vacation rental and property management company with over 10 years of experience, now operating in Colorado across Aspen, Breckenridge, and Vail since launching our subsidiary in early 2025. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I''ve attached more details for your review, and you''re welcome to look through our track record at staytravlr.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'proposal_introduction',
  'CO'
),
(
  'CO — Closing / Contract',
  'Ready to Move Forward — {{address}}',
  'Hi {{contactName}},

Great news — we are ready to move forward with {{address}}! I have prepared the agreement for your review, attached to this email.

Please take a look and let me know if everything looks correct, or if you''d like any changes before we finalize. Once you''re comfortable with the terms, we can schedule signing and get a start date locked in.

A few next steps on my end:
1. You review and sign the attached agreement
2. We coordinate a walkthrough date
3. First payment is processed per the agreed terms

Thank you again for trusting TRAVLR Vacation Homes with {{address}} — excited to get started and to have you as one of our partner homeowners in Colorado.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'closing',
  'CO'
)
ON CONFLICT DO NOTHING;

-- ─── California ──────────────────────────────────────────────────────────────
INSERT INTO public.email_templates (name, subject, body, category, portfolio) VALUES
(
  'CA — Initial Outreach',
  'Interested in Your Property at {{address}}',
  'Hi {{contactName}},

I came across {{address}} and wanted to reach out directly — I''m with TRAVLR Vacation Homes, a boutique luxury vacation rental and property management company based in Palm Springs / Palm Desert, where we''ve operated for over 10 years, with an active presence across the LA basin and Southern California coast — including Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I''d love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'initial_outreach',
  'CA'
),
(
  'CA — Follow-Up #1',
  'Following Up — {{address}}',
  'Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, TRAVLR Vacation Homes has been managing luxury vacation properties across Southern California for over 10 years, with a presence spanning Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn''t the right time, no worries at all — just let me know and I''ll follow up down the line. But if you''re open to it, I''m happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'follow_up_1',
  'CA'
),
(
  'CA — Check-In / Re-Engage',
  'Checking In — Still Interested in {{address}}?',
  'Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I''m with TRAVLR Vacation Homes — we''ve been a Southern California presence for over 10 years, managing luxury vacation rentals across Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach. Happy to share references or more on how we operate if that''s helpful.

If your plans have changed or you''ve already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you''re still open to exploring this, I''d love to reconnect.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'check_in',
  'CA'
),
(
  'CA — Proposal Introduction',
  'Proposal for {{address}} — Guaranteed Rent',
  'Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I''d like to formally propose the following terms on behalf of TRAVLR Vacation Homes.

A bit more about us: TRAVLR is a boutique luxury vacation rental and property management company with over 10 years of experience, proudly serving Southern California — including Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I''ve attached more details for your review, and you''re welcome to look through our track record at staytravlr.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'proposal_introduction',
  'CA'
),
(
  'CA — Closing / Contract',
  'Ready to Move Forward — {{address}}',
  'Hi {{contactName}},

Great news — we are ready to move forward with {{address}}! I have prepared the agreement for your review, attached to this email.

Please take a look and let me know if everything looks correct, or if you''d like any changes before we finalize. Once you''re comfortable with the terms, we can schedule signing and get a start date locked in.

A few next steps on my end:
1. You review and sign the attached agreement
2. We coordinate a walkthrough date
3. First payment is processed per the agreed terms

Thank you again for trusting TRAVLR Vacation Homes with {{address}} — excited to get started and to have you as one of our partner homeowners here in Southern California.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'closing',
  'CA'
)
ON CONFLICT DO NOTHING;

-- ─── Nevada ───────────────────────────────────────────────────────────────────
INSERT INTO public.email_templates (name, subject, body, category, portfolio) VALUES
(
  'NV — Initial Outreach',
  'Interested in Your Property at {{address}}',
  'Hi {{contactName}},

I came across {{address}} and wanted to reach out directly — I''m with TRAVLR Vacation Homes, a boutique luxury vacation rental and property management company. We''re growing our presence in Nevada, focused on Las Vegas and Henderson, which is what brought {{address}} to my attention.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I''d love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'initial_outreach',
  'NV'
),
(
  'NV — Follow-Up #1',
  'Following Up — {{address}}',
  'Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, TRAVLR Vacation Homes has managed luxury vacation properties for homeowners for over 10 years and is actively expanding into Nevada, including Las Vegas and Henderson. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn''t the right time, no worries at all — just let me know and I''ll follow up down the line. But if you''re open to it, I''m happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'follow_up_1',
  'NV'
),
(
  'NV — Check-In / Re-Engage',
  'Checking In — Still Interested in {{address}}?',
  'Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I''m with TRAVLR Vacation Homes — we bring 10+ years of luxury vacation rental management experience and are building our footprint in Las Vegas and Henderson. Happy to share references or more on how we operate if that''s helpful.

If your plans have changed or you''ve already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you''re still open to exploring this, I''d love to reconnect.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'check_in',
  'NV'
),
(
  'NV — Proposal Introduction',
  'Proposal for {{address}} — Guaranteed Rent',
  'Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I''d like to formally propose the following terms on behalf of TRAVLR Vacation Homes.

A bit more about us: TRAVLR is a boutique luxury vacation rental and property management company with over 10 years of experience, now expanding into Nevada across Las Vegas and Henderson. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I''ve attached more details for your review, and you''re welcome to look through our track record at staytravlr.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'proposal_introduction',
  'NV'
),
(
  'NV — Closing / Contract',
  'Ready to Move Forward — {{address}}',
  'Hi {{contactName}},

Great news — we are ready to move forward with {{address}}! I have prepared the agreement for your review, attached to this email.

Please take a look and let me know if everything looks correct, or if you''d like any changes before we finalize. Once you''re comfortable with the terms, we can schedule signing and get a start date locked in.

A few next steps on my end:
1. You review and sign the attached agreement
2. We coordinate a walkthrough date
3. First payment is processed per the agreed terms

Thank you again for trusting TRAVLR Vacation Homes with {{address}} — excited to get started and to have you as one of our partner homeowners in Nevada.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'closing',
  'NV'
)
ON CONFLICT DO NOTHING;

-- ─── Washington ───────────────────────────────────────────────────────────────
INSERT INTO public.email_templates (name, subject, body, category, portfolio) VALUES
(
  'WA — Initial Outreach',
  'Interested in Your Property at {{address}}',
  'Hi {{contactName}},

I came across {{address}} and wanted to reach out directly — I''m with TRAVLR Vacation Homes, a boutique luxury vacation rental and property management company. We''re expanding into Washington State, with a focus on Seattle, Bellevue, and Renton, which is what brought {{address}} to my attention.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I''d love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'initial_outreach',
  'WA'
),
(
  'WA — Follow-Up #1',
  'Following Up — {{address}}',
  'Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, TRAVLR Vacation Homes has managed luxury vacation properties for homeowners for over 10 years and is actively expanding into Washington State, including Seattle, Bellevue, and Renton. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn''t the right time, no worries at all — just let me know and I''ll follow up down the line. But if you''re open to it, I''m happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'follow_up_1',
  'WA'
),
(
  'WA — Check-In / Re-Engage',
  'Checking In — Still Interested in {{address}}?',
  'Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I''m with TRAVLR Vacation Homes — we bring 10+ years of luxury vacation rental management experience and are building our presence across Seattle, Bellevue, and Renton. Happy to share references or more on how we operate if that''s helpful.

If your plans have changed or you''ve already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you''re still open to exploring this, I''d love to reconnect.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'check_in',
  'WA'
),
(
  'WA — Proposal Introduction',
  'Proposal for {{address}} — Guaranteed Rent',
  'Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I''d like to formally propose the following terms on behalf of TRAVLR Vacation Homes.

A bit more about us: TRAVLR is a boutique luxury vacation rental and property management company with over 10 years of experience, now expanding into Washington State across Seattle, Bellevue, and Renton. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I''ve attached more details for your review, and you''re welcome to look through our track record at staytravlr.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'proposal_introduction',
  'WA'
),
(
  'WA — Closing / Contract',
  'Ready to Move Forward — {{address}}',
  'Hi {{contactName}},

Great news — we are ready to move forward with {{address}}! I have prepared the agreement for your review, attached to this email.

Please take a look and let me know if everything looks correct, or if you''d like any changes before we finalize. Once you''re comfortable with the terms, we can schedule signing and get a start date locked in.

A few next steps on my end:
1. You review and sign the attached agreement
2. We coordinate a walkthrough date
3. First payment is processed per the agreed terms

Thank you again for trusting TRAVLR Vacation Homes with {{address}} — excited to get started and to have you as one of our partner homeowners in Washington.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'closing',
  'WA'
)
ON CONFLICT DO NOTHING;

-- ─── Master Templates (use {{localBlurb}} merge field) ────────────────────────
INSERT INTO public.email_templates (name, subject, body, category, portfolio) VALUES
(
  'Master — Initial Outreach',
  'Interested in Your Property at {{address}}',
  'Hi {{contactName}},

I came across {{address}} and wanted to reach out directly — I''m with TRAVLR Vacation Homes, a boutique luxury vacation rental and property management company. We''ve operated in Palm Springs / Palm Desert, California for over 10 years, and {{localBlurb}}.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I''d love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'initial_outreach',
  'MASTER'
),
(
  'Master — Follow-Up #1',
  'Following Up — {{address}}',
  'Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, TRAVLR Vacation Homes has managed luxury vacation properties for homeowners for over 10 years, and {{localBlurb}}. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn''t the right time, no worries at all — just let me know and I''ll follow up down the line. But if you''re open to it, I''m happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'follow_up_1',
  'MASTER'
),
(
  'Master — Check-In / Re-Engage',
  'Checking In — Still Interested in {{address}}?',
  'Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I''m with TRAVLR Vacation Homes — we bring 10+ years of luxury vacation rental management experience, and {{localBlurb}}. Happy to share references or more on how we operate if that''s helpful.

If your plans have changed or you''ve already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you''re still open to exploring this, I''d love to reconnect.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'check_in',
  'MASTER'
),
(
  'Master — Proposal Introduction',
  'Proposal for {{address}} — Guaranteed Rent',
  'Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I''d like to formally propose the following terms on behalf of TRAVLR Vacation Homes.

A bit more about us: TRAVLR is a boutique luxury vacation rental and property management company with over 10 years of experience, and {{localBlurb}}. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I''ve attached more details for your review, and you''re welcome to look through our track record at staytravlr.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'proposal_introduction',
  'MASTER'
),
(
  'Master — Closing / Contract',
  'Ready to Move Forward — {{address}}',
  'Hi {{contactName}},

Great news — we are ready to move forward with {{address}}! I have prepared the agreement for your review, attached to this email.

Please take a look and let me know if everything looks correct, or if you''d like any changes before we finalize. Once you''re comfortable with the terms, we can schedule signing and get a start date locked in.

A few next steps on my end:
1. You review and sign the attached agreement
2. We coordinate a walkthrough date
3. First payment is processed per the agreed terms

Thank you again for trusting TRAVLR Vacation Homes with {{address}} — excited to get started and to have you as one of our partner homeowners.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com',
  'closing',
  'MASTER'
)
ON CONFLICT DO NOTHING;
