'use client';

import { useMemo, useState } from 'react';
import { Search, ShieldCheck, Phone, PhoneOff, Gem } from 'lucide-react';
import StageBadge from '@/components/ui/StageBadge';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import { SHOWCASE_LEADS } from './showcaseLeads';

const FILTERS = [
  { id: 'all', label: 'All Prospects', icon: Search },
  { id: 'verified', label: 'Priority Score 85+', icon: ShieldCheck },
  { id: 'phone', label: 'Phone Available', icon: Phone },
  { id: 'luxury', label: 'Luxury', icon: Gem },
] as const;

// Sanitized mock of VAYO Prospect — discovery/filtering, contact readiness, and lead scoring.
export default function ProspectShowcase() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');

  const leads = useMemo(() => {
    const sorted = [...SHOWCASE_LEADS].sort((a, b) => b.prospectScore - a.prospectScore);
    if (filter === 'verified') return sorted.filter((l) => l.prospectScore >= 85);
    if (filter === 'phone') return sorted.filter((l) => Boolean(l.contactPhone));
    if (filter === 'luxury') return sorted.filter((l) => l.tags.includes('Luxury'));
    return sorted;
  }, [filter]);
  const visibleLeads = leads.slice(0, 6);
  const dataSources = [...new Set(leads.map((lead) => lead.source))];

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
        <span className="text-[10px] text-muted-foreground">Sources in results:</span>
        {dataSources.slice(0, 6).map((src) => (
          <span key={src} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{src}</span>
        ))}
        {dataSources.length > 6 && <span className="text-[10px] text-muted-foreground">+{dataSources.length - 6} more</span>}
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">Prospect Results</p>
            <p className="text-[10px] text-muted-foreground">Property, owner contact readiness, source, stage, and score</p>
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground">Showing {visibleLeads.length} of {leads.length}</span>
        </div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-border">
                {[
                  { label: 'Property', width: 'w-[23%]' },
                  { label: 'Owner & Phone', width: 'w-[25%]' },
                  { label: 'Source', width: 'w-[11%]' },
                  { label: 'Stage', width: 'w-[15%]' },
                  { label: 'Score', width: 'w-[13%]' },
                  { label: 'Est. Net', width: 'w-[13%]' },
                ].map((heading) => (
                  <th key={heading.label} className={`${heading.width} px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground whitespace-nowrap`}>{heading.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="text-xs font-semibold text-foreground truncate">{lead.address}</p>
                    <p className="text-[10px] text-muted-foreground">{lead.city}, {lead.state}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-xs font-medium text-foreground truncate">{lead.contactName || 'Owner not identified'}</p>
                    {lead.contactPhone ? (
                      <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"><Phone size={9} /> {lead.contactPhone}</p>
                    ) : (
                      <p className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400"><PhoneOff size={9} /> Needs enrichment</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted-foreground">{lead.source}</td>
                  <td className="px-3 py-2.5"><StageBadge stage={lead.stage} size="sm" /></td>
                  <td className="px-3 py-2.5 w-24"><ProspectScoreBar score={lead.prospectScore} /></td>
                  <td className="px-3 py-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">${lead.estimatedNetMonthly.toLocaleString()}/mo</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sm:hidden divide-y divide-border">
          {visibleLeads.map((lead) => (
            <div key={lead.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">{lead.address}</p>
                  <p className="text-[10px] text-muted-foreground">{lead.city}, {lead.state} · {lead.source}</p>
                </div>
                <ProspectScoreBar score={lead.prospectScore} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium text-foreground">{lead.contactName || 'Owner not identified'}</p>
                  <p className={`flex items-center gap-1 text-[10px] ${lead.contactPhone ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {lead.contactPhone ? <Phone size={9} /> : <PhoneOff size={9} />}
                    {lead.contactPhone || 'Needs enrichment'}
                  </p>
                </div>
                <StageBadge stage={lead.stage} size="sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
