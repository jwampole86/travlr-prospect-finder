/**
 * NAVEO Stays Email Template Seeds
 * Market templates use the shared {{localBlurb}} resolver so every active state/city
 * stays current with the lead geography in localBlurbs.ts.
 * Variables: {{senderName}}, {{contactName}}, {{address}}, {{localBlurb}},
 *            {{proposedRent}}, {{leaseTerm}}, {{proposedStartDate}}
 */

import { PORTFOLIO_STATES } from './localBlurbs';

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

I came across {{address}} and wanted to reach out directly — I'm with NAVEO Stays, a luxury vacation rental and property management company. We launched our Colorado subsidiary in early 2025 and are actively growing our portfolio across Aspen, Breckenridge, and Vail, which is what brought {{address}} to my attention.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'CO — Follow-Up #1',
    portfolio: 'CO',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, NAVEO Stays has managed luxury vacation properties for homeowners for over 10 years, and launched our Colorado operation in early 2025, now serving Aspen, Breckenridge, and Vail. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'CO — Check-In / Re-Engage',
    portfolio: 'CO',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with NAVEO Stays — we bring 10+ years of luxury vacation rental management experience and have been building our Colorado presence across Aspen, Breckenridge, and Vail since early 2025. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'CO — Proposal Introduction',
    portfolio: 'CO',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of NAVEO Stays.

A bit more about us: NAVEO Stays is a luxury vacation rental and property management company with over 10 years of experience, now operating in Colorado across Aspen, Breckenridge, and Vail since launching our subsidiary in early 2025. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staynaveo.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
NAVEO Stays | staynaveo.com`,
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

Thank you again for trusting NAVEO Stays with {{address}} — excited to get started and to have you as one of our partner homeowners in Colorado.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
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

I came across {{address}} and wanted to reach out directly — I'm with NAVEO Stays, a luxury vacation rental and property management company based in Palm Springs / Palm Desert, where we've operated for over 10 years, with an active presence across the LA basin and Southern California coast — including Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'CA — Follow-Up #1',
    portfolio: 'CA',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, NAVEO Stays has been managing luxury vacation properties across Southern California for over 10 years, with a presence spanning Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'CA — Check-In / Re-Engage',
    portfolio: 'CA',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with NAVEO Stays — we've been a Southern California presence for over 10 years, managing luxury vacation rentals across Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'CA — Proposal Introduction',
    portfolio: 'CA',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of NAVEO Stays.

A bit more about us: NAVEO Stays is a luxury vacation rental and property management company with over 10 years of experience, proudly serving Southern California — including Los Angeles, Sherman Oaks, Hollywood, Malibu, and Newport Beach. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staynaveo.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
NAVEO Stays | staynaveo.com`,
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

Thank you again for trusting NAVEO Stays with {{address}} — excited to get started and to have you as one of our partner homeowners here in Southern California.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
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

I came across {{address}} and wanted to reach out directly — I'm with NAVEO Stays, a luxury vacation rental and property management company. We're growing our presence in Nevada, focused on Las Vegas and Henderson, which is what brought {{address}} to my attention.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'NV — Follow-Up #1',
    portfolio: 'NV',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, NAVEO Stays has managed luxury vacation properties for homeowners for over 10 years and is actively expanding into Nevada, including Las Vegas and Henderson. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'NV — Check-In / Re-Engage',
    portfolio: 'NV',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with NAVEO Stays — we bring 10+ years of luxury vacation rental management experience and are building our footprint in Las Vegas and Henderson. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'NV — Proposal Introduction',
    portfolio: 'NV',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of NAVEO Stays.

