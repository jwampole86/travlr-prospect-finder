'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Clock, Crown, FileText, Lock, Menu, MessageSquare, RefreshCw, UserCheck, ArrowRight, Building2 } from 'lucide-react';
import KPIBentoGrid from '@/app/components/KPIBentoGrid';
import TopLeadsTable from '@/app/components/TopLeadsTable';
import StageFunnelChart from '@/app/components/StageFunnelChart';
import RegulationPieChart from '@/app/components/RegulationPieChart';
import AppLogo from '@/components/ui/AppLogo';
import { SHOWCASE_LEADS } from '@/app/welcome/preview/_shared/showcaseLeads';
import {
  FEATURE_COMPARISON,
  PLAN_ORDER,
  PROSPECT_FINDER_PLANS,
  type FeatureAvailability,
  type PlanId,
} from '@/lib/pricing/prospectFinderPlans';
import {
  ACTIVITY_SAMPLE,
  ANCHOR_PILLS,
  PLAN_PREVIEW_STATS,
  PREVIEW_NAV,
  ROLLUP_SAMPLE,
  regulationBreakdownFor,
  stageBreakdownFor,
} from './planPreviewData';

const RANK: Record<FeatureAvailability, number> = { no: 0, limited: 1, yes: 2 };

const availability = (planId: PlanId, feature: string | null): FeatureAvailability =>
  feature ? FEATURE_COMPARISON.find((r) => r.key === feature)?.values[planId] ?? 'yes' : 'yes';

const unlockPlanName = (feature: string) => {
  const row = FEATURE_COMPARISON.find((r) => r.key === feature);
  const id = PLAN_ORDER.find((p) => row && RANK[row.values[p]] > 0);
  return id ? PROSPECT_FINDER_PLANS[id].name : 'Enterprise';
};

const ACTIVITY_ICON = { reply: MessageSquare, assign: UserCheck, stage: ArrowRight, luxury: Crown, note: FileText } as const;
const ACTIVITY_COLOR = { reply: 'text-emerald-500', assign: 'text-primary', stage: 'text-blue-500', luxury: 'text-amber-500', note: 'text-muted-foreground' } as const;

// Preview data is illustrative; swallow clicks so tiles, charts and rows never navigate away from the plans page.
function Frozen({ children }: { children: ReactNode }) {
  return <div onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}>{children}</div>;
}

