'use client';

import { useState } from 'react';
import { Search, Database, GitBranch, Mic, Zap, Brain, BarChart2 } from 'lucide-react';
import ProspectShowcase from '../preview/_shared/ProspectShowcase';
import IntelligenceShowcase from '../preview/_shared/IntelligenceShowcase';
import PipelineWidgets from '../preview/_shared/PipelineWidgets';
import TeleprompterShowcase from '../preview/_shared/TeleprompterShowcase';
import AutomationShowcase from '../preview/_shared/AutomationShowcase';
import InterviewShowcase from '../preview/_shared/InterviewShowcase';
import AnalyticsShowcase from '../preview/_shared/AnalyticsShowcase';

const TABS = [
  {
    id: 'prospect', label: 'Prospect', icon: Search, body: ProspectShowcase,
    headline: 'Discover Your Next Management Opportunity',
    copy: 'Find, organize, and prioritize homeowner properties that match your acquisition strategy.',
  },
  {
    id: 'intelligence', label: 'Intelligence', icon: Database, body: IntelligenceShowcase,
    headline: 'Know the Property Before the Conversation',
    copy: 'Property, owner, revenue, and STR regulation intelligence together in one profile — before your team ever picks up the phone.',
  },
  {
    id: 'crm', label: 'CRM', icon: GitBranch, body: PipelineWidgets,
    headline: 'Keep Every Opportunity Moving',
    copy: 'Manage homeowner opportunities from discovery through outreach, follow-up, and conversion without losing the context behind the lead.',
  },
  {
    id: 'engage', label: 'Engage', icon: Mic, body: TeleprompterShowcase,
    headline: 'Turn Intelligence Into Better Conversations',
    copy: 'VAYO brings property context, homeowner information, and live conversation guidance directly into the outreach workflow.',
    featured: true,
  },
  {
    id: 'automate', label: 'Automate', icon: Zap, body: AutomationShowcase,
    headline: 'Automate the Work Between the Work',
    copy: 'Connect triggers, follow-up, notifications, and routing so your team spends less time on repetitive tasks.',
  },
  {
    id: 'talent', label: 'Talent', icon: Brain, body: InterviewShowcase,
    headline: 'Let AI Handle the First Interview',
    copy: 'VAYO can run structured AI candidate interviews, capture interview intelligence, and help your team identify candidates who deserve the next human conversation.',
    featured: true,
  },
  {
    id: 'analytics', label: 'Analytics', icon: BarChart2, body: AnalyticsShowcase,
    headline: "Know What's Actually Driving Growth",
    copy: 'Measure pipeline activity, opportunity quality, and team performance from one connected system.',
  },
] as const;

type TabId = (typeof TABS)[number]['id'];

// Live, real-component "screenshots" of the product for the public landing page — avoids
// stale/binary screenshot files by rendering actual dashboard/pipeline widgets (with
// sanitized fixture data) plus sanitized mockups of the AI differentiator features.
export default function ProductShowcase() {
  const [active, setActive] = useState<TabId>('prospect');
  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0];
  const ActiveBody = activeTab.body;

  return (
    <div>
      {/* Category selector */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
              active === tab.id ? 'bg-foreground text-background shadow-md scale-[1.03]' : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            <tab.icon size={13} />
            {tab.label}
            {tab.featured && active !== tab.id && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div className="text-center mb-6 max-w-2xl mx-auto">
        <h3 className="text-lg sm:text-xl font-bold text-foreground">{activeTab.headline}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{activeTab.copy}</p>
      </div>

      {/* Browser-frame showcase */}
      <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-primary/5 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 text-[11px] text-muted-foreground truncate">app.vayo.io</span>
        </div>
        <div className="p-4 sm:p-5 bg-background">
          <ActiveBody />
          <p className="mt-4 text-[10px] text-muted-foreground text-center">Sample data shown for illustration purposes only.</p>
        </div>
      </div>
    </div>
  );
}

