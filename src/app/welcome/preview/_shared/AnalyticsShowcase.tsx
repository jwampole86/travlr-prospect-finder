'use client';

import { BarChart2, TrendingUp, Clock, PhoneCall } from 'lucide-react';

const METRICS = [
  { label: 'Lead → Contacted Rate', value: '64%', icon: TrendingUp },
  { label: 'Avg. First Response Time', value: '38 min', icon: Clock },
  { label: 'Weekly Call Volume', value: '212', icon: PhoneCall },
  { label: 'Pipeline Velocity (avg days)', value: '17', icon: BarChart2 },
];

const AGENTS = [
  { name: 'Agent A', calls: 58, converted: 14 },
  { name: 'Agent B', calls: 46, converted: 9 },
  { name: 'Agent C', calls: 39, converted: 11 },
];

const FUNNEL = [
  { stage: 'New Lead', count: 1248, pct: 100 },
  { stage: 'Contacted', count: 799, pct: 64 },
  { stage: 'Interested', count: 412, pct: 33 },
  { stage: 'Proposal Sent', count: 218, pct: 17 },
  { stage: 'Under Contract', count: 94, pct: 8 },
];

// Sanitized mock of VAYO Analytics — process/activity metrics only (no fabricated revenue,
// ARR, or customer-outcome claims), matching the kind of conversion/performance reporting
// already present in the app (call-analytics, conversion-analytics, team-performance).
export default function AnalyticsShowcase() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {METRICS.map((m) => (
          <div key={m.label} className="bg-card rounded-xl border border-border p-4">
            <m.icon size={14} className="text-primary mb-2" />
            <p className="text-xl font-bold text-foreground">{m.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-foreground">Agent Activity (last 7 days)</p>
        </div>
        <div className="p-4 space-y-3">
          {AGENTS.map((a) => (
            <div key={a.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground font-medium">{a.name}</span>
                <span className="text-muted-foreground">{a.calls} calls · {a.converted} converted</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (a.converted / a.calls) * 100 * 4)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-foreground">Pipeline Conversion Funnel</p>
        </div>
        <div className="p-4 space-y-2.5">
          {FUNNEL.map((f) => (
            <div key={f.stage} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-28 shrink-0">{f.stage}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${f.pct}%` }} />
              </div>
              <span className="text-xs font-semibold text-foreground w-16 text-right shrink-0">{f.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