A bit more about us: NAVEO Stays is a luxury vacation rental and property management company with over 10 years of experience, now expanding into Nevada across Las Vegas and Henderson. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staynaveo.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
NAVEO Stays | staynaveo.com`,
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

Thank you again for trusting NAVEO Stays with {{address}} — excited to get started and to have you as one of our partner homeowners in Nevada.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
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

I came across {{address}} and wanted to reach out directly — I'm with NAVEO Stays, a luxury vacation rental and property management company. We're expanding into Washington State, with a focus on Seattle, Bellevue, and Renton, which is what brought {{address}} to my attention.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'WA — Follow-Up #1',
    portfolio: 'WA',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, NAVEO Stays has managed luxury vacation properties for homeowners for over 10 years and is actively expanding into Washington State, including Seattle, Bellevue, and Renton. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'WA — Check-In / Re-Engage',
    portfolio: 'WA',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with NAVEO Stays — we bring 10+ years of luxury vacation rental management experience and are building our presence across Seattle, Bellevue, and Renton. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'WA — Proposal Introduction',
    portfolio: 'WA',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of NAVEO Stays.

A bit more about us: NAVEO Stays is a luxury vacation rental and property management company with over 10 years of experience, now expanding into Washington State across Seattle, Bellevue, and Renton. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staynaveo.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
NAVEO Stays | staynaveo.com`,
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

Thank you again for trusting NAVEO Stays with {{address}} — excited to get started and to have you as one of our partner homeowners in Washington.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
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

I came across {{address}} and wanted to reach out directly — I'm with NAVEO Stays, a luxury vacation rental and property management company. We're expanding into Maryland, with Baltimore among our first target markets, which is what brought {{address}} to my attention.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'MD — Follow-Up #1',
    portfolio: 'MD',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, NAVEO Stays has managed luxury vacation properties for homeowners for over 10 years and is actively expanding into Maryland, with Baltimore among our first target markets. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'MD — Check-In / Re-Engage',
    portfolio: 'MD',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with NAVEO Stays — we bring 10+ years of luxury vacation rental management experience and are expanding into Maryland, with Baltimore among our first target markets. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'MD — Proposal Introduction',
    portfolio: 'MD',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of NAVEO Stays.

A bit more about us: NAVEO Stays is a luxury vacation rental and property management company with over 10 years of experience, now expanding into Maryland with Baltimore among our first target markets. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staynaveo.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
NAVEO Stays | staynaveo.com`,
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

Thank you again for trusting NAVEO Stays with {{address}} — excited to get started and to have you as one of our partner homeowners in Maryland.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
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

I came across {{address}} and wanted to reach out directly — I'm with NAVEO Stays, a luxury vacation rental and property management company. We've operated in Palm Springs / Palm Desert, California for over 10 years, and {{localBlurb}}.

We handle everything end-to-end: guest services, concierge, cleaning, maintenance, and revenue optimization, so homeowners get consistent income without the day-to-day workload of hosting.

Would you be open to a quick 10-minute call this week? I'd love to learn more about the property and walk you through how we work.

Looking forward to hearing from you.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'Master — Follow-Up #1',
    portfolio: 'MASTER',
    tag: 'follow up',
    category: 'follow_up_1',
    subject: 'Following Up — {{address}}',
    body: `Hi {{contactName}},

Just following up on my previous message about {{address}}. I am still very interested and would love the chance to connect, even briefly.

For context, NAVEO Stays has managed luxury vacation properties for homeowners for over 10 years, and {{localBlurb}}. We take care of everything — cleaning, maintenance, guest services, and pricing — so owners see reliable income with none of the operational hassle.

If now isn't the right time, no worries at all — just let me know and I'll follow up down the line. But if you're open to it, I'm happy to work around your schedule for a quick call or even answer questions over email first.

Thanks so much for your time,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'Master — Check-In / Re-Engage',
    portfolio: 'MASTER',
    tag: 'follow up',
    category: 'check_in',
    subject: 'Checking In — Still Interested in {{address}}?',
    body: `Hi {{contactName}},

I wanted to check in on {{address}}. Is the property still available? I remain very interested and wanted to see if the timing might work better now.

As a reminder, I'm with NAVEO Stays — we bring 10+ years of luxury vacation rental management experience, and {{localBlurb}}. Happy to share references or more on how we operate if that's helpful.

If your plans have changed or you've already moved forward with someone else, I completely understand — just a quick reply either way would be appreciated so I can update my notes.

If you're still open to exploring this, I'd love to reconnect.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
  {
    name: 'Master — Proposal Introduction',
    portfolio: 'MASTER',
    tag: 'proposal',
    category: 'proposal_introduction',
    subject: 'Proposal for {{address}} — Guaranteed Rent',
    body: `Hi {{contactName}},

