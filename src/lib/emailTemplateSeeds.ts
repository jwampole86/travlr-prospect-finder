/**
 * TRAVLR Email Template Seeds
 * Portfolio-specific versions (CO, CA, NV, WA) + Master templates
 * Variables: {{senderName}}, {{contactName}}, {{address}}, {{localBlurb}},
 *            {{proposedRent}}, {{leaseTerm}}, {{proposedStartDate}}
 */

export interface TemplateSeed {
  name: string;
  subject: string;
  body: string; // plain text with {{variables}}
  category: string;
  portfolio: string; // 'CO' | 'CA' | 'NV' | 'WA' | 'MASTER'
  tag: string;
}

// ─── Colorado ────────────────────────────────────────────────────────────────
const CO_TEMPLATES: TemplateSeed[] = [
  {
    name: 'CO — Initial Outreach',
    portfolio: 'CO',
    tag: 'outreach',
    category: 'initial_outreach',
    subject: 'Interested in Your Property at {{address}}',
    body: `Hi {{contactName}},

I came across {{address}} and wanted to reach out directly — I'm with TRAVLR Vacation Homes, a boutique luxury vacation rental and property management company. We launched our Colorado subsidiary in early 2025 and are actively growing our portfolio across Aspen, Breckenridge, and Vail, which is what brought {{address}} to my attention.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'CO — Follow-Up #1',
    portfolio: 'CO',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, TRAVLR Vacation Homes has managed luxury vacation properties for homeowners for over 10 years, and launched our Colorado operation in early 2025, now serving Aspen, Breckenridge, and Vail. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'CO — Check-In / Re-Engage',
    portfolio: 'CO',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with TRAVLR Vacation Homes — we bring 10+ years of luxury vacation rental management experience and have been building our Colorado presence across Aspen, Breckenridge, and Vail since early 2025. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'CO — Proposal Introduction',
    portfolio: 'CO',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of TRAVLR Vacation Homes.

A bit more about us: TRAVLR is a boutique luxury vacation rental and property management company with over 10 years of experience, now operating in Colorado across Aspen, Breckenridge, and Vail since launching our subsidiary in early 2025. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staytravlr.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'CO — Closing / Contract',
    portfolio: 'CO',
    tag: 'closing',
    category: 'closing',
    subject: 'Ready to Move Forward — {{address}}',
    body: `Hi {{contactName}},

Great news — we are ready to move forward with {{address}}! I have prepared the agreement for your review, attached to this email.

Please take a look and let me know if everything looks correct, or if you'd like any changes before we finalize. Once you're comfortable with the terms, we can schedule signing and get a start date locked in.

A few next steps on my end:
1. You review and sign the attached agreement
2. We coordinate a walkthrough date
3. First payment is processed per the agreed terms

Thank you again for trusting TRAVLR Vacation Homes with {{address}} — excited to get started and to have you as one of our partner homeowners in Colorado.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
];

// ─── California ──────────────────────────────────────────────────────────────
const CA_TEMPLATES: TemplateSeed[] = [
  {
    name: 'CA — Initial Outreach',
    portfolio: 'CA',
    tag: 'outreach',
    category: 'initial_outreach',
    subject: 'Interested in Your Property at {{address}}',
    body: `Hi {{contactName}},

I came across {{address}} and wanted to reach out directly — I'm with TRAVLR Vacation Homes, a boutique luxury vacation rental and property management company based in Palm Springs / Palm Desert, where we've operated for over 10 years, with an active presence across the LA basin and Southern California coast — including Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'CA — Follow-Up #1',
    portfolio: 'CA',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, TRAVLR Vacation Homes has been managing luxury vacation properties across Southern California for over 10 years, with a presence spanning Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'CA — Check-In / Re-Engage',
    portfolio: 'CA',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with TRAVLR Vacation Homes — we've been a Southern California presence for over 10 years, managing luxury vacation rentals across Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'CA — Proposal Introduction',
    portfolio: 'CA',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of TRAVLR Vacation Homes.

A bit more about us: TRAVLR is a boutique luxury vacation rental and property management company with over 10 years of experience, proudly serving Southern California — including Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staytravlr.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'CA — Closing / Contract',
    portfolio: 'CA',
    tag: 'closing',
    category: 'closing',
    subject: 'Ready to Move Forward — {{address}}',
    body: `Hi {{contactName}},

Great news — we are ready to move forward with {{address}}! I have prepared the agreement for your review, attached to this email.

Please take a look and let me know if everything looks correct, or if you'd like any changes before we finalize. Once you're comfortable with the terms, we can schedule signing and get a start date locked in.

A few next steps on my end:
1. You review and sign the attached agreement
2. We coordinate a walkthrough date
3. First payment is processed per the agreed terms

Thank you again for trusting TRAVLR Vacation Homes with {{address}} — excited to get started and to have you as one of our partner homeowners here in Southern California.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
];

// ─── Nevada ───────────────────────────────────────────────────────────────────
const NV_TEMPLATES: TemplateSeed[] = [
  {
    name: 'NV — Initial Outreach',
    portfolio: 'NV',
    tag: 'outreach',
    category: 'initial_outreach',
    subject: 'Interested in Your Property at {{address}}',
    body: `Hi {{contactName}},

I came across {{address}} and wanted to reach out directly — I'm with TRAVLR Vacation Homes, a boutique luxury vacation rental and property management company. We're growing our presence in Nevada, focused on Las Vegas and Henderson, which is what brought {{address}} to my attention.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'NV — Follow-Up #1',
    portfolio: 'NV',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, TRAVLR Vacation Homes has managed luxury vacation properties for homeowners for over 10 years and is actively expanding into Nevada, including Las Vegas and Henderson. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'NV — Check-In / Re-Engage',
    portfolio: 'NV',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with TRAVLR Vacation Homes — we bring 10+ years of luxury vacation rental management experience and are building our footprint in Las Vegas and Henderson. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'NV — Proposal Introduction',
    portfolio: 'NV',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of TRAVLR Vacation Homes.

A bit more about us: TRAVLR is a boutique luxury vacation rental and property management company with over 10 years of experience, now expanding into Nevada across Las Vegas and Henderson. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staytravlr.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'NV — Closing / Contract',
    portfolio: 'NV',
    tag: 'closing',
    category: 'closing',
    subject: 'Ready to Move Forward — {{address}}',
    body: `Hi {{contactName}},

Great news — we are ready to move forward with {{address}}! I have prepared the agreement for your review, attached to this email.

Please take a look and let me know if everything looks correct, or if you'd like any changes before we finalize. Once you're comfortable with the terms, we can schedule signing and get a start date locked in.

A few next steps on my end:
1. You review and sign the attached agreement
2. We coordinate a walkthrough date
3. First payment is processed per the agreed terms

Thank you again for trusting TRAVLR Vacation Homes with {{address}} — excited to get started and to have you as one of our partner homeowners in Nevada.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
];

// ─── Washington ───────────────────────────────────────────────────────────────
const WA_TEMPLATES: TemplateSeed[] = [
  {
    name: 'WA — Initial Outreach',
    portfolio: 'WA',
    tag: 'outreach',
    category: 'initial_outreach',
    subject: 'Interested in Your Property at {{address}}',
    body: `Hi {{contactName}},

I came across {{address}} and wanted to reach out directly — I'm with TRAVLR Vacation Homes, a boutique luxury vacation rental and property management company. We're expanding into Washington State, with a focus on Seattle, Bellevue, and Renton, which is what brought {{address}} to my attention.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'WA — Follow-Up #1',
    portfolio: 'WA',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, TRAVLR Vacation Homes has managed luxury vacation properties for homeowners for over 10 years and is actively expanding into Washington State, including Seattle, Bellevue, and Renton. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'WA — Check-In / Re-Engage',
    portfolio: 'WA',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with TRAVLR Vacation Homes — we bring 10+ years of luxury vacation rental management experience and are building our presence across Seattle, Bellevue, and Renton. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'WA — Proposal Introduction',
    portfolio: 'WA',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of TRAVLR Vacation Homes.

A bit more about us: TRAVLR is a boutique luxury vacation rental and property management company with over 10 years of experience, now expanding into Washington State across Seattle, Bellevue, and Renton. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staytravlr.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'WA — Closing / Contract',
    portfolio: 'WA',
    tag: 'closing',
    category: 'closing',
    subject: 'Ready to Move Forward — {{address}}',
    body: `Hi {{contactName}},

Great news — we are ready to move forward with {{address}}! I have prepared the agreement for your review, attached to this email.

Please take a look and let me know if everything looks correct, or if you'd like any changes before we finalize. Once you're comfortable with the terms, we can schedule signing and get a start date locked in.

A few next steps on my end:
1. You review and sign the attached agreement
2. We coordinate a walkthrough date
3. First payment is processed per the agreed terms

Thank you again for trusting TRAVLR Vacation Homes with {{address}} — excited to get started and to have you as one of our partner homeowners in Washington.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
];

// ─── Maryland ─────────────────────────────────────────────────────────────────
const MD_TEMPLATES: TemplateSeed[] = [
  {
    name: 'MD — Initial Outreach',
    portfolio: 'MD',
    tag: 'outreach',
    category: 'initial_outreach',
    subject: 'Interested in Your Property at {{address}}',
    body: `Hi {{contactName}},

I came across {{address}} and wanted to reach out directly — I'm with TRAVLR Vacation Homes, a boutique luxury vacation rental and property management company. We're expanding into Maryland, with Baltimore among our first target markets, which is what brought {{address}} to my attention.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'MD — Follow-Up #1',
    portfolio: 'MD',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, TRAVLR Vacation Homes has managed luxury vacation properties for homeowners for over 10 years and is actively expanding into Maryland, with Baltimore among our first target markets. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'MD — Check-In / Re-Engage',
    portfolio: 'MD',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with TRAVLR Vacation Homes — we bring 10+ years of luxury vacation rental management experience and are expanding into Maryland, with Baltimore among our first target markets. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'MD — Proposal Introduction',
    portfolio: 'MD',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of TRAVLR Vacation Homes.

A bit more about us: TRAVLR is a boutique luxury vacation rental and property management company with over 10 years of experience, now expanding into Maryland with Baltimore among our first target markets. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staytravlr.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'MD — Closing / Contract',
    portfolio: 'MD',
    tag: 'closing',
    category: 'closing',
    subject: 'Ready to Move Forward — {{address}}',
    body: `Hi {{contactName}},

Great news — we are ready to move forward with {{address}}! I have prepared the agreement for your review, attached to this email.

Please take a look and let me know if everything looks correct, or if you'd like any changes before we finalize. Once you're comfortable with the terms, we can schedule signing and get a start date locked in.

A few next steps on my end:
1. You review and sign the attached agreement
2. We coordinate a walkthrough date
3. First payment is processed per the agreed terms

Thank you again for trusting TRAVLR Vacation Homes with {{address}} — excited to get started and to have you as one of our partner homeowners in Maryland.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
];

// ─── Master Templates (use {{localBlurb}} merge field) ────────────────────────
const MASTER_TEMPLATES: TemplateSeed[] = [
  {
    name: 'Master — Initial Outreach',
    portfolio: 'MASTER',
    tag: 'outreach',
    category: 'initial_outreach',
    subject: 'Interested in Your Property at {{address}}',
    body: `Hi {{contactName}},

I came across {{address}} and wanted to reach out directly — I'm with TRAVLR Vacation Homes, a boutique luxury vacation rental and property management company. We've operated in Palm Springs / Palm Desert, California for over 10 years, and {{localBlurb}}.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'Master — Follow-Up #1',
    portfolio: 'MASTER',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, TRAVLR Vacation Homes has managed luxury vacation properties for homeowners for over 10 years, and {{localBlurb}}. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'Master — Check-In / Re-Engage',
    portfolio: 'MASTER',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with TRAVLR Vacation Homes — we bring 10+ years of luxury vacation rental management experience, and {{localBlurb}}. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'Master — Proposal Introduction',
    portfolio: 'MASTER',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of TRAVLR Vacation Homes.

A bit more about us: TRAVLR is a boutique luxury vacation rental and property management company with over 10 years of experience, and {{localBlurb}}. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staytravlr.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
  {
    name: 'Master — Closing / Contract',
    portfolio: 'MASTER',
    tag: 'closing',
    category: 'closing',
    subject: 'Ready to Move Forward — {{address}}',
    body: `Hi {{contactName}},

Great news — we are ready to move forward with {{address}}! I have prepared the agreement for your review, attached to this email.

Please take a look and let me know if everything looks correct, or if you'd like any changes before we finalize. Once you're comfortable with the terms, we can schedule signing and get a start date locked in.

A few next steps on my end:
1. You review and sign the attached agreement
2. We coordinate a walkthrough date
3. First payment is processed per the agreed terms

Thank you again for trusting TRAVLR Vacation Homes with {{address}} — excited to get started and to have you as one of our partner homeowners.

Best,
{{senderName}}
TRAVLR Vacation Homes | staytravlr.com`,
  },
];

export const ALL_TEMPLATE_SEEDS: TemplateSeed[] = [
  ...CO_TEMPLATES,
  ...CA_TEMPLATES,
  ...NV_TEMPLATES,
  ...WA_TEMPLATES,
  ...MD_TEMPLATES,
  ...MASTER_TEMPLATES,
];

/** Convert a plain-text template body to a single-block JSON array for the editor */
export function seedBodyToBlocks(body: string): string {
  return JSON.stringify([{ id: 'seed-1', type: 'text', content: body }]);
}
