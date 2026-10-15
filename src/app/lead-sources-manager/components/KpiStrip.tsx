import React from 'react';
import { AlertTriangle, Clock, Database, MapPin, PhoneCall, Radio } from 'lucide-react';
import type { OverviewTotals, SourceStatus } from '@/lib/leadSourceTypes';
import { fmtNum, fmtPct } from '../utils';

interface Props { totals: OverviewTotals; status: 'all' | SourceStatus; onStatus: (s: 'all' | SourceStatus) => void }

export default function KpiStrip({ totals, status, onStatus }: Props) {
  const cards: Array<{ key: string; icon: React.ReactNode; label: string; value: string; sub: string; tone: string; filter?: 'all' | SourceStatus }> = [
    { key: 'sources', icon: <Radio size={16} />, label: 'Sources', value: fmtNum(totals.sources), sub: 'Where leads come from', tone: 'text-primary bg-primary/10', filter: 'all' },
    { key: 'markets', icon: <MapPin size={16} />, label: 'Markets live', value: `${totals.activeConfigs}/${totals.configs}`, sub: totals.pausedConfigs ? `${totals.pausedConfigs} paused` : 'None paused', tone: 'text-emerald-600 bg-emerald-500/10' },
    { key: 'leads', icon: <Database size={16} />, label: 'Leads', value: fmtNum(totals.leads), sub: `+${fmtNum(totals.added7d)} in 7 days`, tone: 'text-violet-600 bg-violet-500/10' },
    { key: 'contact', icon: <PhoneCall size={16} />, label: 'Phone on file', value: fmtPct(totals.phonePct), sub: `${fmtPct(totals.verifiedOwnerPct)} owner verified`, tone: 'text-sky-600 bg-sky-500/10' },
    { key: 'attention', icon: <AlertTriangle size={16} />, label: 'Needs attention', value: fmtNum(totals.attentionConfigs), sub: totals.attentionConfigs ? 'Show affected sources' : 'All clear', tone: totals.attentionConfigs ? 'text-red-600 bg-red-500/10' : 'text-emerald-600 bg-emerald-500/10', filter: 'attention' },
    { key: 'pending', icon: <Clock size={16} />, label: 'Awaiting first sync', value: fmtNum(totals.pendingConfigs), sub: totals.pendingConfigs ? 'Show waiting sources' : 'Nothing waiting', tone: 'text-blue-600 bg-blue-500/10', filter: 'pending' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map(c => {
        const clickable = !!c.filter;
        const active = clickable && c.filter === status && c.filter !== 'all';
        const Tag = clickable ? 'button' : 'div';
        return (
          <Tag
            key={c.key}
            {...(clickable ? { onClick: () => onStatus(active ? 'all' : c.filter!), type: 'button' as const, 'aria-pressed': active } : {})}
            className={`text-left rounded-2xl border bg-card p-4 transition-all ${clickable ? 'hover:border-primary/40 hover:shadow-sm cursor-pointer' : ''} ${active ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <span className={`w-8 h-8 rounded-lg inline-flex items-center justify-center ${c.tone}`}>{c.icon}</span>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground tabular-nums">{c.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{c.sub}</p>
          </Tag>
        );
      })}
    </div>
  );
}