Thank you for speaking with me about {{address}}. As discussed, I'd like to formally propose the following terms on behalf of NAVEO Stays.

A bit more about us: NAVEO Stays is a luxury vacation rental and property management company with over 10 years of experience, and {{localBlurb}}. We manage every part of the guest and property experience — concierge, cleaning, maintenance, and revenue optimization — so homeowners get premium results without lifting a finger.

Proposed terms:
* Guaranteed monthly payment: {{proposedRent}}
* Agreement term: {{leaseTerm}}
* Property management: Full-service — cleaning, maintenance, guest services, and concierge included
* Revenue optimization: Dynamic pricing to maximize seasonal demand
* Start date: {{proposedStartDate}}

This arrangement means consistent, predictable income for you with none of the usual workload of running a short-term rental — no guest communication, no turnover coordination, no maintenance calls at 11pm.

I've attached more details for your review, and you're welcome to look through our track record at staynaveo.com. Happy to hop on a call to walk through any questions or adjust terms to fit your needs.

Looking forward to moving forward together,
{{senderName}}
NAVEO Stays | staynaveo.com`,
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

Thank you again for trusting NAVEO Stays with {{address}} — excited to get started and to have you as one of our partner homeowners.

Best,
{{senderName}}
NAVEO Stays | staynaveo.com`,
  },
];

// ─── NAVEO Homes: homes that are for sale (help them sell; no property management) ───────────────────────────────────
const HOMES_PITCH = "If a sale is on the table, we connect owners with a licensed local broker to guide the sale, and if the home will sit empty while it's listed, NAVEO Stays may be able to run it as a short-term rental in the meantime.";
const HOMES_SIGNOFF = `Best,
{{senderName}}
NAVEO Homes`;
const HOMES_TEMPLATES: TemplateSeed[] = [
  {
    name: 'Homes — Initial Outreach', portfolio: 'MASTER', tag: 'outreach', category: 'initial_outreach',
    subject: 'Selling {{address}}? Here to help',
    body: `Hi {{contactName}},\n\nI'm reaching out about {{address}}.\n\n${HOMES_PITCH}\n\nWorth a short conversation this week?\n\n${HOMES_SIGNOFF}`,
  },
  {
    name: 'Homes — Follow-Up #1', portfolio: 'MASTER', tag: 'follow up', category: 'follow_up_1',
    subject: 'Following up on {{address}}',
    body: `Hi {{contactName}},\n\nJust following up about {{address}}. I'm happy to walk you through how a sale with NAVEO Homes works, and whether a short-term rental in the meantime makes sense.\n\nNo commitment, just reply whenever suits you.\n\n${HOMES_SIGNOFF}`,
  },
  {
    name: 'Homes — Check-In / Re-Engage', portfolio: 'MASTER', tag: 'check in', category: 'check_in',
    subject: 'Still here to help with {{address}}',
    body: `Hi {{contactName}},\n\nChecking in one more time about {{address}}. If the home will sit empty while it's listed, NAVEO Stays may be able to run it as a short-term rental, and I'm glad to talk through the sale too.\n\n${HOMES_SIGNOFF}`,
  },
];

