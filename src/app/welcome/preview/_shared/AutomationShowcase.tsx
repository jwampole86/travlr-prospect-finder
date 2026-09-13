'use client';

import { Zap, ArrowRight, Bell, UserPlus, CalendarClock, MessageSquare, RefreshCw, TrendingUp } from 'lucide-react';

const RULES: { trigger: string; action: string; icon: typeof Bell; on: boolean }[] = [
  { trigger: 'New high-priority lead assigned', action: 'Notify agent instantly', icon: Bell, on: true },
  { trigger: 'No response after 3 days', action: 'Send automated follow-up SMS', icon: MessageSquare, on: true },
  { trigger: 'Lead unassigned for 24 hours', action: 'Route to next available agent', icon: UserPlus, on: true },
  { trigger: 'Candidate interview completed', action: 'Notify hiring manager + schedule review', icon: CalendarClock, on: false },
  { trigger: 'Lead score recalculated above 85', action: 'Move to Verified Priority queue', icon: TrendingUp, on: true },
  { trigger: 'Data source sync completes', action: 'Refresh regulation + owner verification flags', icon: RefreshCw, on: true },
];

// Sanitized mock of VAYO Automate — trigger → action workflow rules, reflecting real
// automation concepts already in the app (lead routing, notification rules, cadences)
// without implying a drag-and-drop workflow builder that doesn't exist.
export default function AutomationShowcase() {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Zap size={13} className="text-primary" />
        <span className="text-xs font-semibold text-foreground">Workflow Automation Rules</span>
        <span className="ml-auto text-[11px] font-semibold text-foreground">{RULES.filter((r) => r.on).length} active</span>
      </div>
      <div className="divide-y divide-border">
        {RULES.map((rule) => (
          <div key={rule.trigger} className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <rule.icon size={14} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap text-xs">
              <span className="font-semibold text-foreground">{rule.trigger}</span>
              <ArrowRight size={11} className="text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">{rule.action}</span>
            </div>
            <span className={`shrink-0 w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${rule.on ? 'bg-primary justify-end' : 'bg-muted justify-start'}`}>
              <span className="w-4 h-4 rounded-full bg-white shadow" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
