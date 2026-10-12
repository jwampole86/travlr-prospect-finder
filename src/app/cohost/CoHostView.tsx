'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Handshake, Loader2, RefreshCw, Download, ShieldAlert, ExternalLink, Camera, MapPin, AlertTriangle, Gem, Link2, Copy, Check, Mail, Eye } from 'lucide-react';

interface Owner { names: string[]; type: string | null; mailing: string | null; permitHolder: string | null; contactFound: boolean; phones: string[]; emails: string[]; published?: { email: string | null; phone: string | null } | null }
interface OfferInfo { code: string; views: number; lastViewedAt: string | null; requestedAt: string | null; optedOutAt: string | null; request: { name?: string; email?: string | null; phone?: string | null; service?: string; message?: string | null; at?: string } | null }
interface OfferPanel { loading: boolean; error?: string; url?: string; optedOut?: boolean; drafts?: { subject: string; email: string; sms: string } }
interface Listing {
  property_id: string; market: string; title: string | null; airbnb_url: string | null; vrbo_url: string | null; booking_url: string | null; bedrooms: number | null; bathrooms: number | null;
  adr: number | null; occupancy_pct: number | null; revenue_ltm: number | null; revenue_potential_ltm: number | null; rating: number | null; reviews: number | null; host_listing_count: number | null;
  is_luxury: boolean | null; under_score: number | null; under_reasons: string[] | null; segment: string; photo_score: number | null; photo_notes: { hero?: string; fixes?: string[]; missingShots?: string[]; looksDated?: boolean } | null;
  address_match_confidence: string | null; match_status: string | null; matched_address: string | null; matched_owner: Owner | null; pipeline_stage: string; service_model: string; reviewer_notes: string | null; offer?: OfferInfo | null;
}
interface CrmLead { id: string; address: string | null; city: string | null; state: string | null; owner_name: string | null; program_reason: string | null; program_set_at: string | null; cohost_service: string | null; stage: string | null }

const STAGE_LABEL: Record<string, string> = { identified: 'Identified', reviewed: 'Reviewed', contacted: 'Contacted', replied: 'Replied', audit_sent: 'Audit sent', meeting: 'Meeting', agreed: 'Agreed', onboarded: 'Onboarded', declined: 'Declined', not_a_fit: 'Not a fit' };
const MODEL_LABEL: Record<string, string> = { undecided: 'Undecided', co_host_only: 'Co-Host only', co_host_and_manager: 'Co-Host + Manager' };
const MATCH_LABEL: Record<string, { text: string; cls: string }> = {
  unique: { text: 'Probable match', cls: 'bg-emerald-100 text-emerald-700' }, ambiguous: { text: '2-3 possible homes', cls: 'bg-amber-100 text-amber-700' },
  none_match: { text: 'No match', cls: 'bg-slate-100 text-slate-600' }, no_registry_nearby: { text: 'No license list here', cls: 'bg-slate-100 text-slate-600' }, too_many: { text: 'Too many possible', cls: 'bg-slate-100 text-slate-600' },
};
const money = (n: number | null) => (n == null ? '-' : `$${Math.round(n).toLocaleString()}`);