// ─── Co-listing outreach to small vacation-rental managers (extra distribution channel) ─────────────────────────────
// {{address}} is not used here: these go to managers, not individual property owners.
const MANAGER_SIGNOFF = `{{senderName}}
NAVEO Stays | staynaveo.com`;
const MANAGER_BODY_A = `Hi {{contactName}},\n\nI noticed your listings and wanted to reach out.\n\nWe're opening NAVEO Stays as an extra booking channel for professional hosts. You keep Airbnb, Vrbo, and your direct bookings exactly as they are — we simply add your homes.\n\nGuests see all-in pricing with no guest service fee, which can help conversion. There's no cost to list and no requirement to switch anything.\n\nWould you be open to a quick 10-minute call this week to see if it's a fit?\n\nBest,\n${MANAGER_SIGNOFF}`;
const MANAGER_TEMPLATES: TemplateSeed[] = [
  {
    name: 'Managers — Co-List A (Extra bookings)', portfolio: 'MASTER', tag: 'managers', category: 'manager_outreach',
    subject: 'Extra bookings, no guest fee',
    body: MANAGER_BODY_A,
  },
  {
    name: 'Managers — Co-List A (Keep Airbnb & Vrbo)', portfolio: 'MASTER', tag: 'managers', category: 'manager_outreach',
    subject: 'Add your homes — keep Airbnb & Vrbo',
    body: MANAGER_BODY_A,
  },
  {
    name: 'Managers — Co-List B (Benefits)', portfolio: 'MASTER', tag: 'managers', category: 'manager_outreach',
    subject: 'Add your homes — keep Airbnb & Vrbo',
    body: `Hi {{contactName}},\n\nQuick idea for your listings.\n\nNAVEO Stays is a curated site with transparent, all-in pricing and no guest service fee. We're inviting a small number of managers in your market to co-list their existing homes.\n\nWhat you get:\n* Extra distribution without leaving your current channels\n* Guests who see the full price up front\n* Featured placement while we open the market\n* No long-term commitment to start\n\nIf you're open to it, I can send a one-page overview or jump on a short call. What does your week look like?\n\nThanks,\n${MANAGER_SIGNOFF}`,
  },
  {
    name: 'Managers — Co-List D (Full Terms)', portfolio: 'MASTER', tag: 'managers', category: 'manager_outreach',
    subject: 'Extra bookings, no guest fee',
    body: `Hi {{contactName}},\n\nI came across your listings and wanted to reach out.\n\nWe're opening NAVEO Stays as an additional booking channel for professional managers in your market. You keep Airbnb, Vrbo, and your direct bookings exactly as they are — we simply add your homes so guests can also find them with all-in pricing and no guest service fee.\n\nFor the first managers who list 5 or more homes:\n* $0 to add your existing listings\n* 0% channel fee for the first 60 days\n* Featured placement while we open the market\n* Month-to-month — remove listings anytime\n* No exclusivity\n\nWe can start with your iCal link so calendars stay in sync, no matter which channel manager you already use.\n\nWould you be open to a quick 10-minute call this week, or should I send a one-page overview?\n\nBest,\n${MANAGER_SIGNOFF}`,
  },
  {
    name: 'Managers — Co-List C (Short Follow-Up)', portfolio: 'MASTER', tag: 'managers', category: 'manager_follow_up',
    subject: 'Quick question about your listings',
    body: `Hi {{contactName}},\n\nWould you be interested in adding your homes to NAVEO Stays as an extra channel?\n\nYou keep Airbnb and Vrbo. We just co-list. No guest fee on our side, no cost to start.\n\nWorth a 10-minute look?\n\n${MANAGER_SIGNOFF}`,
  },
];

