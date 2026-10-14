'use client';

import { Home, ShieldCheck, Send, MessageCircle } from 'lucide-react';

const TILES = [
  { label: 'Listings in pipeline', value: '312', icon: Home },
  { label: 'Owners verified', value: '41', icon: ShieldCheck },
  { label: 'Audit offers sent', value: '27', icon: Send },
  { label: 'Replies', value: '9', icon: MessageCircle },
];

const ROWS = [
  { listing: 'Lakeside A-Frame Retreat', market: 'Lake Tahoe, CA', stage: 'Verified owner', tone: 'bg-emerald-500/15 text-emerald-600', license: 'License matched' },
  { listing: 'Downtown Loft with Skyline View', market: 'Nashville, TN', stage: 'Audit offer sent', tone: 'bg-sky-500/15 text-sky-600', license: 'License matched' },
  { listing: 'Desert Modern Pool Home', market: 'Scottsdale, AZ', stage: 'Replied', tone: 'bg-violet-500/15 text-violet-600', license: 'License matched' },
  { listing: 'Coastal Cottage Two Blocks to Beach', market: 'Destin, FL', stage: 'Matching owner', tone: 'bg-amber-500/15 text-amber-600', license: 'Searching records' },
  { listing: 'Mountain Cabin with Hot Tub', market: 'Gatlinburg, TN', stage: 'New listing', tone: 'bg-slate-500/15 text-slate-500', license: 'Not started' },
];

// Sanitized mock of the Co-Host pipeline: Airbnb and Vrbo listings matched to verified owners
// through public license records, then moved through audit offers and replies.
export default function CoHostShowcase() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TILES.map((t) => (
          <div key={t.label} className="bg-card rounded-xl border border-border p-4 min-w-0">
            <t.icon size={14} className="text-primary mb-2" />
            <p className="text-lg sm:text-xl font-bold text-foreground leading-tight">{t.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{t.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-xs font-bold text-foreground">Co-Host pipeline</p>
          <p className="text-[10px] text-muted-foreground">Listings matched through public license records</p>
        </div>
        <ul className="divide-y divide-border">
          {ROWS.map((r) => (
            <li key={r.listing} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{r.listing}</p>
                <p className="text-[10px] text-muted-foreground">{r.market} · {r.license}</p>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${r.tone}`}>{r.stage}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
