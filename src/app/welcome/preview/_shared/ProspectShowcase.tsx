'use client';

import { useMemo, useState } from 'react';
import { Search, ShieldCheck, Phone, Gem } from 'lucide-react';
import TopLeadsTable from '@/app/components/TopLeadsTable';
import { SHOWCASE_LEADS } from './showcaseLeads';

const FILTERS = [
  { id: 'all', label: 'All Prospects', icon: Search },
  { id: 'verified', label: 'Verified Priority', icon: ShieldCheck },
  { id: 'phone', label: 'Phone Available', icon: Phone },
  { id: 'luxury', label: 'Luxury', icon: Gem },
] as const;

const DATA_SOURCES = ['MLS', 'Zillow', 'Airbnb', 'VRBO', 'Direct', 'Referral'];

// Sanitized mock of VAYO Prospect — discovery/filtering + lead scoring, using the real
// TopLeadsTable component so the row layout matches the live app.
export default function ProspectShowcase() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');

  const leads = useMemo(() => {
    const sorted = [...SHOWCASE_LEADS].sort((a, b) => b.prospectScore - a.prospectScore);
    if (filter === 'verified') return sorted.filter((l) => l.prospectScore >= 85);
    if (filter === 'phone') return sorted.filter((l) => Boolean(l.contactPhone));
    if (filter === 'luxury') return sorted.filter((l) => l.tags.includes('Luxury'));
    return sorted;
  }, [filter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
        <Search size={13} className="text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">Search by address, city, or owner name…</span>
        <span className="ml-auto text-[11px] font-semibold text-foreground shrink-0">{leads.length} matched</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === f.id ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <f.icon size={12} />
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground">Data sources:</span>
        {DATA_SOURCES.map((src) => (
          <span key={src} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{src}</span>
        ))}
      </div>
      <TopLeadsTable leads={leads} />
    </div>
  );
}