// ─── Manager co-listing: terms and counteroffer replies ──────────────────────────────────────────────────────────────
const MANAGER_TERMS = `* $0 to list your existing homes
* You keep Airbnb, Vrbo, and your direct bookings unchanged
* $0 guest service fee on NAVEO (guests see all-in pricing)
* 0% channel fee for the first 60 days so you can test demand at no cost
* After that, 10% of booking revenue only on stays that originate on NAVEO
* Month-to-month — you can remove listings anytime
* No exclusivity`;
const managerReply = (name: string, intro: string, offer: string): TemplateSeed => ({
  name: `Managers — Counter: ${name}`, portfolio: 'MASTER', tag: 'managers', category: 'manager_negotiation',
  subject: 'Re: NAVEO co-listing terms',
  body: `Hi {{contactName}},\n\n${intro}\n\n${offer}\n\nWould that work? I'll send the short agreement as soon as we're aligned.\n\nBest,\n${MANAGER_SIGNOFF}`,
});
const MANAGER_NEGOTIATION_TEMPLATES: TemplateSeed[] = [
  {
    name: 'Managers — Terms Proposal', portfolio: 'MASTER', tag: 'managers', category: 'manager_negotiation',
    subject: 'NAVEO co-listing terms — simple and flexible',
    body: `Hi {{contactName}},\n\nThanks for your interest in adding your homes to NAVEO Stays.\n\nHere's the straightforward structure we use with professional managers:\n\n${MANAGER_TERMS}\n\nIf you bring 10 or more homes we can discuss a lower ongoing rate.\n\nWould these terms work for you? Happy to adjust slightly or jump on a quick call to finalize.\n\nBest,\n${MANAGER_SIGNOFF}`,
  },
  {
    name: 'Managers — Terms Confirmation', portfolio: 'MASTER', tag: 'managers', category: 'manager_negotiation',
    subject: 'Re: NAVEO terms',
    body: `Hi {{contactName}},\n\nConfirming the co-listing terms:\n\n* Free to add your homes\n* 0% for the first 60 days\n* 10% thereafter only on NAVEO-sourced bookings\n* Cancel anytime, no exclusivity\n\nLet me know if this works and I'll send the short agreement and next steps. To get your listings live, send your Airbnb links (or a spreadsheet) and an iCal link for each home so calendars stay in sync and dates block when booked elsewhere.\n\nThanks,\n${MANAGER_SIGNOFF}`,
  },
  managerReply('Rate Too High', 'Thanks for the feedback on the rate.', "Two ways we can make this work: 10% with the full 60-day free period, or 8% ongoing if you commit 10 or more homes."),
  managerReply('Free Forever', "I can't do 0% permanently, but I can make this easy to test.", "How about 0% for the first 90 days, then 8%? It's month-to-month with no exclusivity, so you can pause or remove listings anytime."),
  managerReply('Match Airbnb Fees', 'Fair question on fees.', "Airbnb charges the guest. We charge guests nothing and charge you only a small channel fee on bookings we generate. I'm holding at 8–10% on NAVEO-sourced bookings, and your Airbnb and Vrbo revenue stays entirely yours."),
  managerReply('Exclusivity', "To be clear, we don't require exclusivity from you, and we won't ask for it either.", "An open marketplace works better for both of us. What I can offer instead is featured placement for 90 days."),
  managerReply('Longer Free Period', 'Happy to extend the free period.', "I can do 90 days at 0% if you add at least 8 homes in the first two weeks."),
  managerReply('Lower Rate, More Work', 'Happy to trade rate for service level.', "If we handle the full upload and updates, we stay at 10%. If you'd like 8%, we'd need you to keep rates and availability current."),
  managerReply('Fee After First Revenue', 'I can work with that.', "We'll waive the fee until you've received your first $2,000 in NAVEO bookings, then 10% after that."),
];

