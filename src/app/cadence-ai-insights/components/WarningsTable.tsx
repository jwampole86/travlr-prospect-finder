'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { EmptyState, StatusPill, inputClass } from '@/components/ops';
import type { EarlyWarning } from '../lib';

type RiskFilter = 'all' | 'critical' | 'high' | 'medium';

export default function WarningsTable({ items }: { items: EarlyWarning[] }) {
  const [risk, setRisk] = useState<RiskFilter>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (risk !== 'all' && item.risk !== risk) return false;
      if (!needle) return true;
      return [item.name, item.address, item.state, item.signal].join(' ').toLowerCase().includes(needle);
    });
  }, [items, query, risk]);

  if (items.length === 0) {
    return <EmptyState icon={AlertTriangle} title="No live warnings" hint="No escalated leads or missing-touch cases were found in the current dataset." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search warning queue"
            className={`pl-9 ${inputClass}`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'critical', 'high', 'medium'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRisk(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${risk === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              {value === 'all' ? 'All risks' : value}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="No warnings match" hint="Try a broader search or switch to another risk level." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Lead</th>
                <th className="px-4 py-3 text-left font-semibold">Signal</th>
                <th className="px-4 py-3 text-left font-semibold">Last contact</th>
                <th className="px-4 py-3 text-left font-semibold">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-muted/20">
                  <td className="px-4 py-4">
                    <div className="font-semibold text-foreground">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.address} · {item.state}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={item.queueType === 'human_outreach' ? 'warning' : 'default'}>
                        {item.queueType === 'human_outreach' ? 'Human outreach' : 'Missing next touch'}
                      </StatusPill>
                      <StatusPill tone={item.assignedAgentId ? 'success' : 'danger'}>
                        {item.assignedAgentId ? 'Assigned' : 'Unassigned'}
                      </StatusPill>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{item.signal}</div>
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{item.lastContactedAt ? formatDate(item.lastContactedAt) : 'Never contacted'}</td>
                  <td className="px-4 py-4"><StatusPill tone={item.risk === 'critical' ? 'danger' : item.risk === 'high' ? 'warning' : 'default'}>{item.risk}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${days}d ago`;
}
