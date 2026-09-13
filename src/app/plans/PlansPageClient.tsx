'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Minus, ChevronDown, ChevronRight, ArrowRight, Search, Database, TrendingUp, Users, Zap, Brain, BarChart2, Link2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import MarketingHeader from '@/app/prospect-finder/components/MarketingHeader';
import MarketingFooter from '@/app/prospect-finder/components/MarketingFooter';
import PricingFaq from '@/app/prospect-finder/components/PricingFaq';
import {
  PLAN_ORDER,
  PROSPECT_FINDER_PLANS,
  FEATURE_CATEGORIES,
  type PlanId,
  type FeatureAvailability,
} from '@/lib/pricing/prospectFinderPlans';

const CAPABILITIES = [
  { icon: Search, title: 'Find Opportunities', body: 'Discover and organize potential homeowner prospects across your target markets.' },
  { icon: Database, title: 'Enrich Property & Owner Intelligence', body: 'Build stronger property and contact profiles from your enabled data sources.' },
  { icon: TrendingUp, title: 'Prioritize High-Value Leads', body: 'Surface the opportunities most likely to convert, faster.' },
  { icon: Users, title: 'Manage Your Pipeline', body: 'Assign, track, and move homeowner opportunities through every stage.' },
  { icon: Zap, title: 'Automate Workflows', body: 'Cut repetitive lead-management and follow-up work with automation.' },
  { icon: Brain, title: 'Build Your Team', body: 'Use AI-assisted and live interview workflows to support hiring and growth.' },
  { icon: BarChart2, title: 'Analyze Performance', body: 'Understand pipeline activity, conversion, and team performance at a glance.' },
  { icon: Link2, title: 'Connect Your Systems', body: 'Integrate Prospect Finder with the tools your team already relies on.' },
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
const REDUNDANT_LIMIT_PATTERN = /^(up to )?[\d,]+\s+(users?|portfolios?|leads?)$/i;

function PricingCard({
  id,
  highlightedId,
  isLoggedIn,
  cardRef,
}: {
  id: PlanId;
  highlightedId: PlanId;
  isLoggedIn: boolean;
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

  const ctaLabel = isEnterprise ? plan.ctaLabel : isLoggedIn ? `Upgrade to ${plan.name}` : plan.ctaLabel;
  const ctaHref = isEnterprise ? plan.ctaHref : isLoggedIn ? `/billing?plan=${id}` : plan.ctaHref;

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
          <p className={`text-3xl font-bold ${isEnterprise ? 'text-background' : 'text-foreground'}`}>
            ${plan.monthlyPrice}
            <span className={`text-sm font-medium ${isEnterprise ? 'text-background/70' : 'text-muted-foreground'}`}>/month</span>
          </p>
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
          <p className={`font-bold text-sm ${isEnterprise ? 'text-background' : 'text-foreground'}`}>{plan.limits.leads.replace(/^Up to /, '').replace(/\s+leads?$/i, '')}</p>
          <p>Leads</p>
        </div>
      </div>

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
              className="w-full flex items-center justify-between gap-3 px-5 py-3.5 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
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
                          <td className="px-5 py-3 text-foreground font-medium w-full sm:w-auto">{row.label}</td>
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
      <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
        {allRows.map((row) => (
          <div key={row.key} className="grid grid-cols-3 items-center px-4 py-3 text-sm">
            <span className="text-foreground font-medium col-span-1">{row.label}</span>
            <span className="text-center"><AvailabilityCell value={row.values[left]} /></span>
            <span className="text-center"><AvailabilityCell value={row.values[right]} /></span>
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
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('business');
  const cardRefs = useRef<Partial<Record<PlanId, HTMLDivElement | null>>>({});

  const handleSelectPlan = (id: PlanId) => {
    setSelectedPlan(id);
    cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const selectedPlanConfig = useMemo(() => PROSPECT_FINDER_PLANS[selectedPlan], [selectedPlan]);

  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-14 pb-8 text-center">
        <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase mb-4">TRAVLR Prospect Finder</p>
        <h1 className="text-3xl sm:text-5xl font-bold text-foreground leading-tight tracking-tight">
          Choose the Right Plan for Your Growth
        </h1>
        <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          From building your homeowner pipeline to automating outreach, enrichment, team workflows, and AI-powered operations, choose the Prospect Finder plan that fits your business today and scale as you grow.
        </p>
        <span className="mt-5 inline-block text-xs font-semibold text-foreground bg-muted px-3.5 py-1.5 rounded-full">Enterprise unlocks the complete Prospect Finder platform</span>
      </section>

      {/* Plan Selector */}
      <section className="max-w-4xl mx-auto px-6 pb-6">
        <div className="flex items-center justify-center gap-2 flex-wrap" role="tablist" aria-label="Select a plan to preview">
          {PLAN_ORDER.map((id) => (
            <PlanPill key={id} id={id} active={selectedPlan === id} onSelect={handleSelectPlan} />
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground max-w-xl mx-auto">{selectedPlanConfig.tagline}</p>
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
              cardRef={(el) => { cardRefs.current[id] = el; }}
            />
          ))}
        </div>
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
      <section id="compare" className="max-w-6xl mx-auto px-6 pb-16 scroll-mt-20">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Compare Plans</h2>
          <p className="mt-2 text-sm text-muted-foreground">Enterprise is the only plan with full access to every Prospect Finder feature category.</p>
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
          <h2 className="text-2xl sm:text-3xl font-bold">Need the Complete Prospect Finder Platform?</h2>
          <p className="mt-4 text-sm sm:text-base text-background/75 max-w-2xl mx-auto leading-relaxed">
            Enterprise gives larger teams full access to Prospect Finder with custom usage limits, advanced integrations, security controls, onboarding, and priority support.
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
      <section id="faq" className="max-w-6xl mx-auto px-6 pb-20 scroll-mt-20">
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Frequently Asked Questions</h2>
        </div>
        <PricingFaq />
      </section>

      <MarketingFooter />
    </div>
  );
}
