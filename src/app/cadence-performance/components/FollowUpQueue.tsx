'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { EmptyState, StatusPill, inputClass } from '@/components/ops';
import type { FollowUpLead } from '../lib';

type FilterKey = 'all' | 'human_outreach' | 'missing_next_touch' | 'unassigned';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'human_outreach', label: 'Human outreach' },
  { key: 'missing_next_touch', label: 'Missing next touch' },
  { key: 'unassigned', label: 'Unassigned' },
];

export default function FollowUpQueue({ rows }: { rows: FollowUpLead[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'unassigned'
            ? !row.assignedAgentId
            : row.queueType === filter;
      if (!matchesFilter) return false;
      if (!needle) return true;
      return [row.name, row.address, row.state, row.stage].join(' ').toLowerCase().includes(needle);
    });
  }, [filter, query, rows]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="No follow-up queue items"
        hint="There are no human_outreach leads and no recently contacted leads missing a next_scheduled_touch_at timestamp right now."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by owner, address, or state"
            className={`pl-9 ${inputClass}`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filter === item.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No queue items match the current filters"
          hint="Try a broader search or switch filters to review the rest of the cadence follow-up queue."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Lead</th>
                <th className="px-4 py-3 text-left font-semibold">Queue reason</th>
                <th className="px-4 py-3 text-left font-semibold">Last contact</th>
                <th className="px-4 py-3 text-left font-semibold">Next touch</th>
                <th className="px-4 py-3 text-left font-semibold">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-4 py-4">
                    <div className="font-semibold text-foreground">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.address} · {row.state}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={row.queueType === 'human_outreach' ? 'warning' : 'default'}>
                        {row.queueType === 'human_outreach' ? 'Human outreach' : 'No next touch'}
                      </StatusPill>
                      <StatusPill tone={row.stage === 'human_outreach' ? 'warning' : 'default'}>{row.stage}</StatusPill>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Cadence step {row.cadenceStep}</div>
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{formatLastContact(row.lastContactedAt)}</td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{row.nextScheduledTouchAt ? formatDate(row.nextScheduledTouchAt) : 'Not scheduled'}</td>
                  <td className="px-4 py-4">
                    <StatusPill tone={row.assignedAgentId ? 'success' : 'danger'}>
                      {row.assignedAgentId ? 'Assigned' : 'Unassigned'}
                    </StatusPill>
                  </td>
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
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatLastContact(value: string | null) {
  if (!value) return 'Never contacted';
  const date = new Date(value);
  const diffDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  return `${formatDate(value)} · ${diffDays}d ago`;
}
