'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Phone, Copy, MapPin, ExternalLink, MessageSquare, Mail, MousePointerClick, Reply, CheckCircle2, Activity, User } from 'lucide-react';
import { toast } from 'sonner';
import { type Card, type Detail, MANUAL_MOVES, STAGE_STYLE, money, scoreTone } from './types';

const ICON: Record<string, React.ElementType> = { sms: MessageSquare, email: Mail, open: MousePointerClick, reply: Reply, delivered: CheckCircle2, journey: Activity };
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function LeadDrawer({ card, stageLabel, onClose, onMove }: { card: Card; stageLabel: string; onClose: () => void; onMove: (card: Card, to: 'human' | 'contract' | 'live' | 'closed' | 'auto') => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true; setDetail(null); setError(null);
    fetch(`/api/pipeline/lead?id=${encodeURIComponent(card.id)}`, { cache: 'no-store' }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); if (live) setDetail(j); }).catch(e => live && setError(e.message || 'Could not load this lead.'));
    return () => { live = false; };
  }, [card.id]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const l = detail?.lead; const e = detail?.engagement; const st = STAGE_STYLE[card.stage]; const cur = detail?.card ?? card;
  const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`));
  const fact = (label: string, value: string) => <div className="bg-muted/40 rounded-lg p-2.5"><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-sm font-semibold text-foreground">{value}</p></div>;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="w-full max-w-md h-full bg-card border-l border-border shadow-2xl overflow-y-auto" onClick={ev => ev.stopPropagation()} role="dialog" aria-label={`Lead ${card.address}`}>
        <div className="sticky top-0 bg-card/95 backdrop-blur border-b border-border px-5 py-4 flex items-start gap-3 z-10">
          <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 ${scoreTone(card.score)}`}>{card.score}</div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground leading-tight">{card.address}</h2>
            <p className="text-xs text-muted-foreground">{card.city}, {card.state} {card.zip}</p>
            <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.chip}`}>{stageLabel}{cur.manual ? ' · set by hand' : ' · automatic'}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Close"><X size={16} className="text-muted-foreground" /></button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {error && <p className="text-xs text-red-600 bg-red-500/10 rounded-lg p-3">{error}</p>}
          {!detail && !error && <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>}
          {detail && l && e && (
            <>
              {cur.summary && <p className="text-xs text-foreground bg-muted/40 rounded-lg px-3 py-2">{cur.summary}</p>}

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Move this lead</h3>
                <div className="flex flex-wrap gap-1.5">
                  {MANUAL_MOVES.filter(m => m.to === 'auto' ? cur.manual : true).map(m => {
                    const here = (m.to === 'human' && card.stage === 'human') || (m.to === 'contract' && card.stage === 'contract') || (m.to === 'live' && card.stage === 'live') || (m.to === 'closed' && card.stage === 'closed' && cur.manual);
                    return <button key={m.to} disabled={here} onClick={() => { onMove(cur, m.to); onClose(); }} className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${here ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50'}`}>{m.label}</button>;
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Leads in these stages are no longer texted by campaigns. The other columns follow the text automatically.</p>
              </section>

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contact</h3>
                <div className="bg-muted/40 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs"><User size={13} className="text-muted-foreground" /><span className="font-medium text-foreground">{l.owner_name || l.contact_name || card.owner || 'Owner not identified'}</span></div>
                  {l.phone ? (
                    <div className="flex items-center gap-2 text-xs"><Phone size={13} className="text-muted-foreground" /><a href={`tel:${l.phone}`} className="font-medium text-primary hover:underline">{l.phone}</a>
                      <button onClick={() => copy(l.phone!, 'Phone number')} className="ml-auto p-1 rounded hover:bg-muted" aria-label="Copy phone"><Copy size={12} className="text-muted-foreground" /></button></div>
                  ) : <p className="text-xs text-muted-foreground">No phone number on file.</p>}
                  {e.phoneQuality && <p className="text-[10px] text-muted-foreground">Phone check: {e.phoneQuality.replace(/_/g, ' ')}</p>}
                </div>
              </section>

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Property and estimate</h3>
                <div className="grid grid-cols-3 gap-2">
                  {fact('Beds / baths', `${l.beds ?? card.beds ?? '—'} / ${l.baths ?? card.baths ?? '—'}`)}
                  {fact('Sq ft', l.square_feet ? l.square_feet.toLocaleString() : '—')}
                  {fact('Built', l.year_built ? String(l.year_built) : '—')}
                  {fact('Est. net / mo', money(l.estimated_net_monthly))}
                  {fact('Est. gross / mo', money(l.estimated_gross_monthly))}
                  {fact('Occupancy', l.estimated_occupancy ? `${Math.round(Number(l.estimated_occupancy) <= 1 ? Number(l.estimated_occupancy) * 100 : Number(l.estimated_occupancy))}%` : '—')}
                </div>
                {l.regulation_status && <p className="text-[11px] text-muted-foreground mt-2">STR rules: <span className="font-medium text-foreground">{l.regulation_status}</span></p>}
              </section>

              {(e.batch || e.twilioStatus) && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Campaign</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {fact('Batch', e.batch ?? '—')}{fact('Text status', e.twilioStatus ?? '—')}
                    {fact('Link opens', String(e.humanClicks ?? 0))}{fact('Heat', e.temperature ?? '—')}
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Timeline</h3>
                {detail.events.length === 0 ? <p className="text-xs text-muted-foreground">Nothing has happened with this lead yet.</p> : (
                  <ol className="relative border-l border-border ml-2 space-y-3">
                    {detail.events.map((ev, i) => { const Icon = ICON[ev.kind] ?? Activity; return (
                      <li key={`${ev.at}-${i}`} className="pl-4 relative">
                        <span className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center"><Icon size={9} className="text-muted-foreground" /></span>
                        <p className="text-xs font-medium text-foreground capitalize">{ev.title}</p>
                        {ev.text && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-3">{ev.text}</p>}
                        <p className="text-[10px] text-muted-foreground mt-0.5">{when(ev.at)}</p>
                      </li>); })}
                  </ol>
                )}
              </section>

              {l.notes && <section><h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notes</h3><p className="text-xs text-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-3">{l.notes}</p></section>}

              <div className="flex flex-wrap gap-2 pt-1">
                {card.located && <Link href={`/map-view?lead=${encodeURIComponent(card.id)}`} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted"><MapPin size={12} />View on map</Link>}
                {l.listing_url && <a href={l.listing_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted"><ExternalLink size={12} />Listing</a>}
                <button onClick={() => copy(`${card.address}, ${card.city}, ${card.state} ${card.zip ?? ''}`.trim(), 'Address')} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted"><Copy size={12} />Copy address</button>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