export default function CoHostView() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [crm, setCrm] = useState<CrmLead[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState('all');
  const [stage, setStage] = useState('all');
  const [view, setView] = useState<'matched' | 'all' | 'crm'>('matched');
  const [open, setOpen] = useState<string | null>(null);
  // Remembered between visits so a luxury-focused team lands on its niche every time.
  const [luxuryOnly, setLuxuryOnly] = useState(false);
  useEffect(() => { try { setLuxuryOnly(localStorage.getItem('cohost_luxury_only') === '1'); } catch { /* storage unavailable */ } }, []);
  const toggleLuxury = () => setLuxuryOnly(v => { const n = !v; try { localStorage.setItem('cohost_luxury_only', n ? '1' : '0'); } catch { /* storage unavailable */ } return n; });
  const [panels, setPanels] = useState<Record<string, OfferPanel>>({});
  const [copied, setCopied] = useState<string | null>(null);

  async function openOffer(propertyId: string) {
    if (panels[propertyId] && !panels[propertyId].error) { setPanels(p => { const { [propertyId]: _gone, ...rest } = p; return rest; }); return; }
    setPanels(p => ({ ...p, [propertyId]: { loading: true } }));
    try {
      const res = await fetch('/api/cohost/offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Could not create the link');
      setPanels(p => ({ ...p, [propertyId]: { loading: false, url: j.url, optedOut: j.optedOut, drafts: j.drafts } }));
    } catch (e) { setPanels(p => ({ ...p, [propertyId]: { loading: false, error: (e as Error).message } })); }
  }
  async function copy(key: string, text: string) { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard unavailable */ } }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cohost', { cache: 'no-store' }); const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load');
      setListings(j.listings ?? []); setCrm(j.crm ?? []); setStages(j.stages ?? []); setModels(j.serviceModels ?? []); setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function update(propertyId: string, patch: { stage?: string; serviceModel?: string; notes?: string }) {
    const before = listings;
    setListings(ls => ls.map(l => (l.property_id === propertyId ? { ...l, ...(patch.stage ? { pipeline_stage: patch.stage } : {}), ...(patch.serviceModel ? { service_model: patch.serviceModel } : {}), ...(patch.notes !== undefined ? { reviewer_notes: patch.notes } : {}) } : l)));
    const res = await fetch('/api/cohost', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, ...patch }) });
    if (!res.ok) { setListings(before); setError('Could not save that change.'); }
  }

  const markets = useMemo(() => ['all', ...[...new Set(listings.map(l => l.market))].sort()], [listings]);
  const base = useMemo(() => listings.filter(l => (market === 'all' || l.market === market) && (stage === 'all' || l.pipeline_stage === stage) && (view === 'all' || (view === 'matched' && ['unique', 'ambiguous'].includes(l.match_status ?? '')))), [listings, market, stage, view]);
  const luxuryCount = useMemo(() => base.filter(l => l.is_luxury).length, [base]);
  const shown = useMemo(() => base.filter(l => !luxuryOnly || l.is_luxury)
    .sort((a, b) => Number(b.match_status === 'unique') - Number(a.match_status === 'unique') || (b.under_score ?? 0) - (a.under_score ?? 0)), [base, luxuryOnly]);
  const counts = useMemo(() => stages.map(s => [s, listings.filter(l => l.pipeline_stage === s).length] as const), [stages, listings]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Handshake size={20} className="text-primary" /> Co-Host Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Owners who already run a listing on Airbnb, Vrbo, Vacasa or similar. We offer Co-Host only, or Co-Host and Manager.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-border bg-card text-sm hover:bg-muted"><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3 flex items-start gap-2.5">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <p><strong>Separate from the homeowner funnel.</strong> The text campaigns go only to homeowners we are converting to short-term rentals. Co-host owners are never texted by those campaigns or sequences. Review the match, then reach them with the offer page below by email, phone or mail.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 flex items-center gap-2"><AlertTriangle size={15} /> {error}</div>}

      <div className="flex flex-wrap gap-2">
        {counts.map(([s, n]) => <button key={s} onClick={() => setStage(stage === s ? 'all' : s)} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${stage === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-muted'}`}>{STAGE_LABEL[s] ?? s} <span className="opacity-70">{n}</span></button>)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-sm">
          {([['matched', 'Matched to a home'], ['all', 'All candidates'], ['crm', 'Already in CRM']] as const).map(([k, label]) => <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 ${view === k ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>{label}</button>)}
        </div>
        {view !== 'crm' && <button onClick={toggleLuxury} aria-pressed={luxuryOnly} title={luxuryOnly ? 'Showing luxury listings only. Click to show all.' : 'Show luxury listings only'} className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border text-sm font-bold tracking-wide transition-all ${luxuryOnly ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/30' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}><Gem size={14} /> LUXURY <span className={`px-1.5 rounded-full text-[11px] ${luxuryOnly ? 'bg-white/25' : 'bg-amber-200/70'}`}>{luxuryCount}</span></button>}
        {view !== 'crm' && <select value={market} onChange={e => setMarket(e.target.value)} className="h-9 rounded-lg border border-border bg-card px-3 text-sm" aria-label="Market">{markets.map(m => <option key={m} value={m}>{m === 'all' ? 'All markets' : m}</option>)}</select>}
        <span className="text-xs text-muted-foreground">{view === 'crm' ? `${crm.length} leads` : `${shown.length} listings${luxuryOnly ? ' (luxury)' : ''}`}</span>
      </div>

      {loading && <div className="py-16 flex justify-center text-muted-foreground"><Loader2 className="animate-spin" /></div>}

      {!loading && view === 'crm' && (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="p-3">Lead</th><th className="pr-3">Why they are here</th><th className="pr-3">Service</th><th>Moved</th></tr></thead>
            <tbody>{crm.length === 0 ? <tr><td className="p-4 text-muted-foreground" colSpan={4}>No leads have been moved to the co-host program yet.</td></tr> : crm.map(l => (
              <tr key={l.id} className="border-t border-border"><td className="p-3"><Link href={`/lead-profile?id=${l.id}`} className="text-primary hover:underline font-medium">{[l.address, l.city].filter(Boolean).join(', ') || l.id}</Link><div className="text-[11px] text-muted-foreground">{l.owner_name ?? 'Owner unknown'}</div></td>
                <td className="pr-3 text-xs text-muted-foreground">{l.program_reason}</td><td className="pr-3 text-xs">{MODEL_LABEL[l.cohost_service ?? 'undecided'] ?? l.cohost_service}</td><td className="text-xs text-muted-foreground">{l.program_set_at ? new Date(l.program_set_at).toLocaleDateString() : ''}</td></tr>))}</tbody></table>
        </div>
      )}

      {!loading && view !== 'crm' && (
        <div className="space-y-3">
          {shown.length === 0 && <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No listings match these filters.</div>}
          {shown.slice(0, 150).map(l => {
            const m = MATCH_LABEL[l.match_status ?? ''] ?? null; const o = l.matched_owner; const url = l.airbnb_url ?? l.vrbo_url ?? l.booking_url;
            return (
              <div key={l.property_id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground truncate max-w-xl">{l.title ?? l.property_id}</p>
                      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary" aria-label="Open the listing"><ExternalLink size={14} /></a>}
                      {m && <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.cls}`}>{m.text}</span>}
                      {l.segment === 'new_or_dormant' && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">New or dormant</span>}
                      {l.is_luxury && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1"><Gem size={10} /> Luxury</span>}
                      {l.offer?.requestedAt && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white">Audit requested</span>}
                      {l.offer?.optedOutAt && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">Opted out</span>}
                      {!!l.offer?.views && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-700 inline-flex items-center gap-1"><Eye size={10} /> Offer page viewed {l.offer.views}x</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{l.market} &middot; {l.bedrooms} bd / {l.bathrooms} ba &middot; {money(l.adr)} per night &middot; {l.occupancy_pct != null ? `${Math.round(l.occupancy_pct)}% occupied` : ''} &middot; {money(l.revenue_ltm)} earned of {money(l.revenue_potential_ltm)} potential &middot; {l.rating ?? '-'} ({l.reviews ?? 0} reviews){l.host_listing_count ? ` · host runs ${l.host_listing_count}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={l.pipeline_stage} onChange={e => update(l.property_id, { stage: e.target.value })} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" aria-label="Stage">{stages.map(s => <option key={s} value={s}>{STAGE_LABEL[s] ?? s}</option>)}</select>
                    <select value={l.service_model} onChange={e => update(l.property_id, { serviceModel: e.target.value })} className="h-8 rounded-lg border border-border bg-background px-2 text-xs" aria-label="Service">{models.map(s => <option key={s} value={s}>{MODEL_LABEL[s] ?? s}</option>)}</select>
                  </div>
                </div>

                {(l.under_reasons?.length ?? 0) > 0 && <p className="text-xs text-foreground mt-2.5"><span className="font-semibold">Why flagged:</span> {l.under_reasons!.join('; ')}.</p>}
                {l.photo_score != null && <p className="text-xs text-foreground mt-1.5 flex items-start gap-1.5"><Camera size={13} className="mt-0.5 shrink-0 text-muted-foreground" /><span><span className="font-semibold">Photos {l.photo_score}/100</span>{l.photo_notes?.looksDated ? ', look dated' : ''}{l.photo_notes?.missingShots?.length ? `. Missing: ${l.photo_notes.missingShots.slice(0, 3).join(', ')}` : ''}{l.photo_notes?.fixes?.[0] ? `. First fix: ${l.photo_notes.fixes[0]}` : ''}</span></p>}
                {l.matched_address && o && (
                  <div className="mt-2.5 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                    <p className="flex items-center gap-1.5"><MapPin size={13} className="text-muted-foreground" /><span><span className="font-semibold">Probable home:</span> {l.matched_address.replace(/, US.*$/, '')}</span></p>
                    <p className="mt-1">Owner of record: <span className="font-medium">{o.names.join(' & ') || 'not on record'}</span>{o.type ? ` (${o.type.toLowerCase()})` : ''}{o.mailing ? `, mail goes to ${o.mailing}` : ''}</p>
                    {o.contactFound && <p className="mt-1">Contact found and matched to that mailing address: {[...o.phones, ...o.emails].join(', ')}</p>}
                    <p className="mt-1 text-muted-foreground">This match comes from location, license records and bedroom count. Confirm it before contacting anyone.</p>
                  </div>
                )}
                <button onClick={() => setOpen(open === l.property_id ? null : l.property_id)} className="mt-2 text-xs text-primary hover:underline">{open === l.property_id ? 'Hide notes' : 'Notes'}</button>
                <button onClick={() => openOffer(l.property_id)} className="mt-2 ml-4 text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"><Link2 size={12} /> {panels[l.property_id] && !panels[l.property_id].error ? 'Hide offer page' : 'Offer page and message drafts'}</button>
                {l.offer?.request && (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    <p className="font-semibold">Audit request{l.offer.request.at ? ` on ${new Date(l.offer.request.at).toLocaleDateString()}` : ''}: {l.offer.request.name}</p>
                    <p className="mt-0.5">{[l.offer.request.email, l.offer.request.phone].filter(Boolean).join(' · ') || 'No contact given'}{l.offer.request.service && l.offer.request.service !== 'not_sure' ? ` · wants ${MODEL_LABEL[l.offer.request.service] ?? l.offer.request.service}` : ''}</p>
                    {l.offer.request.message && <p className="mt-0.5 text-emerald-800">&ldquo;{l.offer.request.message}&rdquo;</p>}
                  </div>
                )}
                {panels[l.property_id] && (
                  <div className="mt-2 rounded-xl border border-border bg-muted/40 p-3 space-y-3">
                    {panels[l.property_id].loading && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Creating the link...</p>}
                    {panels[l.property_id].error && <p className="text-xs text-red-600">{panels[l.property_id].error}</p>}
                    {panels[l.property_id].url && panels[l.property_id].drafts && (() => {
                      const p = panels[l.property_id]; const d = p.drafts!; const pub = l.matched_owner?.published?.email ?? l.matched_owner?.emails?.[0] ?? null;
                      return (
                        <>
                          {p.optedOut && <p className="text-xs font-semibold text-rose-700">This owner opted out on the offer page. Do not contact them about this listing.</p>}
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="text-xs bg-background border border-border rounded px-2 py-1 break-all">{p.url}</code>
                            <button onClick={() => copy(`${l.property_id}:url`, p.url!)} className="h-7 px-2 rounded border border-border bg-card text-xs inline-flex items-center gap-1 hover:bg-muted">{copied === `${l.property_id}:url` ? <Check size={12} /> : <Copy size={12} />} Copy link</button>
                            <a href={p.url} target="_blank" rel="noopener noreferrer" className="h-7 px-2 rounded border border-border bg-card text-xs inline-flex items-center gap-1 hover:bg-muted"><ExternalLink size={12} /> Preview page</a>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Email draft</p>
                            <p className="text-xs font-medium">Subject: {d.subject}</p>
                            <pre className="mt-1 text-xs whitespace-pre-wrap font-sans bg-background border border-border rounded-lg p-2">{d.email}</pre>
                            <div className="mt-1.5 flex flex-wrap gap-2">
                              <button onClick={() => copy(`${l.property_id}:email`, `Subject: ${d.subject}\n\n${d.email}`)} className="h-7 px-2 rounded border border-border bg-card text-xs inline-flex items-center gap-1 hover:bg-muted">{copied === `${l.property_id}:email` ? <Check size={12} /> : <Copy size={12} />} Copy email</button>
                              {pub && !p.optedOut && <a href={`mailto:${pub}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.email)}`} className="h-7 px-2 rounded border border-border bg-card text-xs inline-flex items-center gap-1 hover:bg-muted"><Mail size={12} /> Open in email app ({pub})</a>}
                            </div>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Text draft</p>
                            <pre className="text-xs whitespace-pre-wrap font-sans bg-background border border-border rounded-lg p-2">{d.sms}</pre>
                            <button onClick={() => copy(`${l.property_id}:sms`, d.sms)} className="mt-1.5 h-7 px-2 rounded border border-border bg-card text-xs inline-flex items-center gap-1 hover:bg-muted">{copied === `${l.property_id}:sms` ? <Check size={12} /> : <Copy size={12} />} Copy text</button>
                            <p className="mt-1 text-[11px] text-muted-foreground">The app does not send texts to co-host owners. Use this draft only where you have a lawful basis to text that person, and honor any opt-out.</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
                {open === l.property_id && <textarea defaultValue={l.reviewer_notes ?? ''} onBlur={e => e.target.value !== (l.reviewer_notes ?? '') && update(l.property_id, { notes: e.target.value })} placeholder="Review notes (saved when you click away)" rows={3} className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm" />}
              </div>
            );
          })}
          {shown.length > 150 && <p className="text-xs text-muted-foreground">Showing the first 150. Narrow by market or stage to see the rest.</p>}
        </div>
      )}
    </div>
  );
}