// The dashboard is laid out for a desktop-width page. When the preview is narrower than that but on a
// tablet/desktop screen, scale the whole layout down instead of letting columns squeeze; phones keep the
// real stacked mobile layout.
function FitStage({ children, designWidth = 880 }: { children: ReactNode; designWidth?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [wideScreen, setWideScreen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = () => setWideScreen(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    const ro = new ResizeObserver(() => {
      setWidth(outer.current?.clientWidth ?? 0);
      setHeight(inner.current?.offsetHeight ?? 0);
    });
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => { mq.removeEventListener('change', onChange); ro.disconnect(); };
  }, []);

  const scale = wideScreen && width > 0 && width < designWidth ? width / designWidth : 1;
  const scaled = scale < 1;
  return (
    <div ref={outer} style={scaled ? { height: height * scale } : undefined} className={scaled ? 'overflow-hidden' : undefined}>
      <div ref={inner} className="space-y-4 sm:space-y-5" style={scaled ? { width: designWidth, transform: `scale(${scale})`, transformOrigin: 'top left' } : undefined}>
        {children}
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-1 mb-2">
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <span className="ml-2 text-xs text-muted-foreground">{subtitle}</span>
    </div>
  );
}

function CollapsibleRow({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="w-full flex items-center justify-between px-1 py-1 mb-2 group">
        <span className="text-left">
          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{title}</span>
          <span className="ml-2 text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && children}
    </div>
  );
}

const CITY_SAMPLE = [
  { city: 'Denver, CO', status: 'Restricted', note: 'License and 90-night cap' },
  { city: 'Nashville, TN', status: 'Permit Required', note: 'Non-owner-occupied permit' },
  { city: 'Miami Beach, FL', status: 'Allowed', note: 'Registration required' },
  { city: 'Scottsdale, AZ', status: 'Permit Required', note: 'State license and city notice' },
];
const SYNC_SAMPLE = [
  { name: 'Listing feeds', detail: 'Synced 12m ago' },
  { name: 'Owner and phone enrichment', detail: 'Synced 34m ago' },
  { name: 'STR regulation data', detail: 'Synced 2h ago' },
];

function LockedPanel({ title, plan, children }: { title: string; plan: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0"><Lock size={15} className="text-muted-foreground" /></div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">Included on {plan} and above{children ? ' · ' : ''}{children}</p>
      </div>
    </div>
  );
}

function PreviewSidebar({ planId }: { planId: PlanId }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setOpen((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const stats = PLAN_PREVIEW_STATS[planId];

  return (
    <aside className="flex flex-col bg-card lg:w-60 lg:shrink-0 lg:border-r border-border">
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
        <AppLogo size={26} />
        <div className="flex flex-col leading-none min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">AVYRO AI</span>
          <span className="text-[11px] text-muted-foreground truncate">Growth & Operations</span>
        </div>
      </div>
      <div className="mx-3 mt-3 mb-1 flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/60 border border-border">
        <Building2 size={13} className="text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{stats.portfolio}</p>
          <p className="text-[10px] text-muted-foreground truncate">{PROSPECT_FINDER_PLANS[planId].limits.portfolios}</p>
        </div>
      </div>
      <nav className="px-2 py-2" aria-label="Preview navigation">
        {PREVIEW_NAV.map((group) => {
          const items = group.items.map((item) => ({ ...item, value: availability(planId, item.feature) }));
          const included = items.filter((i) => i.value !== 'no').length;
          const isOpen = open.has(group.key);
          return (
            <div key={group.key} className="mb-0.5">
              <button
                type="button"
                onClick={() => toggle(group.key)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <group.icon size={15} className="text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{group.label}</span>
                <span className="text-[10px] text-muted-foreground">{included}/{items.length}</span>
                <ChevronDown size={13} className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <ul className="ml-3 pl-3 border-l border-border my-1 space-y-0.5">
                  {items.map((item) => (
                    <li
                      key={item.label}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs ${item.value === 'no' ? 'text-muted-foreground/60' : 'text-foreground'}`}
                      title={item.value === 'no' && item.feature ? `Included on ${unlockPlanName(item.feature)} and above` : undefined}
                    >
                      <item.icon size={13} className="shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.value === 'no' && <Lock size={11} className="shrink-0" />}
                      {item.value === 'limited' && <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400">Limited</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export default function PlanPreviewShowcase({ planId }: { planId: PlanId }) {
  const stats = PLAN_PREVIEW_STATS[planId];
  const plan = PROSPECT_FINDER_PLANS[planId];
  const [navOpen, setNavOpen] = useState(false);
  const full = planId !== 'starter';
  const isEnterprise = planId === 'enterprise';
  const hasLuxury = Boolean(stats.luxury);

  const topLeads = useMemo(() => {
    const pool = hasLuxury ? SHOWCASE_LEADS : SHOWCASE_LEADS.filter((l) => !l.tags?.includes('Luxury'));
    const sorted = [...pool].sort((a, b) => b.prospectScore - a.prospectScore);
    return isEnterprise ? sorted : sorted.slice(0, 5);
  }, [isEnterprise, hasLuxury]);
  const stageBreakdown = useMemo(() => stageBreakdownFor(stats.totalLeads), [stats.totalLeads]);
  const regulationBreakdown = useMemo(() => regulationBreakdownFor(stats.totalLeads), [stats.totalLeads]);
  const luxuryUnlock = unlockPlanName('luxury_leads');
  const pills = ANCHOR_PILLS.filter((p) => full || !['State Regulations', 'Pipeline', 'Activity'].includes(p));

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-label="Toggle navigation preview"
            className="lg:hidden w-8 h-8 -ml-1 flex items-center justify-center rounded-md hover:bg-muted"
          >
            <Menu size={16} />
          </button>
          <span className="text-xs font-semibold text-foreground truncate">{plan.name} plan preview</span>
        </div>
        <div className="flex items-center gap-2">
          {stats.scopeBadge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{stats.scopeBadge}</span>}
          <span className="text-[10px] text-muted-foreground">{stats.scaleLabel}</span>
        </div>
      </div>

      <div className="lg:flex">
        <div className={`${navOpen ? 'block' : 'hidden'} lg:block border-b lg:border-b-0 border-border`}>
          <PreviewSidebar planId={planId} />
        </div>

        <div className="flex-1 min-w-0 p-3 sm:p-5 bg-background">
         <FitStage>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-2xl font-semibold text-foreground">Dashboard</h3>
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-muted border border-border text-primary">
                <Building2 size={10} />{stats.portfolio}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
              <Clock size={12} /> Updated: <span className="text-foreground font-medium">just now</span>
              <RefreshCw size={11} className="ml-2" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 sm:gap-2" aria-label="Dashboard sections">
            {pills.map((label) => (
              <span key={label} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground whitespace-nowrap">{label}</span>
            ))}
          </div>

          <Frozen>
            <div className="space-y-3">
              <KPIBentoGrid
                totalLeads={stats.totalLeads}
                regulationFriendly={stats.regulationFriendly}
                strEligible={stats.strEligible}
                avgScore={stats.avgScore}
                activeLeads={stats.activeLeads}
                actionNeededLeads={stats.actionNeededLeads}
                estimatedMonthlyRevenue={stats.estimatedMonthlyRevenue}
                highPriority={stats.highPriority}
                fullyVerified={stats.fullyVerified}
                unassignedPriority={stats.unassignedPriority}
                assignedLeads={stats.assignedLeads}
                verifiedOwner={stats.verifiedOwner}
                verifiedNumber={stats.verifiedNumber}
                phoneAvailable={stats.phoneAvailable}
                newLeads={stats.newLeads}
                luxuryProspects={stats.luxury?.prospects}
                luxuryFullyVerified={stats.luxury?.verified}
                luxuryPhoneAvailable={stats.luxury?.phone}
                luxuryPriority={stats.luxury?.priority}
                luxuryUnassignedPriority={stats.luxury?.unassigned}
              />
              {!stats.luxury && (
                <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0"><Crown size={16} className="text-amber-500" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Luxury panels</p>
                    <p className="text-xs text-muted-foreground">Luxury Prospects, Verified, Phone, Priority and Unassigned tiles are included on {luxuryUnlock} and above.</p>
                  </div>
                  <Lock size={14} className="text-muted-foreground shrink-0 ml-auto" />
                </div>
              )}
            </div>
          </Frozen>

          {isEnterprise && (
            <div>
              <SectionTitle title="Multi-Org Rollup" subtitle="Every organization, one view" />
              <div className="bg-card rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-xs min-w-[420px]">
                  <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-semibold">Organization</th><th className="px-3 py-2 font-semibold">Markets</th><th className="px-3 py-2 font-semibold">Agents</th><th className="px-3 py-2 font-semibold">Leads</th><th className="px-3 py-2 font-semibold text-right">Live revenue</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {ROLLUP_SAMPLE.map((r) => (
                      <tr key={r.org}><td className="px-4 py-2 font-medium text-foreground">{r.org}</td><td className="px-3 py-2">{r.markets}</td><td className="px-3 py-2">{r.agents}</td><td className="px-3 py-2">{r.leads.toLocaleString()}</td><td className="px-3 py-2 text-right text-emerald-600">${r.revenue.toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {full ? (
            <Frozen>
              <div>
                <SectionTitle title="State Regulations" subtitle="State STR compliance breakdown" />
                <RegulationPieChart regulationBreakdown={regulationBreakdown} />
              </div>
              <div className="mt-4 sm:mt-5">
                <SectionTitle title="Pipeline by Stage" subtitle="Lead distribution across funnel" />
                <StageFunnelChart stageBreakdown={stageBreakdown} />
              </div>
            </Frozen>
          ) : (
            <div className="space-y-3">
              <LockedPanel title="State Regulations" plan="Pro" />
              <LockedPanel title="Pipeline by Stage" plan="Pro" />
            </div>
          )}

          <Frozen>
            <SectionTitle title="Top Scored Leads" subtitle="Highest priority properties for outreach" />
            <TopLeadsTable leads={topLeads} />
          </Frozen>

          {full ? (
            <div>
              <SectionTitle title="Recent Activity" subtitle="Latest changes across all leads" />
              <div className="bg-card rounded-xl border border-border divide-y divide-border">
                {ACTIVITY_SAMPLE.filter((e) => hasLuxury || e.kind !== 'luxury').map((e) => {
                  const Icon = ACTIVITY_ICON[e.kind];
                  return (
                    <div key={e.text} className="flex items-start gap-3 px-4 sm:px-5 py-3">
                      <Icon size={14} className={`mt-0.5 shrink-0 ${ACTIVITY_COLOR[e.kind]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground leading-snug">{e.text}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{e.detail}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{e.when}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <LockedPanel title="Recent Activity" plan="Pro" />
          )}

          <CollapsibleRow title="City Regulations" subtitle="Rule coverage by state and city">
            <div className="bg-card rounded-xl border border-border divide-y divide-border">
              {CITY_SAMPLE.map((c) => (
                <div key={c.city} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0"><p className="text-xs font-medium text-foreground">{c.city}</p><p className="text-[11px] text-muted-foreground truncate">{c.note}</p></div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">{c.status}</span>
                </div>
              ))}
            </div>
          </CollapsibleRow>

          <CollapsibleRow title="Data Source Sync" subtitle="Live source health and ingestion status">
            <div className="bg-card rounded-xl border border-border divide-y divide-border">
              {SYNC_SAMPLE.map((src) => (
                <div key={src.name} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <p className="text-xs font-medium text-foreground flex-1 truncate">{src.name}</p>
                  <span className="text-[11px] text-muted-foreground shrink-0">{src.detail}</span>
                </div>
              ))}
            </div>
          </CollapsibleRow>
         </FitStage>
        </div>
      </div>
      <p className="px-5 py-3 border-t border-border text-[10px] text-muted-foreground">
        Sample data for illustration. Navigation shows the areas included in {plan.name}; locked items unlock on higher plans.
      </p>
    </div>
  );
}
