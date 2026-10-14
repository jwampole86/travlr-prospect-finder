'use client';

import { useState } from 'react';
import { Search, Database, GitBranch, Mic, Zap, Brain, BarChart2, Home, Activity } from 'lucide-react';
import ProspectShowcase from '../preview/_shared/ProspectShowcase';
import IntelligenceShowcase from '../preview/_shared/IntelligenceShowcase';
import PipelineWidgets from '../preview/_shared/PipelineWidgets';
import TeleprompterShowcase from '../preview/_shared/TeleprompterShowcase';
import AutomationShowcase from '../preview/_shared/AutomationShowcase';
import InterviewShowcase from '../preview/_shared/InterviewShowcase';
import AnalyticsShowcase from '../preview/_shared/AnalyticsShowcase';
import CoHostShowcase from '../preview/_shared/CoHostShowcase';
import OperateShowcase from '../preview/_shared/OperateShowcase';

const TABS = [
  {
    id: 'prospect', label: 'Prospect', icon: Search, body: ProspectShowcase,
    headline: 'Discover Your Next Management Opportunity',
    copy: 'Find, organize, and prioritize homeowner properties that match your acquisition strategy.', featured: false,
  },
  {
    id: 'intelligence', label: 'Intelligence', icon: Database, body: IntelligenceShowcase,
    headline: 'Know the Property Before the Conversation',
    copy: 'Property, owner, revenue, and STR regulation intelligence together in one profile — before your team ever picks up the phone.', featured: false,
  },
  {
    id: 'crm', label: 'Pipeline', icon: GitBranch, body: PipelineWidgets,
    headline: 'Watch Every Opportunity Move',
    copy: 'A live pipeline board built on your real campaign stages, from scored prospect to texted, engaged, hot, and under contract. Drag leads between stages or switch to the map.', featured: true,
  },
  {
    id: 'cohost', label: 'Co-Host', icon: Home, body: CoHostShowcase,
    headline: 'Turn Listings Into Verified Owners',
    copy: 'Match Airbnb and Vrbo listings to their real owners through public license records, then send audit offers and follow up, all in a pipeline of its own.', featured: true,
  },
  {
    id: 'engage', label: 'Engage', icon: Mic, body: TeleprompterShowcase,
    headline: 'Turn Intelligence Into Better Conversations',
    copy: 'Text campaigns that respect quiet hours and opt-outs, plus live call guidance with property context, directly in the outreach workflow.',
    featured: true,
  },
  {
    id: 'automate', label: 'Automate', icon: Zap, body: AutomationShowcase,
    headline: 'Automate the Work Between the Work',
    copy: 'Connect triggers, follow-up, notifications, and routing so your team spends less time on repetitive tasks.', featured: false,
  },
  {
    id: 'talent', label: 'Talent', icon: Brain, body: InterviewShowcase,
    headline: 'Let AI Handle the First Interview',
    copy: 'AVYRO AI can run structured AI candidate interviews, capture interview intelligence, and help your team identify candidates who deserve the next human conversation.',
    featured: true,
  },
  {
    id: 'analytics', label: 'Analytics', icon: BarChart2, body: AnalyticsShowcase,
    headline: "Know What's Actually Driving Growth",
    copy: 'Measure pipeline activity, opportunity quality, and team performance from one connected system.', featured: false,
  },
  {
    id: 'operate', label: 'Operate', icon: Activity, body: OperateShowcase,
    headline: 'Run the Whole Operation From One Place',
    copy: 'An Executive Overview where every number opens the people behind it, a live System Status page, and Team Chat so nothing slips between teammates.', featured: false,
  },
] as const;

type TabId = (typeof TABS)[number]['id'];
type ProductShowcaseProps = {
  presentation?: 'standard' | 'hero';
};

// Live, real-component "screenshots" of the product for the public landing page — avoids
// stale/binary screenshot files by rendering actual dashboard/pipeline widgets (with
// sanitized fixture data) plus sanitized mockups of the AI differentiator features.
export default function ProductShowcase({ presentation = 'standard' }: ProductShowcaseProps) {
  const [active, setActive] = useState<TabId>('prospect');
  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0];
  const ActiveBody = activeTab.body;
  const isHero = presentation === 'hero';

  return (
    <div className={isHero ? 'rounded-2xl sm:rounded-[1.35rem] border border-border bg-card/95 p-1.5 sm:p-2 shadow-2xl shadow-primary/15 backdrop-blur' : undefined}>
      {/* Category selector */}
      <div
        role="tablist"
        aria-label="Product areas"
        className={`flex items-center gap-1.5 overflow-x-auto snap-x snap-mandatory sm:flex-wrap sm:justify-center sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isHero ? 'mb-4 px-2 pt-2' : 'mb-6 px-1'}`}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={(e) => {
              setActive(tab.id);
              e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
            }}
            className={`shrink-0 snap-center flex items-center gap-1.5 rounded-full text-xs font-semibold transition-all min-h-[40px] sm:min-h-0 ${isHero ? 'px-3.5 sm:px-3 py-2 sm:py-1.5' : 'px-4 sm:px-3.5 py-2'} ${
              active === tab.id ? 'bg-foreground text-background shadow-md scale-[1.03]' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            <tab.icon size={13} />
            {tab.label}
            {tab.featured && active !== tab.id && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div className={`text-center max-w-2xl mx-auto ${isHero ? 'mb-4 px-3' : 'mb-6'}`}>
        <h3 className="text-lg sm:text-xl font-bold text-foreground">{activeTab.headline}</h3>
        {!isHero && <p className="mt-1.5 text-sm text-muted-foreground">{activeTab.copy}</p>}
      </div>

      {/* Browser-frame showcase */}
      <div className={`rounded-2xl border border-border bg-card shadow-2xl shadow-primary/5 overflow-hidden ${isHero ? 'shadow-none' : ''}`}>
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border bg-muted/40">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 text-[11px] text-muted-foreground truncate">app.avyro.ai</span>
        </div>
        <div className={`${isHero ? 'p-2.5 sm:p-4' : 'p-3 sm:p-5'} bg-background min-w-0`}>
          <div className={isHero ? 'relative max-h-[540px] overflow-hidden sm:max-h-none' : undefined}>
            <ActiveBody />
            {isHero && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent sm:hidden" />}
          </div>
          <p className="mt-4 text-[10px] text-muted-foreground text-center">Sample data shown for illustration purposes only.</p>
        </div>
      </div>
    </div>
  );
}

