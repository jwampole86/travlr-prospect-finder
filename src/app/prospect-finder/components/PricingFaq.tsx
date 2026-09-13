'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What is VAYO?',
    a: 'VAYO is the AI-powered growth and operations platform for vacation rental operators and property management teams — covering lead discovery, enrichment, pipeline management, outreach, and (on higher plans) AI-assisted interview tools for hiring.',
  },
  {
    q: 'Can I change plans later?',
    a: 'Yes. You can upgrade or downgrade your VAYO plan at any time from your account billing settings. Changes apply to your next billing cycle.',
  },
  {
    q: 'What happens if I reach my plan limit?',
    a: "You'll be notified as you approach your plan's usage allowance (users, portfolios, leads, or enrichments). You can upgrade at any time to raise your limits — existing data and workflows are never interrupted.",
  },
  {
    q: 'Does every plan include AI tools?',
    a: 'AI-assisted workflows are available starting on the Pro plan. Full AI Interview Assistant functionality, automated scheduling, and bulk AI interviews are available on Business and Enterprise.',
  },
  {
    q: 'Which plan includes the complete platform?',
    a: 'Enterprise is the only VAYO plan that includes full access to all platform features, advanced tools, integrations, and custom usage limits.',
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
    q: 'Does VAYO include homeowner data?',
    a: 'VAYO gives you access to available property and contact intelligence based on your enabled data sources and plan allowances. It does not guarantee a verified phone number, owner identity, or other enriched data for every lead.',
  },
  {
    q: 'How does Enterprise pricing work?',
    a: "Enterprise pricing is custom and based on your team size, portfolio volume, and feature requirements. Contact sales and we'll put together a plan that fits your organization.",
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
