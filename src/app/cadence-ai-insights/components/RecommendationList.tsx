'use client';

import { useMemo, useState } from 'react';
import { Lightbulb, Search } from 'lucide-react';
import { EmptyState, StatusPill, inputClass } from '@/components/ops';
import type { InsightRecommendation } from '../lib';

type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

export default function RecommendationList({ items }: { items: InsightRecommendation[] }) {
  const [priority, setPriority] = useState<PriorityFilter>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (priority !== 'all' && item.priority !== priority) return false;
      if (!needle) return true;
      return [item.title, item.detail, item.evidence, item.action].join(' ').toLowerCase().includes(needle);
    });
  }, [items, priority, query]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Lightbulb}
        title="No recommendations yet"
        hint="Once live cadence evidence appears, recommendations will be generated directly from the database."
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
            placeholder="Search recommendations"
            className={`pl-9 ${inputClass}`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'high', 'medium', 'low'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPriority(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${priority === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              {value === 'all' ? 'All priorities' : `${value[0].toUpperCase()}${value.slice(1)} priority`}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="No recommendations match" hint="Try a broader query or switch to another priority band." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((item) => (
            <article key={item.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={priorityTone(item.priority)}>{item.priority}</StatusPill>
                <StatusPill tone="default">{item.type}</StatusPill>
              </div>
              <h3 className="mt-3 text-base font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
              <div className="mt-3 rounded-2xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Evidence:</span> {item.evidence}
              </div>
              <div className="mt-3 text-sm text-foreground"><span className="font-semibold">Action:</span> {item.action}</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function priorityTone(priority: InsightRecommendation['priority']) {
  if (priority === 'high') return 'danger';
  if (priority === 'medium') return 'warning';
  return 'success';
}