// ─── Manager partner sequences (cadence: Day 0 → 4 → 9 → 16, then soft re-engagement and post-reply paths) ───────────
const PARTNER_SIGNOFF = `{{senderName}}
NAVEO Stays
partners@staynaveo.com
staynaveo.com`;
const PARTNER_TERMS = `* 0% channel fee for the first 60 days
* 10% only on bookings that come through NAVEO after that
* iCal calendar sync so it doesn't conflict with your existing channels
* No exclusivity — you keep Airbnb, Vrbo, and your direct site`;
const partnerEmail = (name: string, category: string, subject: string, paragraphs: string[], signoff = '{{senderName}}'): TemplateSeed => ({
  name: `Partners — ${name}`, portfolio: 'MASTER', tag: 'managers', category, subject,
  body: `Hi {{contactName}},\n\n${paragraphs.join('\n\n')}\n\nBest,\n${signoff}`,
});
const PARTNER_TEMPLATES: TemplateSeed[] = [
  partnerEmail('A1 Initial Outreach (Day 0)', 'manager_outreach', 'Extra channel with $0 guest fee', [
    "I came across your company while looking at professional managers in your market. You already multi-list, so I wanted to share a simple way to add another channel without changing anything you currently do.",
    `NAVEO Stays is a booking site focused on clearer pricing for guests. We charge guests $0 service fee. For partners we currently offer:\n\n${PARTNER_TERMS}`,
    "Would it make sense to add a few of your homes as a low-risk test?\n\nHappy to send a short overview or jump on a quick call.",
  ], PARTNER_SIGNOFF),
  partnerEmail('A2 Follow-Up (Day 4)', 'manager_follow_up', 'Re: Extra channel with $0 guest fee', [
    "Just following up on the note below.",
    "Most managers we talk to like the model because it adds incremental demand without touching their current channels or guest fees. The 60-day 0% window lets you see real bookings before any fee starts.",
    "Would you be open to a 15-minute call this week to see if it's a fit?",
  ]),
  partnerEmail('A3 Quick Question (Day 9)', 'manager_follow_up', 'Quick question on distribution', [
    "Curious if you're currently looking at any additional distribution channels beyond Airbnb and Vrbo.",
    "A few managers have started testing NAVEO because guests see the full price up front and we don't add a service fee.",
    "If it's not a priority right now, no worries — just let me know and I'll close the loop.",
  ]),
  partnerEmail('A4 Closing the Loop (Day 16)', 'manager_follow_up', 'Closing the loop', [
    "I'll assume the timing isn't right and won't keep following up.",
    "If you ever want to test an extra channel with $0 guest fee and 60 days at 0%, just reply to this email.",
    "Thanks for your time.",
  ], PARTNER_SIGNOFF.split('\n').slice(0, 2).join('\n')),
  partnerEmail('Franchise Local Office', 'manager_outreach', 'Extra channel for your local portfolio', [
    `I work with local vacation-rental managers who already list on Airbnb and Vrbo. We're offering a simple co-listing option on NAVEO Stays:\n\n* $0 guest service fee\n* 0% for the first 60 days, then 10% only on NAVEO bookings\n* iCal sync (no disruption to your current system)\n* No exclusivity`,
    "Since you already manage properties in your area, this could be a low-effort way to pick up additional bookings.",
    "Open to a quick call, or should I send a short one-pager?",
  ], PARTNER_SIGNOFF),
  partnerEmail('B1 Soft Re-engagement', 'manager_follow_up', 'Still open if the timing is better', [
    "I reached out a few weeks ago about adding NAVEO as an extra channel ($0 guest fee, 60 days at 0%).",
    "I know inboxes get busy, so I'm just checking whether this is something worth revisiting now or later in the year.\n\nNo pressure either way.",
  ], PARTNER_SIGNOFF.split('\n').slice(0, 2).join('\n')),
  partnerEmail('B2 Quick Yes/No (Day 7)', 'manager_follow_up', 'Quick yes/no', [
    "Would it be helpful if I sent a one-page overview of how the co-listing works, or should I close this out for now?",
  ]),
  partnerEmail('C1 Positive Reply', 'manager_negotiation', 'Re: Extra channel with $0 guest fee', [
    "Thanks for the reply.",
    `Here's the short version:\n\n* You keep all existing channels (Airbnb, Vrbo, direct, etc.)\n* NAVEO charges guests $0 service fee\n* 0% channel fee for the first 60 days, then 10% only on bookings that come through NAVEO\n* iCal sync so calendars stay in sync\n* No exclusivity or long-term commitment`,
    "Would a 15-minute call work this week? Reply with a couple of times, or I can send the short partner overview and sample agreement if you prefer to review first.",
  ], PARTNER_SIGNOFF),
  partnerEmail('C2 Positive Reply Nudge (Day 3)', 'manager_negotiation', 'Re: Extra channel with $0 guest fee', [
    "Just making sure the last note didn't get buried.",
    "Happy to send the one-pager and sample agreement, or we can do a short call — whichever is easier.",
  ]),
  partnerEmail('D1 Call Confirmed', 'manager_meeting', 'Confirmed — NAVEO call', [
    "Looking forward to speaking. I'll keep it short. Main points we'll cover:",
    "* How the co-listing works with your existing channels\n* The 60-day 0% window and 10% after\n* iCal sync and calendar setup\n* What a test with a few homes looks like",
    "If you have any specific questions ahead of time, feel free to reply here.",
  ], PARTNER_SIGNOFF.split('\n').slice(0, 2).join('\n')),
  partnerEmail('D2 Call Reminder', 'manager_meeting', "Tomorrow's call — NAVEO", [
    "Quick reminder about our call tomorrow. See you then.",
  ]),
  partnerEmail('E1 Next Steps After Call', 'manager_next_steps', 'Next steps — NAVEO co-listing', [
    "Good speaking with you earlier.",
    "As discussed, next steps:\n\n1. I'll send the short partner agreement and onboarding checklist\n2. You choose 5–10 homes to test\n3. We set up iCal sync and list them on NAVEO\n4. The 60-day 0% period starts once the homes are live",
    "I'll send the documents shortly. Let me know if you have any questions in the meantime.",
  ], PARTNER_SIGNOFF.split('\n').slice(0, 2).join('\n')),
  partnerEmail('E2 Agreement + Onboarding (Day 2)', 'manager_next_steps', 'NAVEO partner agreement + onboarding checklist', [
    "Attached:\n\n* Partner co-listing agreement\n* Onboarding checklist\n* Simple iCal setup notes",
    "Once you're comfortable with the agreement, we can start adding the first homes.",
  ]),
  partnerEmail('F1 Call Summary (Needs Time)', 'manager_next_steps', 'Summary from our call', [
    "Thanks for taking the time today.",
    "Quick recap of what we discussed:\n* Extra channel only — you keep everything else\n* $0 guest fee\n* 0% for 60 days, then 10% on NAVEO bookings\n* iCal sync, no exclusivity",
    "I'll check back in a couple of weeks. In the meantime, feel free to reply if any questions come up.",
  ]),
  partnerEmail('F2 Check Back (Day 14)', 'manager_next_steps', 'Checking back on NAVEO', [
    "Just following up on our conversation a couple of weeks ago.",
    "Any updates on whether you'd like to test a few homes on NAVEO?\n\nHappy to answer any remaining questions.",
  ]),
];

