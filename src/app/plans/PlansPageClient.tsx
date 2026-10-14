'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Minus, ChevronDown, ChevronRight, ArrowRight, Search, Database, TrendingUp, Users, Zap, Brain, BarChart2, Link2, Send, Home, Bot } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import MarketingHeader from '@/app/prospect-finder/components/MarketingHeader';
import MarketingFooter from '@/app/prospect-finder/components/MarketingFooter';
import PricingFaq from '@/app/prospect-finder/components/PricingFaq';
import PlanPreviewShowcase from '@/app/plans/components/PlanPreviewShowcase';
import PlanPreviewModal from '@/app/plans/components/PlanPreviewModal';
import StickyPlanCta from '@/components/marketing/StickyPlanCta';
import {
  PLAN_ORDER,
  PROSPECT_FINDER_PLANS,
  FEATURE_CATEGORIES,
  LEAD_SUPPLY_FACTS,
  BREAK_EVEN_ASSUMPTIONS,
  conservativeAnnualFeePerProperty,
  monthsCoveredByOneProperty,
  getDisplayMonthlyPrice,
  formatUsd,
  getAnnualSavingsPercent,
  type PlanId,
  type FeatureAvailability,
  type BillingPeriod,
} from '@/lib/pricing/prospectFinderPlans';

const CAPABILITIES = [
  { icon: Search, title: 'Find Opportunities', body: 'Discover homeowner prospects across your markets and see them on a map, in a pipeline board and in a fast, filterable list.' },
  { icon: Database, title: 'Enrich Property & Owner Intelligence', body: 'Owner, phone and address checks, revenue estimates and STR regulations on every profile, from your enabled data sources.' },
  { icon: TrendingUp, title: 'Prioritize High-Value Leads', body: 'Scores, luxury tiers and quick views surface who to contact first, and who is ready to text right now.' },
  { icon: Send, title: 'Reach Owners the Right Way', body: 'Text campaigns that check the carrier and the listing first, respect quiet hours and honor every opt-out.' },
  { icon: Home, title: 'Partner With Hosts', body: 'The Co-Host program matches Airbnb and Vrbo listings to owners using license records, with verification and audit offers.' },
  { icon: Zap, title: 'Automate & Stay Informed', body: 'Personal alerts, working hours, follow-up templates and workflows keep your team moving without busywork.' },
  { icon: Brain, title: 'Build Your Team', body: 'AI-assisted and live interview workflows, plus Team Chat to keep everyone on the same page.' },
  { icon: BarChart2, title: 'See the Whole Operation', body: 'An Executive Overview where every panel drills into the people behind the numbers, and a live System Status page.' },
];

const PRICING_REASSURANCE = [
  'Monthly lead allowances are sized to what AVYRO AI can actually supply, not inflated stored-lead counts',
  'Limits are shown upfront across users, portfolios, monthly leads, enrichments, and AI interviews',
  'Business unlocks the operating layer; Enterprise unlocks the complete platform',
];

const COMPLETENESS_SIGNALS = [
  'Text campaigns: limited volume on Pro, full volume with delivery and reply insights on Business',
  'Co-Host program: browse listings on Pro, full owner matching, verification and outreach on Business',
  'Luxury leads: market-aware luxury tiers, views, and KPIs on Business and Enterprise',
  'Executive Overview and advanced analytics start on Business; Enterprise adds multi-market rollups',
];

const ENTERPRISE_PANEL_FEATURES = [
  { title: 'Allowances built around your markets', body: 'Lead, luxury, enrichment, and Co-Host volumes scoped to the supply that actually exists where you operate' },
  { title: 'Multi-market command center', body: 'Executive rollups, custom roles, audit logs, and SSO across every portfolio and team' },
  { title: 'Full AI suite & automation', body: 'Automated bulk AI interviews, advanced workflows, and priority model access' },
  { title: 'Dedicated support', body: 'Priority onboarding, guided setup, custom integrations, and a direct success path' },
];

type JourneyStatus = 'live' | 'building' | 'exploring';

