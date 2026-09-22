'use client';

import { Home, ShieldCheck, DollarSign, User, MapPin } from 'lucide-react';
import RegulationBadge from '@/components/ui/RegulationBadge';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import RegulationShowcase from './RegulationShowcase';

// Sanitized mock of VAYO Intelligence — property + owner + revenue + STR intelligence
// brought together in one profile view, using real UI primitives (RegulationBadge,
// ProspectScoreBar) for visual accuracy.
export default function IntelligenceShowcase() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4">
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Home size={13} className="text-primary" />
            <span className="text-xs font-semibold text-foreground">Property Profile</span>
            <span className="ml-auto"><ProspectScoreBar score={91} showLabel /></span>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <p className="text-sm font-bold text-foreground">150 Ridgeline Dr</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={10} /> Breckenridge, CO 80424</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-muted/40 rounded-lg py-2">
                <p className="text-sm font-bold text-foreground">5bd/4ba</p>
                <p className="text-[10px] text-muted-foreground">Layout</p>
              </div>
              <div className="bg-muted/40 rounded-lg py-2">
                <p className="text-sm font-bold text-foreground">$425</p>
                <p className="text-[10px] text-muted-foreground">Est. ADR</p>
              </div>
              <div className="bg-muted/40 rounded-lg py-2">
                <p className="text-sm font-bold text-foreground">77%</p>
                <p className="text-[10px] text-muted-foreground">Est. Occupancy</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <RegulationBadge status="Restricted" size="sm" />
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck size={10} /> Owner Verified
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                <DollarSign size={10} /> $7,020/mo est. net
              </span>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <User size={13} className="text-primary" />
            <span className="text-xs font-semibold text-foreground">Owner & Source Intelligence</span>
          </div>
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Owner Name</span>
              <span className="font-semibold text-foreground">Verified · on file</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Contact Phone</span>
              <span className="font-semibold text-foreground">Verified · on file</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Data Source</span>
              <span className="font-semibold text-foreground">MLS</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last Verified</span>
              <span className="font-semibold text-foreground">2 days ago</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Market Trend</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">STR demand rising</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-foreground mb-2">Verification Timeline</p>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="space-y-3">
            {[
              { label: 'Address matched to county records', time: '6 days ago' },
              { label: 'Owner identity confirmed via public records', time: '4 days ago' },
              { label: 'Phone number verified as active/reachable', time: '2 days ago' },
              { label: 'STR regulation status confirmed for jurisdiction', time: '2 days ago' },
            ].map((step) => (
              <div key={step.label} className="flex items-center gap-2.5">
                <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
                <span className="text-xs text-foreground flex-1">{step.label}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{step.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-foreground mb-2">STR Regulation Coverage Examples</p>
        <RegulationShowcase />
      </div>
    </div>
  );
}