export const LEGACY_DEFAULT_TEMPLATE_NAMES = ['CO', 'CA', 'NV', 'WA', 'MD'].flatMap((prefix) => [
  `${prefix} — Initial Outreach`,
  `${prefix} — Follow-Up #1`,
  `${prefix} — Check-In / Re-Engage`,
  `${prefix} — Proposal Introduction`,
  `${prefix} — Closing / Contract`,
]);

export const ALL_TEMPLATE_SEEDS: TemplateSeed[] = [
  ...PORTFOLIO_STATES.flatMap(({ value, label }) => buildMarketTemplates(value, label)),
  ...MASTER_TEMPLATES,
  ...HOMES_TEMPLATES,
  ...MANAGER_TEMPLATES,
  ...MANAGER_NEGOTIATION_TEMPLATES,
  ...PARTNER_TEMPLATES,
];

function buildMarketTemplates(portfolio: string, label: string): TemplateSeed[] {
  return MASTER_TEMPLATES.map((template) => ({
    ...template,
    name: template.name.replace('Master', label),
    portfolio,
  }));
}

/** Convert a plain-text template body to a single-block JSON array for the editor */
export function seedBodyToBlocks(body: string): string {
  return JSON.stringify([{ id: 'seed-1', type: 'text', content: body }]);
}