const JOURNEY_STATUS: Record<JourneyStatus, { label: string; className: string }> = {
  live: { label: 'Available now', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  building: { label: 'Planned', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  exploring: { label: 'Exploring', className: 'bg-muted text-muted-foreground' },
};

const JOURNEY_STAGES: Array<{
  icon: typeof Search;
  stage: string;
  headline: string;
  items: Array<{ text: string; status: JourneyStatus }>;
}> = [
  {
    icon: Search,
    stage: 'Acquire properties',
    headline: 'Find the homeowner before anyone else does.',
    items: [
      { text: 'Scored homeowner leads with verified owners and phones', status: 'live' },
      { text: 'Co-Host owner matching from Airbnb and Vrbo listings', status: 'live' },
      { text: 'Text campaigns with quiet hours and opt-out handling', status: 'live' },
    ],
  },
  {
    icon: TrendingUp,
    stage: 'Grow your portfolio',
    headline: 'Turn conversations into signed management agreements.',
    items: [
      { text: 'Live pipeline board and map from first text to contract', status: 'live' },
      { text: 'AI-assisted calling, follow-up and routing', status: 'live' },
      { text: 'Owner onboarding checklists and e-signed management agreements', status: 'live' },
    ],
  },
  {
    icon: Zap,
    stage: 'Automate operations',
    headline: 'Run the properties you win without adding headcount.',
    items: [
      { text: 'Automation rules, alerts and team workflows', status: 'live' },
      { text: 'Managed-property records and monthly owner statements', status: 'live' },
      { text: 'Turnover scheduling and cleaner check-in with photos', status: 'live' },
    ],
  },
  {
    icon: Bot,
    stage: 'Scale your business',
    headline: 'Operate many markets from one platform.',
    items: [
      { text: 'Executive Overview, agent performance and AI hiring tools', status: 'live' },
      { text: 'Multi-market, multi-team rollups', status: 'live' },
      { text: 'Robotic assistance for on-site tasks', status: 'exploring' },
    ],
  },
];

const PRICING_DRIVERS = [
  { title: 'Prospecting data', body: 'Leads and enrichments each month, filled with the highest-scoring opportunities.', live: true },
  { title: 'AI usage', body: 'Text volume, AI interviews and AI-assisted workflows.', live: true },
  { title: 'Team workflows', body: 'Users, portfolios, assignments and shared pipeline tools.', live: true },
  { title: 'Advanced automation', body: 'Rules, routing, bulk workflows and integrations on higher plans.', live: true },
  { title: 'Managed properties', body: 'Property operations are included with your plan today. There is no separate per-property charge yet.', live: true },
];

function AvailabilityCell({ value }: { value: FeatureAvailability }) {
  if (value === 'yes') return <Check className="w-4 h-4 text-primary mx-auto" aria-label="Included" />;
  if (value === 'limited') return <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Limited</span>;
  return <Minus className="w-4 h-4 text-muted-foreground/40 mx-auto" aria-label="Not included" />;
}

function PlanPill({ id, active, onSelect }: { id: PlanId; active: boolean; onSelect: (id: PlanId) => void }) {
  const plan = PROSPECT_FINDER_PLANS[id];
  return (
    <button
      onClick={() => onSelect(id)}
      aria-pressed={active}
      aria-haspopup="dialog"
      className={`px-4 py-2 rounded-full text-sm font-semibold transition-all motion-safe:duration-200 ${
        active ? 'bg-foreground text-background shadow-md scale-[1.03]' : 'bg-muted text-muted-foreground hover:bg-muted/70'
      }`}
    >
      {plan.name}
    </button>
  );
}

// Limit-related bullets (e.g. "1 User", "Up to 5 portfolios") are already surfaced in the
// compact stat row above the feature list, so we drop them here to avoid repeating the same number twice.
const REDUNDANT_LIMIT_PATTERN = /^(up to )?[\d,]+\s+(users?|portfolios?|leads?(\/mo)?)$/i;

function PricingCard({
  id,
  highlightedId,
  isLoggedIn,
  billingPeriod,
  cardRef,
}: {
  id: PlanId;
  highlightedId: PlanId;
  isLoggedIn: boolean;
  billingPeriod: BillingPeriod;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const plan = PROSPECT_FINDER_PLANS[id];
  const [expanded, setExpanded] = useState(false);
  const isEnterprise = id === 'enterprise';
  const isSelected = highlightedId === id;
  const previewCount = 8;
  const dedupedFeatures = plan.features.filter((feature) => !REDUNDANT_LIMIT_PATTERN.test(feature.trim()));
  const visibleFeatures = expanded ? dedupedFeatures : dedupedFeatures.slice(0, previewCount);
  const hasMore = dedupedFeatures.length > previewCount;
  const displayPrice = getDisplayMonthlyPrice(plan, billingPeriod);
  const savingsPercent = getAnnualSavingsPercent(plan);

  const ctaLabel = isEnterprise ? plan.ctaLabel : isLoggedIn ? `Upgrade to ${plan.name}` : plan.ctaLabel;
  const ctaHref = isEnterprise ? plan.ctaHref : isLoggedIn ? `/billing?plan=${id}&billing=${billingPeriod}` : `${plan.ctaHref}&billing=${billingPeriod}`;

  return (
    <div
      ref={cardRef}
      id={`plan-${id}`}
      tabIndex={-1}
      className={`relative flex flex-col rounded-2xl p-6 sm:p-7 h-full motion-safe:transition-all motion-safe:duration-300 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isEnterprise
          ? 'bg-foreground text-background border-2 border-foreground shadow-xl'
          : plan.highlighted
            ? 'bg-card border-2 border-primary shadow-lg'
            : 'bg-card border border-border'
      } ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
    >
      {plan.badge && (
        <span
          className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase whitespace-nowrap ${
            isEnterprise ? 'bg-background text-foreground' : 'bg-primary text-primary-foreground'
          }`}
        >
          {plan.badge}
        </span>
      )}

      <div className="mb-5">
        <h3 className={`text-lg font-bold ${isEnterprise ? 'text-background' : 'text-foreground'}`}>{plan.name}</h3>
        <p className={`text-xs mt-1.5 leading-relaxed ${isEnterprise ? 'text-background/70' : 'text-muted-foreground'}`}>{plan.tagline}</p>
      </div>

      <div className="mb-4">
        {plan.contactSales ? (
          <p className={`text-2xl font-bold ${isEnterprise ? 'text-background' : 'text-foreground'}`}>Custom</p>
        ) : (
          <>
            <p className={`text-3xl font-bold ${isEnterprise ? 'text-background' : 'text-foreground'}`}>
              {billingPeriod === 'annual' ? formatUsd(displayPrice as number) : `$${displayPrice}`}
              <span className={`text-sm font-medium ${isEnterprise ? 'text-background/70' : 'text-muted-foreground'}`}>/month</span>
            </p>
            {billingPeriod === 'annual' && plan.annualPrice != null && (
              <p className={`text-xs mt-1 ${isEnterprise ? 'text-background/70' : 'text-muted-foreground'}`}>
                {formatUsd(plan.annualPrice)} billed annually
                {savingsPercent != null && (
                  <span className="ml-1.5 font-semibold text-primary">Save {savingsPercent}%</span>
                )}
              </p>
            )}
          </>
        )}
      </div>

      <div className={`grid grid-cols-3 gap-2 mb-6 text-center text-[11px] font-medium ${isEnterprise ? 'text-background/80' : 'text-muted-foreground'}`}>
        <div className={`rounded-lg py-2 ${isEnterprise ? 'bg-background/10' : 'bg-muted/60'}`}>
          <p className={`font-bold text-sm ${isEnterprise ? 'text-background' : 'text-foreground'}`}>{plan.limits.users.replace(/^Up to /, '').replace(/\s+users?$/i, '')}</p>
          <p>Users</p>
        </div>
        <div className={`rounded-lg py-2 ${isEnterprise ? 'bg-background/10' : 'bg-muted/60'}`}>
          <p className={`font-bold text-sm ${isEnterprise ? 'text-background' : 'text-foreground'}`}>{plan.limits.portfolios.replace(/^Up to /, '').replace(/\s+portfolios?$/i, '')}</p>
          <p>Portfolios</p>
        </div>
        <div className={`rounded-lg py-2 ${isEnterprise ? 'bg-background/10' : 'bg-muted/60'}`}>
          <p className={`font-bold text-sm ${isEnterprise ? 'text-background' : 'text-foreground'}`}>{plan.limits.leads.replace(/^Up to /, '').replace(/\s+leads?\/mo$/i, '')}</p>
          <p>Leads / mo</p>
        </div>
      </div>
      <p className={`-mt-3 mb-6 text-center text-[11px] ${isEnterprise ? 'text-background/70' : 'text-muted-foreground'}`}>
        {isEnterprise ? 'Volume pricing and custom allowances' : `${plan.limits.texts} · ${plan.limits.overage}`}
      </p>

      <Link
        href={ctaHref}
        className={`mb-5 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold motion-safe:transition-opacity hover:opacity-90 ${
          isEnterprise ? 'bg-background text-foreground' : plan.highlighted ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background'
        }`}
      >
        {ctaLabel}
      </Link>

      <ul className="space-y-2.5 flex-1">
        {visibleFeatures.map((feature) => {
          const isSectionHeader = feature.endsWith(':');
          return (
            <li
              key={feature}
              className={`flex items-start gap-2 text-sm ${isSectionHeader ? 'font-semibold mt-1' : ''} ${
                isEnterprise ? 'text-background/90' : 'text-foreground'
              }`}
            >
              {!isSectionHeader && <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isEnterprise ? 'text-background' : 'text-primary'}`} />}
              <span>{feature}</span>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`mt-4 text-xs font-semibold inline-flex items-center gap-1 self-start ${isEnterprise ? 'text-background/80 hover:text-background' : 'text-primary hover:underline'}`}
          aria-expanded={expanded}
        >
          {expanded ? 'Show fewer features' : isEnterprise ? 'Explore Enterprise Features' : 'View all features'}
          <ChevronDown className={`w-3.5 h-3.5 motion-safe:transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}

function CategoryAccordion() {
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set([FEATURE_CATEGORIES[0].category]));

  const toggle = (category: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      {FEATURE_CATEGORIES.map((group) => {
        const isOpen = openCategories.has(group.category);
        return (
          <div key={group.category} className="border-b border-border last:border-b-0">
            <button
              onClick={() => toggle(group.category)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
            >
              <span className="text-sm font-bold text-foreground uppercase tracking-wide">{group.category}</span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground motion-safe:transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="bg-muted/10 border-b border-border">
                        <th className="px-5 py-2 text-left text-xs font-semibold text-muted-foreground">Feature</th>
                        {PLAN_ORDER.map((id) => (
                          <th key={id} className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground w-[110px] min-w-[110px]">{PROSPECT_FINDER_PLANS[id].name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, idx) => (
                        <tr key={row.key} className={idx % 2 === 1 ? 'bg-muted/10' : ''}>
                          <td className="px-5 py-3.5 text-foreground font-medium w-full sm:w-auto">{row.label}</td>
                          {PLAN_ORDER.map((id) => (
                            <td key={id} className="px-3 py-3 text-center w-[110px] min-w-[110px]">
                              <AvailabilityCell value={row.values[id]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MobileComparePicker() {
  const [left, setLeft] = useState<PlanId>('starter');
  const [right, setRight] = useState<PlanId>('pro');

  const allRows = FEATURE_CATEGORIES.flatMap((g) => g.rows);

  return (
    <div className="sm:hidden">
      <div className="flex items-center gap-2 mb-4">
        <select value={left} onChange={(e) => setLeft(e.target.value as PlanId)} className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground">
          {PLAN_ORDER.map((id) => <option key={id} value={id}>{PROSPECT_FINDER_PLANS[id].name}</option>)}
        </select>
        <span className="text-xs text-muted-foreground font-medium">vs</span>
        <select value={right} onChange={(e) => setRight(e.target.value as PlanId)} className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground">
          {PLAN_ORDER.map((id) => <option key={id} value={id}>{PROSPECT_FINDER_PLANS[id].name}</option>)}
        </select>
      </div>
      <div className="space-y-5">
        {FEATURE_CATEGORIES.map((group) => (
          <div key={group.category} className="rounded-2xl border border-border overflow-hidden">
            <div className="grid grid-cols-3 items-center px-4 py-2.5 bg-muted/40 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>{group.category}</span>
              <span className="text-center">{PROSPECT_FINDER_PLANS[left].name}</span>
              <span className="text-center">{PROSPECT_FINDER_PLANS[right].name}</span>
            </div>
            <div className="divide-y divide-border">
              {group.rows.map((row) => (
                <div key={row.key} className="grid grid-cols-3 items-center px-4 py-3.5 text-sm gap-2">
                  <span className="text-foreground font-medium leading-snug">{row.label}</span>
                  <span className="text-center"><AvailabilityCell value={row.values[left]} /></span>
                  <span className="text-center"><AvailabilityCell value={row.values[right]} /></span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapabilityCard({ icon: Icon, title, body }: { icon: typeof Search; title: string; body: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onFocus={() => setRevealed(true)}
      onBlur={() => setRevealed(false)}
      onClick={() => setRevealed((v) => !v)}
      className="text-left bg-card border border-border rounded-2xl p-6 hover:border-primary/40 hover:shadow-md motion-safe:transition-all motion-safe:duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <h3 className="text-sm font-bold text-foreground mb-1.5">{title}</h3>
      <p className={`text-sm text-muted-foreground leading-relaxed motion-safe:transition-opacity ${revealed ? 'opacity-100' : 'opacity-70'}`}>{body}</p>
    </button>
  );
}

export default function PlansPageClient() {
  const { user } = useAuth();
  const isLoggedIn = Boolean(user);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(() => {
    if (typeof window !== 'undefined' && ['#plan-enterprise', '#enterprise'].includes(window.location.hash)) return 'enterprise';
    return 'business';
  });
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [previewPlan, setPreviewPlan] = useState<PlanId | null>(null);
  const closePreview = useCallback(() => setPreviewPlan(null), []);
  const cardRefs = useRef<Partial<Record<PlanId, HTMLDivElement | null>>>({});

  useEffect(() => {
    if (window.location.hash) {
      const hash = window.location.hash.slice(1);
      if (hash === 'plan-enterprise' || hash === 'enterprise') {
        setSelectedPlan('enterprise');
      }

      const scrollToHash = () => {
        const target = document.getElementById(hash);
        if (!target) return;

        const top = target.getBoundingClientRect().top + window.scrollY - 96;
        window.scrollTo({ top, left: 0, behavior: 'auto' });
      };

      window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToHash));
      const timeout = window.setTimeout(scrollToHash, 250);
      return () => window.clearTimeout(timeout);
    }

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  const handleSelectPlan = (id: PlanId) => {
    setSelectedPlan(id);
    setPreviewPlan(id);
  };

  const selectedPlanConfig = useMemo(() => PROSPECT_FINDER_PLANS[selectedPlan], [selectedPlan]);

  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-14 pb-8 text-center">
        <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase mb-4">AVYRO AI</p>
        <h1 className="text-3xl sm:text-5xl font-bold text-foreground leading-tight tracking-tight">
          One Platform. Every Stage of Growth.
        </h1>
        <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          From your first homeowner lead to a nationwide vacation rental portfolio.
        </p>
        <p className="mt-3 text-sm sm:text-base font-semibold text-foreground">
          Acquire properties. Grow your portfolio. Automate operations. Scale your business.
        </p>
        <span className="mt-5 inline-block text-xs font-semibold text-foreground bg-muted px-3.5 py-1.5 rounded-full">Enterprise unlocks the complete AVYRO AI platform</span>
      </section>

      {/* Plan Selector */}
      <section className="max-w-4xl mx-auto px-6 pb-6">
        <div className="flex items-center justify-center gap-2 flex-wrap" role="tablist" aria-label="Select a plan to open its preview">
          {PLAN_ORDER.map((id) => (
            <PlanPill key={id} id={id} active={selectedPlan === id} onSelect={handleSelectPlan} />
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground max-w-xl mx-auto">{selectedPlanConfig.tagline}</p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <div className="inline-flex items-center gap-1 bg-muted rounded-full p-1" role="tablist" aria-label="Billing period">
            <button
              onClick={() => setBillingPeriod('monthly')}
              aria-pressed={billingPeriod === 'monthly'}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold motion-safe:transition-all ${billingPeriod === 'monthly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              aria-pressed={billingPeriod === 'annual'}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold motion-safe:transition-all flex items-center gap-1.5 ${billingPeriod === 'annual' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Annual
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Save ~17%</span>
            </button>
          </div>
        </div>
      </section>

      {/* Buyer reassurance */}
      <section className="max-w-5xl mx-auto px-6 pb-8">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {PRICING_REASSURANCE.map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-foreground leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Pricing Cards */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 pb-16 scroll-mt-20">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-stretch">
          {PLAN_ORDER.map((id) => (
            <PricingCard
              key={id}
              id={id}
              highlightedId={selectedPlan}
              isLoggedIn={isLoggedIn}
              billingPeriod={billingPeriod}
              cardRef={(el) => { cardRefs.current[id] = el; }}
            />
          ))}
        </div>
        {selectedPlan === 'enterprise' && (
          <div className="mt-8 rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300">
            <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-7 items-start">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase mb-3">Enterprise</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">Full Platform Access for Multi-Market Teams</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Enterprise unlocks the complete AVYRO AI platform for operators who need scale, control, and dedicated support across markets.
                </p>
                <Link href="/prospect-finder/contact-sales" className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 motion-safe:transition-opacity">
                  Contact Sales <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {ENTERPRISE_PANEL_FEATURES.map((feature) => (
                  <div key={feature.title} className="rounded-2xl bg-muted/40 border border-border p-4">
                    <div className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-foreground">{feature.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{feature.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Mid-page conversion */}
      <section className="max-w-4xl mx-auto px-5 sm:px-6 pb-14 sm:pb-20">
        <div className="rounded-3xl bg-foreground text-background p-6 sm:p-9 text-center">
          <h2 className="text-xl sm:text-2xl font-bold">Not sure which plan fits? Start with {selectedPlanConfig.name}.</h2>
          <p className="mt-2 text-sm text-background/75 max-w-xl mx-auto">You can change plans any time. Compare every feature, or talk to our team about your markets and volume.</p>
          <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link href={selectedPlanConfig.id === 'enterprise' ? selectedPlanConfig.ctaHref : isLoggedIn ? `/billing?plan=${selectedPlan}&billing=${billingPeriod}` : `${selectedPlanConfig.ctaHref}&billing=${billingPeriod}`} className="min-h-[48px] inline-flex items-center justify-center px-6 rounded-xl text-sm font-semibold bg-background text-foreground hover:opacity-90 transition-opacity">
              {selectedPlanConfig.id === 'enterprise' ? selectedPlanConfig.ctaLabel : isLoggedIn ? `Upgrade to ${selectedPlanConfig.name}` : `Get ${selectedPlanConfig.name}`}
            </Link>
            <a href="#compare" className="min-h-[48px] inline-flex items-center justify-center px-6 rounded-xl text-sm font-semibold border border-background/30 hover:bg-background/10 transition-colors">Compare plans</a>
            <Link href="/prospect-finder/contact-sales" className="min-h-[48px] inline-flex items-center justify-center px-6 rounded-xl text-sm font-semibold border border-background/30 hover:bg-background/10 transition-colors">Talk to our team</Link>
          </div>
        </div>
      </section>


      {/* Platform journey */}
      <section id="journey" className="max-w-6xl mx-auto px-6 pb-16 scroll-mt-20">
        <div className="text-center mb-8">
          <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase mb-3">Where AVYRO AI is going</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">More Than a Homeowner CRM</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            AVYRO AI is growing into an AI-powered operating platform for vacation rental businesses, covering the whole journey from finding a homeowner to managing the property. Plans you choose today carry forward as new stages ship.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {JOURNEY_STAGES.map(({ icon: Icon, stage, headline, items }, i) => (
            <div key={stage} className="rounded-2xl border border-border bg-card p-5 sm:p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Stage {i + 1}</p>
              </div>
              <h3 className="text-base font-bold text-foreground">{stage}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{headline}</p>
              <ul className="mt-4 space-y-3 flex-1">
                {items.map((item) => (
                  <li key={item.text} className="text-sm text-foreground leading-snug">
                    <span>{item.text}</span>
                    <span className={`ml-2 inline-block align-middle text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${JOURNEY_STATUS[item.status].className}`}>
                      {JOURNEY_STATUS[item.status].label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-muted/30 p-5 sm:p-6">
          <h3 className="text-base font-bold text-foreground">What your price is built on</h3>
          <p className="mt-1 text-xs text-muted-foreground">Plans scale with the value you use, not just seats.</p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {PRICING_DRIVERS.map((d) => (
              <div key={d.title} className="rounded-xl bg-card border border-border p-4">
                <p className="text-sm font-bold text-foreground">{d.title}</p>
                <p className="mt-1 text-xs text-muted-foreground leading-snug">{d.body}</p>
                {!d.live && <span className="mt-2 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">Planned</span>}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground text-center">Roadmap items are plans, not commitments, and may change. Only features marked Available now are included in today&apos;s plans.</p>
      </section>

      {/* Why allowances are what they are */}
      <section id="lead-supply" className="max-w-5xl mx-auto px-6 pb-16 scroll-mt-20">
        <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
          <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase mb-3">Honest lead numbers</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">Why Monthly Lead Allowances Are Smaller Than You Might Expect</h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-3xl">
            An AVYRO AI lead is a researched homeowner opportunity, not a row from a bulk list. Finding the right owner, getting a working mobile number, and confirming the address and the listing takes real data work, and the best opportunities are rare. We size every plan to what we can supply at quality, and we fill your allowance with the highest-scoring leads available in your markets.
          </p>
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-3">
            {LEAD_SUPPLY_FACTS.map((fact) => (
              <div key={fact.label} className="rounded-2xl bg-muted/40 border border-border p-4">
                <p className="text-xl font-bold text-foreground">{fact.stat}</p>
                <p className="mt-1 text-xs text-muted-foreground leading-snug">{fact.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">Approximate platform averages from real lead data. Results vary by market.</p>
        </div>
      </section>

      {/* Pays for itself */}
      <section id="pays-for-itself" className="max-w-5xl mx-auto px-6 pb-16 scroll-mt-20">
        <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
          <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase mb-3">Does it pay for itself?</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">One Signed Property Covers {Math.floor(monthsCoveredByOneProperty(PROSPECT_FINDER_PLANS.business) ?? 0)}+ Months of Business</h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-3xl">
            The median lead in AVYRO AI is a home earning about ${BREAK_EVEN_ASSUMPTIONS.medianAnnualRent.toLocaleString()} a year in estimated gross rent. At a typical {BREAK_EVEN_ASSUMPTIONS.managementFeePercent}% management fee, and counting only half of that estimate to stay conservative, one signed property is worth about ${conservativeAnnualFeePerProperty().toLocaleString()} a year to you.
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['starter', 'pro', 'business'] as const).map((id) => {
              const plan = PROSPECT_FINDER_PLANS[id];
              const months = monthsCoveredByOneProperty(plan);
              const breakEven = plan.monthlyPrice ? (plan.monthlyPrice * 12) / conservativeAnnualFeePerProperty() : null;
              return (
                <div key={id} className="rounded-2xl bg-muted/40 border border-border p-4">
                  <p className="text-xs font-semibold text-muted-foreground">{plan.name} · ${plan.monthlyPrice}/mo</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{months != null ? Math.floor(months) : 0}+ months covered</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-snug">
                    by one signed property. Break-even is about {breakEven != null ? (breakEven < 1 ? `${Math.round(breakEven * 100)}% of a property` : `${breakEven.toFixed(1)} properties`) : '—'} a year.
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">Illustrative math from AVYRO AI lead data, not a guarantee. Your fee, market, and close rate will differ.</p>
        </div>
      </section>

      {/* Plan Preview Showcase — shown below actual pricing, not above it */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="text-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">See What {selectedPlanConfig.name} Looks Like</h2>
          <p className="mt-2 text-sm text-muted-foreground">Switch plans above to preview roughly three months of leads on each plan.</p>
        </div>
        <PlanPreviewShowcase planId={selectedPlan} />
      </section>

      {/* Upgrade Path */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="flex items-center justify-center flex-wrap gap-3 text-sm font-semibold">
          {PLAN_ORDER.map((id, idx) => (
            <div key={id} className="flex items-center gap-3">
              <span className={`px-4 py-2 rounded-full ${id === 'enterprise' ? 'bg-foreground text-background' : 'bg-muted text-foreground'}`}>
                {id === 'enterprise' ? 'Complete Platform' : PROSPECT_FINDER_PLANS[id].name}
              </span>
              {idx < PLAN_ORDER.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground max-w-2xl mx-auto">
          Start with the tools you need today. Unlock more automation, intelligence, team capabilities, and scale as your operation grows.
        </p>
      </section>

      {/* Comparison */}
      <section id="compare" className="max-w-6xl mx-auto px-5 sm:px-6 pb-20 sm:pb-28 scroll-mt-20">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Compare Plans</h2>
          <p className="mt-2 text-sm text-muted-foreground">Enterprise is the only plan with full access to every AVYRO AI feature category.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3 text-left">
            {COMPLETENESS_SIGNALS.map((signal) => (
              <div key={signal} className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs font-medium text-foreground leading-relaxed">
                {signal}
              </div>
            ))}
          </div>
        </div>
        <div className="hidden sm:block">
          <CategoryAccordion />
        </div>
        <MobileComparePicker />
      </section>

      {/* Capability Section */}
      <section id="value" className="max-w-6xl mx-auto px-6 pb-16 scroll-mt-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Built to Grow With Your Operation</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CAPABILITIES.map((cap) => (
            <CapabilityCard key={cap.title} {...cap} />
          ))}
        </div>
        <p className="mt-8 text-xs text-muted-foreground text-center max-w-2xl mx-auto">
          Access available property and contact intelligence based on enabled data sources and plan allowances.
        </p>
      </section>

      {/* Enterprise Callout */}
      <section id="enterprise" className="max-w-6xl mx-auto px-6 pb-16 scroll-mt-20">
        <div className="rounded-3xl bg-foreground text-background p-8 sm:p-12 text-center">
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-background text-foreground mb-5">
            Full Platform Access
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold">Need the Complete AVYRO AI Platform?</h2>
          <p className="mt-4 text-sm sm:text-base text-background/75 max-w-2xl mx-auto leading-relaxed">
            Enterprise gives larger teams full access to AVYRO AI with custom usage limits, advanced integrations, security controls, onboarding, and priority support.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/prospect-finder/contact-sales" className="px-6 py-3 rounded-xl text-sm font-semibold bg-background text-foreground hover:opacity-90 motion-safe:transition-opacity">
              Talk to Our Team
            </Link>
            <a href="#plan-enterprise" className="px-6 py-3 rounded-xl text-sm font-semibold border border-background/30 hover:bg-background/10 motion-safe:transition-colors flex items-center gap-1.5">
              Explore Enterprise Features <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-6xl mx-auto px-5 sm:px-6 pb-28 sm:pb-32 scroll-mt-20">
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Frequently Asked Questions</h2>
        </div>
        <PricingFaq />
      </section>

      <StickyPlanCta
        watchId="pricing"
        label={`${selectedPlanConfig.name} plan`}
        price={selectedPlanConfig.contactSales ? 'Custom pricing' : `${billingPeriod === 'annual' ? formatUsd(getDisplayMonthlyPrice(selectedPlanConfig, 'annual') as number) : `$${selectedPlanConfig.monthlyPrice}`} per month`}
        href={selectedPlanConfig.id === 'enterprise' ? selectedPlanConfig.ctaHref : isLoggedIn ? `/billing?plan=${selectedPlan}&billing=${billingPeriod}` : `${selectedPlanConfig.ctaHref}&billing=${billingPeriod}`}
        ctaLabel={selectedPlanConfig.id === 'enterprise' ? selectedPlanConfig.ctaLabel : isLoggedIn ? 'Upgrade' : 'Get started'}
      />

      {previewPlan && (
        <PlanPreviewModal
          planId={previewPlan}
          isLoggedIn={isLoggedIn}
          billingPeriod={billingPeriod}
          onChangePlan={(id) => { setSelectedPlan(id); setPreviewPlan(id); }}
          onClose={closePreview}
        />
      )}

      <MarketingFooter />
    </div>
  );
}
