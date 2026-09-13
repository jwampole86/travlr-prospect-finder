'use client';

import { useState } from 'react';
import { LayoutDashboard, GitBranch, Mic, Brain, Shield } from 'lucide-react';
import DashboardWidgets from '../preview/_shared/DashboardWidgets';
import PipelineWidgets from '../preview/_shared/PipelineWidgets';
import TeleprompterShowcase from '../preview/_shared/TeleprompterShowcase';
import InterviewShowcase from '../preview/_shared/InterviewShowcase';
import RegulationShowcase from '../preview/_shared/RegulationShowcase';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, body: DashboardWidgets },
  { id: 'pipeline', label: 'Pipeline', icon: GitBranch, body: PipelineWidgets },
  { id: 'teleprompter', label: 'Live Call AI', icon: Mic, body: TeleprompterShowcase },
  { id: 'interview', label: 'AI Interviews', icon: Brain, body: InterviewShowcase },
  { id: 'compliance', label: 'STR Compliance', icon: Shield, body: RegulationShowcase },
] as const;

type TabId = (typeof TABS)[number]['id'];

// Live, real-component "screenshots" of the product for the public landing page — avoids
// stale/binary screenshot files by rendering actual dashboard/pipeline widgets (with
// sanitized fixture data) plus sanitized mockups of the AI differentiator features.
export default function ProductShowcase() {
  const [active, setActive] = useState<TabId>('dashboard');
  const ActiveBody = TABS.find((t) => t.id === active)?.body ?? DashboardWidgets;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 text-[11px] text-muted-foreground truncate">app.vayo.io</span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 pt-3 overflow-x-auto scrollbar-thin">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              active === tab.id ? 'bg-background text-foreground border border-border border-b-background -mb-px' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5 bg-background">
        <ActiveBody />
        <p className="mt-4 text-[10px] text-muted-foreground text-center">Sample data shown for illustration purposes only.</p>
      </div>
    </div>
  );
}
