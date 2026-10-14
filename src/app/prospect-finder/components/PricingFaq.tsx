'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What is AVYRO AI?',
    a: 'AVYRO AI is the AI-powered growth and operations platform for vacation rental operators and property management teams — covering lead discovery, enrichment, a live pipeline board and map, text campaigns, the Co-Host program, team tools, and (on higher plans) AI-assisted interview tools for hiring.',
  },
  {
    q: 'Can I change plans later?',
    a: 'Yes. You can upgrade or downgrade your AVYRO AI plan at any time from your account billing settings. Changes apply to your next billing cycle.',
  },
  {
    q: 'What counts as a lead?',
    a: 'A lead is a researched homeowner opportunity: a property with an identified owner and the data needed to act on it, such as a working phone number and a confirmed address. Leads you have already received stay in your account and do not count against future months.',
  },
  {
    q: 'Why are the monthly lead allowances limited?',
    a: 'Because good leads are hard to find. Matching a listing to its real owner, getting a live mobile number, and verifying the address takes real data work, and only a small share of properties qualify, especially luxury homes and Co-Host-ready listings. We size each plan to what we can supply at quality, and we fill your allowance with the highest-scoring leads in your markets.',
  },
  {
    q: 'What happens if I reach my plan limit?',
    a: "You'll be notified as you approach your plan's monthly allowance (users, portfolios, leads, or enrichments). Allowances refresh each month. If you need more before then, extra leads and texts are available at the per-unit rates shown on each plan (extra leads cost less on higher plans), or you can upgrade at any time to raise them. Existing data and workflows are never interrupted.",
  },
  {
    q: 'How do text campaigns work?',
    a: 'Texts go out only to leads with a verified mobile number, only between 9am and 8pm in the owner\'s local time, and never twice to the same owner. Listings are checked first so we only contact active hosts, and every opt-out is honored immediately. Pro includes text campaigns at limited volume; Business includes full volume with delivery and reply insights.',
  },
  {
    q: 'What is the Co-Host program?',
    a: 'Co-Host is a separate pipeline for Airbnb and Vrbo listings that we match to the real owner using public license records. Matches are verified, and you can review listings, send audit offers, and follow up by email or text. Pro can browse the pipeline; the full program with owner matching and outreach is on Business and Enterprise. Because only a very small share of listings can be matched to a verified owner, Co-Host volume is limited each month.',
  },
  {
    q: 'Does every plan include AI tools?',
    a: 'AI-assisted workflows are available starting on the Pro plan. Full AI Interview Assistant functionality, automated scheduling, and bulk AI interviews are available on Business and Enterprise.',
  },
  {
    q: 'Which plans include luxury leads?',
    a: 'Luxury lead access is included on the Business and Enterprise plans, with up to 40 luxury leads a month on Business. It identifies luxury properties relative to each local market, so a high-end home in a lower-cost state is not overlooked, and adds luxury views and dashboard metrics. Starter and Pro do not include it.',
  },
  {
    q: 'Which plan includes the complete platform?',
    a: 'Enterprise is the only AVYRO AI plan that includes full access to all platform features, advanced tools, integrations, and custom usage limits.',
  },
  {
    q: 'Can I add more users?',
    a: 'Yes. Starter, Pro, and Business each include a set number of users. If you need more seats than your plan allows, you can upgrade to the next tier or contact sales about Enterprise for custom user limits.',
  },
  {
    q: 'Does Enterprise include custom integrations?',
    a: 'Yes. Enterprise includes custom integrations, API access, and custom data workflows tailored to your organization.',
  },
  {
    q: 'Is there an API?',
    a: 'API Access is included on the Business and Enterprise plans. Enterprise also includes custom integration support.',
  },
  {
    q: 'Does AVYRO AI include homeowner data?',
    a: 'AVYRO AI gives you access to available property and contact intelligence based on your enabled data sources and plan allowances. It does not guarantee a verified phone number, owner identity, or other enriched data for every lead.',
  },
  {
    q: 'How does Enterprise pricing work?',
    a: "Enterprise pricing is custom and based on your team size, markets, lead and Co-Host volume, and feature requirements. Contact sales and we'll put together a plan that fits your organization.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-sm sm:text-base font-semibold text-foreground">{q}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="text-sm text-muted-foreground leading-relaxed pb-5 pr-8">{a}</p>}
    </div>
  );
}

export default function PricingFaq() {
  return (
    <div className="max-w-3xl mx-auto">
      {FAQS.map((item) => (
        <FaqItem key={item.q} q={item.q} a={item.a} />
      ))}
    </div>
  );
}
