'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Minus, Sparkles, X } from 'lucide-react';
import PlanPreviewShowcase from '@/app/plans/components/PlanPreviewShowcase';
import {
  FEATURE_CATEGORIES,
  FEATURE_COMPARISON,
  PLAN_ORDER,
  PROSPECT_FINDER_PLANS,
  conservativeAnnualFeePerProperty,
  formatUsd,
  getDisplayMonthlyPrice,
  monthsCoveredByOneProperty,
  type BillingPeriod,
  type FeatureAvailability,
  type PlanId,
} from '@/lib/pricing/prospectFinderPlans';

type TabId = 'overview' | 'dashboard' | 'features';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'dashboard', label: 'Dashboard preview' },
  { id: 'features', label: 'All features' },
];

const RANK: Record<FeatureAvailability, number> = { no: 0, limited: 1, yes: 2 };

function Availability({ value }: { value: FeatureAvailability }) {
  if (value === 'yes') return <span className="inline-flex items-center gap-1 text-xs font-medium text-primary"><Check className="w-4 h-4" /> Included</span>;
  if (value === 'limited') return <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Limited</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60"><Minus className="w-4 h-4" /> Not included</span>;
}

export default function PlanPreviewModal({
  planId,
  isLoggedIn,
  billingPeriod,
  onChangePlan,
  onClose,
}: {
  planId: PlanId;
  isLoggedIn: boolean;
  billingPeriod: BillingPeriod;
  onChangePlan: (id: PlanId) => void;
  onClose: () => void;
}) {
  const plan = PROSPECT_FINDER_PLANS[planId];
  const isEnterprise = planId === 'enterprise';
  const [tab, setTab] = useState<TabId>('overview');
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    setTab('overview');
    bodyRef.current?.scrollTo({ top: 0 });
  }, [planId]);

  const price = getDisplayMonthlyPrice(plan, billingPeriod);
  const months = monthsCoveredByOneProperty(plan);
  const ctaLabel = isEnterprise ? plan.ctaLabel : isLoggedIn ? `Upgrade to ${plan.name}` : plan.ctaLabel;
  const ctaHref = isEnterprise ? plan.ctaHref : isLoggedIn ? `/billing?plan=${planId}&billing=${billingPeriod}` : `${plan.ctaHref}&billing=${billingPeriod}`;

  const counts = useMemo(() => {
    const c = { yes: 0, limited: 0, no: 0 };
    FEATURE_COMPARISON.forEach((row) => { c[row.values[planId]] += 1; });
    return c;
  }, [planId]);

  const nextId = PLAN_ORDER[PLAN_ORDER.indexOf(planId) + 1] as PlanId | undefined;
  const unlocks = useMemo(() => {
    if (!nextId) return [];
    return FEATURE_COMPARISON.filter((row) => RANK[row.values[nextId]] > RANK[row.values[planId]]).map((row) => row.label);
  }, [planId, nextId]);

  const tiles: Array<[string, string]> = [
    ['Users', plan.limits.users],
    ['Portfolios', plan.limits.portfolios],
    ['Leads', plan.limits.leads],
    ['Enrichments', plan.limits.enrichments],
    ['Texts', plan.limits.texts],
    ['AI interviews', plan.limits.aiInterviews],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" role="presentation">
      <button type="button" aria-label="Close plan preview" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-preview-title"
        className="relative flex flex-col w-full sm:max-w-5xl max-h-[92dvh] sm:max-h-[88vh] bg-background border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4"
      >
        <div className="shrink-0 px-5 sm:px-7 pt-5 pb-4 border-b border-border bg-card">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="plan-preview-title" className="text-xl sm:text-2xl font-bold text-foreground">{plan.name}</h2>
                {plan.badge && <span className="px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide">{plan.badge}</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{plan.tagline}</p>
            </div>
            <div className="flex items-start gap-3 shrink-0">
              <div className="text-right">
                <p className="text-2xl sm:text-3xl font-bold text-foreground leading-none">{price != null ? (billingPeriod === 'annual' ? formatUsd(price) : `$${price}`) : 'Custom'}</p>
                {price != null && <p className="text-[11px] text-muted-foreground mt-1">per month{billingPeriod === 'annual' && plan.annualPrice != null ? `, ${formatUsd(plan.annualPrice)} billed annually` : ''}</p>}
              </div>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 -mt-1 -mr-2 flex items-center justify-center rounded-full hover:bg-muted text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Switch plan">
            {PLAN_ORDER.map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={id === planId}
                onClick={() => onChangePlan(id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${id === planId ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                {PROSPECT_FINDER_PLANS[id].name}
              </button>
            ))}
          </div>
        </div>

        <div className="shrink-0 px-5 sm:px-7 pt-3 border-b border-border flex gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Plan preview sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => { setTab(t.id); bodyRef.current?.scrollTo({ top: 0 }); }}
              className={`shrink-0 pb-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-7 py-5 space-y-5">
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {tiles.map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-muted/50 border border-border p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-1 text-sm font-bold text-foreground leading-snug">{value.replace(/ \/mo$/, '/mo')}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{isEnterprise ? 'Volume pricing and custom allowances.' : plan.limits.overage}</p>

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-card p-4"><p className="text-2xl font-bold text-foreground">{counts.yes}</p><p className="text-xs text-muted-foreground">features fully included</p></div>
                <div className="rounded-xl border border-border bg-card p-4"><p className="text-2xl font-bold text-foreground">{counts.limited}</p><p className="text-xs text-muted-foreground">included with limits</p></div>
                <div className="rounded-xl border border-border bg-card p-4"><p className="text-2xl font-bold text-foreground">{counts.no}</p><p className="text-xs text-muted-foreground">available on higher plans</p></div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-foreground mb-3">What&apos;s in {plan.name}</h3>
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                  {plan.features.filter((f) => !f.endsWith(':')).slice(0, 12).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {months != null && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground leading-relaxed">
                    One signed property is worth about ${conservativeAnnualFeePerProperty().toLocaleString()} a year in management fees (conservative estimate), which covers about {Math.floor(months)} months of {plan.name}.
                  </p>
                </div>
              )}

              {nextId && unlocks.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-bold text-foreground">Step up to {PROSPECT_FINDER_PLANS[nextId].name} to unlock</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {unlocks.slice(0, 8).map((label) => (
                      <span key={label} className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-foreground">{label}</span>
                    ))}
                    {unlocks.length > 8 && <span className="text-xs text-muted-foreground self-center">+{unlocks.length - 8} more</span>}
                  </div>
                  <button type="button" onClick={() => onChangePlan(nextId)} className="mt-3 text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                    Preview {PROSPECT_FINDER_PLANS[nextId].name} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'dashboard' && <PlanPreviewShowcase planId={planId} />}

          {tab === 'features' && (
            <div className="space-y-5">
              {FEATURE_CATEGORIES.map((group) => (
                <section key={group.category}>
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">{group.category}</h3>
                  <ul className="rounded-xl border border-border bg-card divide-y divide-border">
                    {group.rows.map((row) => (
                      <li key={row.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="text-sm text-foreground">{row.label}</span>
                        <Availability value={row.values[planId]} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 sm:px-7 py-4 border-t border-border bg-card flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              onClose();
              window.setTimeout(() => document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth' }), 50);
            }}
            className="text-sm font-semibold text-muted-foreground hover:text-foreground py-2"
          >
            Compare all plans
          </button>
          <Link href={ctaHref} className="inline-flex items-center justify-center gap-1.5 px-6 py-3 min-h-[48px] rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity">
            {ctaLabel} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
