'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Handshake, Loader2, RefreshCw, Download, ShieldAlert, ExternalLink, Camera, MapPin, AlertTriangle, Gem, Crown, Link2, Copy, Check, Mail, Eye, MessageSquare, ShieldCheck, Clock } from 'lucide-react';
import type { OwnerVerification, VerificationLevel } from '@/lib/services/ownerVerification';
import NicheFilter, { type NicheCounts } from '@/components/niche/NicheFilter';
import SelectBox from '@/components/ui/SelectBox';
import { nicheName, nichePriority } from '@/lib/niches';

interface Owner { names: string[]; type: string | null; mailing: string | null; permitHolder: string | null; contactFound: boolean; skipTraced?: boolean; phones: string[]; emails: string[]; published?: { email: string | null; phone: string | null } | null }
interface OfferInfo { code: string; views: number; lastViewedAt: string | null; requestedAt: string | null; optedOutAt: string | null; request: { name?: string; email?: string | null; phone?: string | null; service?: string; message?: string | null; at?: string } | null }
interface HostPhone { e164: string; source: 'skip_trace' | 'permit_office'; type: string | null; name: string | null }
interface ThreadMsg { direction: 'outbound' | 'inbound'; phone_e164: string; body: string; status: string | null; intent: string | null; created_at: string }
interface OfferPanel { loading: boolean; error?: string; url?: string; optedOut?: boolean; drafts?: { subject: string; email: string; sms: string }; phones?: HostPhone[]; thread?: ThreadMsg[] }
interface Listing {
  property_id: string; market: string; title: string | null; airbnb_url: string | null; vrbo_url: string | null; booking_url: string | null; bedrooms: number | null; bathrooms: number | null;
  adr: number | null; occupancy_pct: number | null; revenue_ltm: number | null; revenue_potential_ltm: number | null; rating: number | null; reviews: number | null; host_listing_count: number | null;
  is_luxury: boolean | null; is_elite?: boolean | null; first_seen_at?: string | null; dataQuality?: { reliable: boolean; bookedNights: number; reasons: string[] }; niches?: number[] | null; primary_niche?: number | null; verification?: OwnerVerification; under_score: number | null; under_reasons: string[] | null; segment: string; photo_score: number | null; photo_notes: { hero?: string; fixes?: string[]; missingShots?: string[]; looksDated?: boolean; complete?: boolean; photosReviewed?: number; of?: number; unreachable?: number; reason?: string } | null;
  address_match_confidence: string | null; match_status: string | null; matched_address: string | null; matched_owner: Owner | null; pipeline_stage: string; service_model: string; reviewer_notes: string | null; offer?: OfferInfo | null; texts?: { sent: number; replied: boolean; lastIntent: string | null; lastAt: string } | null;
}
interface CrmLead { id: string; address: string | null; city: string | null; state: string | null; owner_name: string | null; program_reason: string | null; program_set_at: string | null; cohost_service: string | null; stage: string | null }

const STAGE_LABEL: Record<string, string> = { identified: 'Identified', reviewed: 'Reviewed', contacted: 'Contacted', replied: 'Replied', audit_sent: 'Audit sent', meeting: 'Meeting', agreed: 'Agreed', onboarded: 'Onboarded', declined: 'Declined', not_a_fit: 'Not a fit' };
const MODEL_LABEL: Record<string, string> = { undecided: 'Undecided', co_host_only: 'Co-Host only', co_host_and_manager: 'Co-Host + Manager' };
const MATCH_LABEL: Record<string, { text: string; cls: string }> = {
  unique: { text: 'Probable match', cls: 'bg-emerald-100 text-emerald-700' }, ambiguous: { text: '2-3 possible homes', cls: 'bg-amber-100 text-amber-700' },
  none_match: { text: 'No match', cls: 'bg-slate-100 text-slate-600' }, no_registry_nearby: { text: 'No license list here', cls: 'bg-slate-100 text-slate-600' }, too_many: { text: 'Too many possible', cls: 'bg-slate-100 text-slate-600' },
};
const money = (n: number | null) => (n == null ? '-' : `$${Math.round(n).toLocaleString()}`);

interface RefreshInfo { lastRun: { started_at: string; finished_at: string | null; status: string; trigger: string; api_calls: number; new_listings: number; new_matches: number; quota_remaining: number | null; note: string | null; markets: number } | null; markets: number; oldestRefresh: string | null; firstRunAt: string | null; intervalHours: number }
type SortKey = 'best' | 'potential_desc' | 'potential_asc' | 'earned_desc' | 'newest' | 'niche_priority';
const SORTS: Array<[SortKey, string]> = [['best', 'Best match first'], ['potential_desc', 'Potential earnings: high to low'], ['potential_asc', 'Potential earnings: low to high'], ['earned_desc', 'Earned last 12 months: high to low'], ['newest', 'Newest listings'], ['niche_priority', 'Niche priority (national ranking)']];
const LEVEL_STYLE: Record<VerificationLevel, string> = {
  verified: 'bg-emerald-600 text-white', likely: 'bg-teal-100 text-teal-800', unconfirmed: 'bg-amber-100 text-amber-800', review: 'bg-amber-100 text-amber-800',
  conflict: 'bg-rose-600 text-white', no_match: 'bg-slate-100 text-slate-600', pending: 'bg-slate-100 text-slate-600',
};
const CHECK_STYLE: Record<string, string> = { pass: 'text-emerald-700', warn: 'text-amber-700', fail: 'text-rose-700', info: 'text-muted-foreground', pending: 'text-muted-foreground' };
const CHECK_MARK: Record<string, string> = { pass: '\u2713', warn: '!', fail: '\u2717', info: 'i', pending: '\u2026' };
const ago = (iso: string) => { const h = (Date.now() - Date.parse(iso)) / 3_600_000; return h < 1 ? 'under an hour ago' : h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`; };

const fmtPhone = (e: string) => e.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3');

function TextComposer({ propertyId, sms, phones, thread, blocked, onSent }: { propertyId: string; sms: string; phones: HostPhone[]; thread: ThreadMsg[]; blocked: boolean; onSent: (t: ThreadMsg[]) => void }) {
  const [to, setTo] = useState(phones[0]?.e164 ?? '');
  const [body, setBody] = useState(sms);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/cohost/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, to, body, confirmed }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Could not send');
      setConfirmed(false); onSent(j.thread ?? []);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Text this owner</p>
      {thread.length > 0 && (
        <ul className="mb-2 space-y-1.5 max-h-48 overflow-y-auto">{thread.map((m, i) => (
          <li key={i} className={`text-xs rounded-lg px-2.5 py-1.5 max-w-[85%] whitespace-pre-wrap ${m.direction === 'outbound' ? 'bg-blue-600 text-white ml-auto' : 'bg-card border border-border text-foreground'}`}>{m.body}<span className="block text-[10px] opacity-70 mt-0.5">{m.direction === 'outbound' ? 'Sent' : 'Reply'} {fmtPhone(m.phone_e164)} &middot; {new Date(m.created_at).toLocaleString()}</span></li>))}</ul>
      )}
      {blocked ? <p className="text-xs font-semibold text-rose-700">Texting is off for this prospect (opted out, declined or not a fit).</p> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {phones.length > 0 && <SelectBox dense value={phones.some(p => p.e164 === to) ? to : ''} onChange={e => setTo(e.target.value)} aria-label="Phone number">{!phones.some(p => p.e164 === to) && <option value="">Choose a number</option>}{phones.map(p => <option key={p.e164} value={p.e164}>{fmtPhone(p.e164)} &middot; {p.source === 'permit_office' ? 'published by the permit office' : `skip trace${p.type ? ` (${p.type})` : ''}`}</option>)}</SelectBox>}
            <input value={phones.some(p => p.e164 === to) ? '' : to} onChange={e => setTo(e.target.value)} placeholder={phones.length ? 'Or type a number' : 'Phone number'} className="h-8 w-44 rounded-lg border border-border bg-background px-2 text-xs" aria-label="Other phone number" />
          </div>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={600} className="w-full rounded-lg border border-border bg-background p-2 text-xs" aria-label="Text message" />
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5" /><span>I confirmed this number belongs to the owner of this listing. I understand a text goes out immediately, only between 9am and 8pm their time, and that STOP replies are honored automatically.</span></label>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button onClick={send} disabled={busy || !confirmed || !to} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">{busy ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />} Send text</button>
        </div>
      )}
    </div>
  );
}

export default function CoHostView() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [crm, setCrm] = useState<CrmLead[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState('all');
  const [usState, setUsState] = useState('all');
  const [stage, setStage] = useState('all');
  const [view, setView] = useState<'matched' | 'all' | 'crm'>('all');
  const [open, setOpen] = useState<string | null>(null);
  // Remembered between visits so a luxury-focused team lands on its niche every time.
  const [luxuryOnly, setLuxuryOnly] = useState(false);
  useEffect(() => { try { setLuxuryOnly(localStorage.getItem('cohost_luxury_only') === '1'); } catch { /* storage unavailable */ } }, []);
  const toggleLuxury = () => setLuxuryOnly(v => { const n = !v; try { localStorage.setItem('cohost_luxury_only', n ? '1' : '0'); } catch { /* storage unavailable */ } return n; });
  const [eliteOnly, setEliteOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('best');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  useEffect(() => { try { setEliteOnly(localStorage.getItem('cohost_elite_only') === '1'); const s = localStorage.getItem('cohost_sort') as SortKey | null; if (s && SORTS.some(x => x[0] === s)) setSort(s); } catch { /* storage unavailable */ } }, []);
  const toggleElite = () => setEliteOnly(v => { const n = !v; try { localStorage.setItem('cohost_elite_only', n ? '1' : '0'); } catch { /* storage unavailable */ } return n; });
  const changeSort = (s: SortKey) => { setSort(s); try { localStorage.setItem('cohost_sort', s); } catch { /* storage unavailable */ } };
  const [totals, setTotals] = useState<{ all: number; luxury: number; elite: number } | null>(null);
  const [refresh, setRefresh] = useState<RefreshInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyErr, setVerifyErr] = useState<Record<string, string>>({});
  const [checksOpen, setChecksOpen] = useState<string | null>(null);
  const [niches, setNiches] = useState<number[]>([]);
  const [nicheCounts, setNicheCounts] = useState<NicheCounts>({});
  const [panels, setPanels] = useState<Record<string, OfferPanel>>({});
  const [copied, setCopied] = useState<string | null>(null);

  async function openOffer(propertyId: string) {
    if (panels[propertyId] && !panels[propertyId].error) { setPanels(p => { const { [propertyId]: _gone, ...rest } = p; return rest; }); return; }
    setPanels(p => ({ ...p, [propertyId]: { loading: true } }));
    try {
      const res = await fetch('/api/cohost/offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Could not create the link');
      setPanels(p => ({ ...p, [propertyId]: { loading: false, url: j.url, optedOut: j.optedOut, drafts: j.drafts, phones: j.phones ?? [], thread: j.thread ?? [] } }));
    } catch (e) { setPanels(p => ({ ...p, [propertyId]: { loading: false, error: (e as Error).message } })); }
  }
  async function copy(key: string, text: string) { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard unavailable */ } }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cohost${niches.length ? `?niche=${niches.join(',')}` : ''}`, { cache: 'no-store' }); const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load');
      setListings(j.listings ?? []); setCrm(j.crm ?? []); setStages(j.stages ?? []); setModels(j.serviceModels ?? []); setTotals(j.totals ?? null); setRefresh(j.refresh ?? null); setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [niches]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let live = true;
    fetch(`/api/cohost/niches?state=${encodeURIComponent(usState)}&market=${encodeURIComponent(market)}`, { cache: 'no-store' }).then(r => r.json()).then(j => { if (live && j.counts) setNicheCounts(j.counts); }).catch(() => { /* counts are optional */ });
    return () => { live = false; };
  }, [usState, market]);

  async function refreshNow() {
    setRefreshing(true); setError(null);
    try {
      const res = await fetch('/api/cohost/refresh', { method: 'POST' }); const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.note || 'The refresh failed');
      if (j.status === 'skipped') setError(j.note || 'A refresh is already running.');
      await load();
    } catch (e) { setError((e as Error).message); } finally { setRefreshing(false); }
  }
  async function crossCheck(propertyId: string) {
    setVerifying(propertyId); setVerifyErr(v => { const { [propertyId]: _x, ...rest } = v; return rest; });
    try {
      const res = await fetch('/api/cohost/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'The cross-check failed');
      setListings(ls => ls.map(l => (l.property_id === propertyId ? { ...l, verification: j.verification } : l))); setChecksOpen(propertyId);
    } catch (e) { setVerifyErr(v => ({ ...v, [propertyId]: (e as Error).message })); } finally { setVerifying(null); }
  }

  async function update(propertyId: string, patch: { stage?: string; serviceModel?: string; notes?: string }) {
    const before = listings;
    setListings(ls => ls.map(l => (l.property_id === propertyId ? { ...l, ...(patch.stage ? { pipeline_stage: patch.stage } : {}), ...(patch.serviceModel ? { service_model: patch.serviceModel } : {}), ...(patch.notes !== undefined ? { reviewer_notes: patch.notes } : {}) } : l)));
    const res = await fetch('/api/cohost', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, ...patch }) });
    if (!res.ok) { setListings(before); setError('Could not save that change.'); }
  }

  const stateOf = (m: string) => m.split(',').pop()?.trim().toUpperCase() ?? '';
  const states = useMemo(() => ['all', ...[...new Set(listings.map(l => stateOf(l.market)).filter(Boolean))].sort()], [listings]);
  const markets = useMemo(() => ['all', ...[...new Set(listings.map(l => l.market).filter(m => usState === 'all' || stateOf(m) === usState))].sort()], [listings, usState]);
  const base = useMemo(() => listings.filter(l => (usState === 'all' || stateOf(l.market) === usState) && (market === 'all' || l.market === market) && (stage === 'all' || l.pipeline_stage === stage) && (!niches.length || (l.niches ?? []).some(n => niches.includes(n))) && (view === 'all' || (view === 'matched' && ['unique', 'ambiguous'].includes(l.match_status ?? '')))), [listings, usState, market, stage, view, niches]);
  const luxuryCount = useMemo(() => base.filter(l => l.is_luxury).length, [base]);
  const eliteCount = useMemo(() => base.filter(l => l.is_elite).length, [base]);
  const verifiedCount = useMemo(() => base.filter(l => l.verification?.level === 'verified').length, [base]);
  const shown = useMemo(() => {
    const pot = (l: Listing) => (l.dataQuality?.reliable === false ? -1 : l.revenue_potential_ltm ?? -1);
    const cmp: Record<SortKey, (a: Listing, b: Listing) => number> = {
      best: (a, b) => Number(b.match_status === 'unique') - Number(a.match_status === 'unique') || (b.under_score ?? 0) - (a.under_score ?? 0),
      potential_desc: (a, b) => pot(b) - pot(a), potential_asc: (a, b) => (pot(a) < 0 ? Infinity : pot(a)) - (pot(b) < 0 ? Infinity : pot(b)),
      earned_desc: (a, b) => (b.dataQuality?.reliable === false ? -1 : b.revenue_ltm ?? -1) - (a.dataQuality?.reliable === false ? -1 : a.revenue_ltm ?? -1), newest: (a, b) => Date.parse(b.first_seen_at ?? '') - Date.parse(a.first_seen_at ?? ''),
      niche_priority: (a, b) => nichePriority(a.niches) - nichePriority(b.niches) || pot(b) - pot(a),
    };
    return base.filter(l => (!luxuryOnly || l.is_luxury) && (!eliteOnly || l.is_elite) && (!verifiedOnly || l.verification?.level === 'verified')).sort(cmp[sort]);
  }, [base, luxuryOnly, eliteOnly, verifiedOnly, sort]);
  const counts = useMemo(() => stages.map(s => [s, listings.filter(l => l.pipeline_stage === s).length] as const), [stages, listings]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Handshake size={20} className="text-primary" /> Co-Host Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Owners who already run a listing on Airbnb, Vrbo, Vacasa or similar. We offer Co-Host only, or Co-Host and Manager.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshNow} disabled={refreshing} title="Pull fresh listings now for the markets that are furthest behind" className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-border bg-card text-sm hover:bg-muted disabled:opacity-60">{refreshing ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />} {refreshing ? 'Finding new listings...' : 'Find new listings now'}</button>
          <button onClick={load} className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-border bg-card text-sm hover:bg-muted"><RefreshCw size={14} /> Reload</button>
        </div>
      </div>

      {refresh && (
        <p className="text-xs text-muted-foreground -mt-2">
          Listings refresh automatically every {refresh.intervalHours} hours across {refresh.markets} markets in every state except California, a few markets at a time so the data allowance lasts the month.
          {refresh.lastRun ? ` Last run ${ago(refresh.lastRun.started_at)}: ${refresh.lastRun.new_listings} new listings, ${refresh.lastRun.new_matches} new owner matches${refresh.lastRun.status !== 'ok' ? ` (${refresh.lastRun.note ?? refresh.lastRun.status})` : ''}.` : ' No automatic run has happened yet.'}
          {refresh.oldestRefresh ? ` The longest-waiting market was last refreshed ${ago(refresh.oldestRefresh)}.` : ''}
        </p>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3 flex items-start gap-2.5">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <p><strong>Separate from the homeowner funnel.</strong> The text campaigns go only to homeowners we are converting to short-term rentals. Co-host owners are never included in those campaigns or sequences. Review the match, then reach them one at a time with the offer page: by email, phone, mail or a text you send from the card.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 flex items-center gap-2"><AlertTriangle size={15} /> {error}</div>}

      <div className="flex flex-wrap gap-2">
        {counts.map(([s, n]) => <button key={s} onClick={() => setStage(stage === s ? 'all' : s)} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${stage === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-muted'}`}>{STAGE_LABEL[s] ?? s} <span className="font-bold tabular-nums">{n}</span></button>)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-sm">
          {([['all', 'All candidates'], ['matched', 'Matched to a home'], ['crm', 'Already in CRM']] as const).map(([k, label]) => <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 ${view === k ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>{label}</button>)}
        </div>
        {view !== 'crm' && <button onClick={toggleLuxury} aria-pressed={luxuryOnly} title={luxuryOnly ? 'Showing luxury listings only. Click to show all.' : 'Show luxury listings only: $1,000 a night and up (ELITE, $4,995 and up, is included)'} className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border text-sm font-bold tracking-wide transition-all ${luxuryOnly ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/30' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}><Gem size={14} /> LUXURY <span className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${luxuryOnly ? 'bg-[#ffffff] text-[#92400e]' : 'bg-[#b45309] text-white'}`}>{luxuryCount}</span></button>}
        {view !== 'crm' && <button onClick={toggleElite} aria-pressed={eliteOnly} title={eliteOnly ? 'Showing ELITE listings only. Click to show all.' : 'Show ultra-luxury listings only: $4,995 a night and up'} className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg border text-sm font-bold tracking-wide transition-all ${eliteOnly ? 'bg-slate-900 border-slate-900 text-amber-300 shadow-md shadow-slate-900/30' : 'border-slate-400 bg-slate-100 text-slate-800 hover:bg-slate-200'}`}><Crown size={14} /> ELITE <span className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${eliteOnly ? 'bg-[#fcd34d] text-[#0f172a]' : 'bg-[#334155] text-white'}`}>{eliteCount}</span></button>}
        {view !== 'crm' && <button onClick={() => setVerifiedOnly(v => !v)} aria-pressed={verifiedOnly} title="Show only owners confirmed by two independent sources" className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border text-sm font-semibold ${verifiedOnly ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}><ShieldCheck size={14} /> Verified owner <span className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${verifiedOnly ? 'bg-[#ffffff] text-[#065f46]' : 'bg-[#047857] text-white'}`}>{verifiedCount}</span></button>}
        {view !== 'crm' && <SelectBox value={usState} onChange={e => { setUsState(e.target.value); setMarket('all'); }} aria-label="State">{states.map(s => <option key={s} value={s}>{s === 'all' ? 'All states' : s}</option>)}</SelectBox>}
        {view !== 'crm' && <SelectBox value={market} onChange={e => setMarket(e.target.value)} aria-label="Market">{markets.map(m => <option key={m} value={m}>{m === 'all' ? 'All markets' : m}</option>)}</SelectBox>}
        {view !== 'crm' && <SelectBox value={sort} onChange={e => changeSort(e.target.value as SortKey)} aria-label="Sort">{SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</SelectBox>}
        <span className="text-xs text-muted-foreground">{view === 'crm' ? `${crm.length} leads` : `${shown.length} listings${eliteOnly ? ' (elite)' : luxuryOnly ? ' (luxury)' : ''}${totals && view === 'all' ? ` shown of ${totals.all.toLocaleString()} candidates nationwide (the strongest by each ranking)` : ''}`}</span>
      </div>

      {view !== 'crm' && <NicheFilter value={niches} onChange={setNiches} counts={nicheCounts} />}

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
                      {l.is_elite && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 text-amber-300 inline-flex items-center gap-1"><Crown size={10} /> Elite</span>}
                      {refresh?.firstRunAt && l.first_seen_at && l.first_seen_at >= refresh.firstRunAt && Date.now() - Date.parse(l.first_seen_at) < 7 * 86_400_000 && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-600 text-white">New {ago(l.first_seen_at)}</span>}
                      {l.verification && ['verified', 'likely', 'conflict'].includes(l.verification.level) && <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${LEVEL_STYLE[l.verification.level]}`}><ShieldCheck size={10} /> {l.verification.label}</span>}
                      {l.offer?.requestedAt && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white">Audit requested</span>}
                      {!!l.texts?.sent && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-700">Texted {l.texts.sent}x{l.texts.replied ? ', replied' : ''}</span>}
                      {l.offer?.optedOutAt && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">Opted out</span>}
                      {!!l.offer?.views && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-700 inline-flex items-center gap-1"><Eye size={10} /> Offer page viewed {l.offer.views}x</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{l.market} &middot; {l.bedrooms} bd / {l.bathrooms} ba &middot; {l.dataQuality?.reliable === false
                      ? <span className="font-semibold text-amber-600 dark:text-amber-400">Not enough booking history to quote earnings ({l.dataQuality.reasons.join(', ')})</span>
                      : <>{money(l.adr)} per night &middot; {l.occupancy_pct != null ? `${Math.round(l.occupancy_pct)}% occupied` : ''} &middot; {money(l.revenue_ltm)} earned of <span className="font-semibold text-foreground">{money(l.revenue_potential_ltm)} potential</span></>} &middot; {l.rating ?? '-'} ({l.reviews ?? 0} reviews){l.host_listing_count ? ` · host runs ${l.host_listing_count}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SelectBox dense value={l.pipeline_stage} onChange={e => update(l.property_id, { stage: e.target.value })} aria-label="Stage">{stages.map(s => <option key={s} value={s}>{STAGE_LABEL[s] ?? s}</option>)}</SelectBox>
                    <SelectBox dense value={l.service_model} onChange={e => update(l.property_id, { serviceModel: e.target.value })} aria-label="Service">{models.map(s => <option key={s} value={s}>{MODEL_LABEL[s] ?? s}</option>)}</SelectBox>
                  </div>
                </div>

                {(l.niches?.length ?? 0) > 0 && (
                  <p className="text-xs mt-1.5 flex flex-wrap items-center gap-1.5">
                    {l.primary_niche != null && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-600 text-white">{nicheName(l.primary_niche)}</span>}
                    {l.niches!.filter(n => n !== l.primary_niche).slice(0, 4).map(n => <button key={n} onClick={() => setNiches(v => (v.includes(n) ? v : [...v, n]))} title="Filter by this niche" className="px-2 py-0.5 rounded-full text-[11px] bg-violet-100 text-violet-800 hover:bg-violet-200">{nicheName(n)}</button>)}
                    {l.niches!.length > 5 && <span className="text-[11px] text-muted-foreground">+{l.niches!.length - 5} more</span>}
                  </p>
                )}
                {(l.under_reasons?.length ?? 0) > 0 && <p className="text-xs text-foreground mt-2.5"><span className="font-semibold">Why flagged:</span> {l.under_reasons!.join('; ')}.</p>}
                {l.photo_score != null && l.photo_notes?.complete && <p className="text-xs text-foreground mt-1.5 flex items-start gap-1.5"><Camera size={13} className="mt-0.5 shrink-0 text-muted-foreground" /><span><span className="font-semibold">Photos {l.photo_score}/100</span> <span className="text-muted-foreground">(all {l.photo_notes.photosReviewed} reviewed{l.photo_notes.unreachable ? `, ${l.photo_notes.unreachable} could not load` : ''})</span>{l.photo_notes?.looksDated ? ', look dated' : ''}{l.photo_notes?.missingShots?.length ? `. Missing: ${l.photo_notes.missingShots.slice(0, 3).join(', ')}` : ''}{l.photo_notes?.fixes?.[0] ? `. First fix: ${l.photo_notes.fixes[0]}` : ''}</span></p>}
                {l.photo_score != null && !l.photo_notes?.complete && <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5"><Camera size={13} className="mt-0.5 shrink-0" /><span>Photo score {l.photo_score}/100 came from a sample of the photos, so its &ldquo;missing&rdquo; notes are not reliable. A full review of every photo is queued.</span></p>}
                {l.photo_score == null && l.photo_notes?.complete === false && <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5"><Camera size={13} className="mt-0.5 shrink-0" /><span>Photos not scored: {l.photo_notes.reason ?? 'they could not all be loaded'}.</span></p>}
                {l.matched_address && o && (
                  <div className="mt-2.5 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                    <p className="flex items-center gap-1.5"><MapPin size={13} className="text-muted-foreground" /><span><span className="font-semibold">Probable home:</span> {l.matched_address.replace(/, US.*$/, '')}</span></p>
                    <p className="mt-1">Owner of record: <span className="font-medium">{o.names.join(' & ') || 'not on record'}</span>{o.type ? ` (${o.type.toLowerCase()})` : ''}{o.mailing ? `, mail goes to ${o.mailing}` : ''}</p>
                    {o.contactFound && <p className="mt-1">Contact found and matched to that mailing address: {[...o.phones, ...o.emails].join(', ')}</p>}
                    {l.verification && (() => {
                      const v = l.verification; const canRun = v.checks.some(c => c.id === 'skiptrace' && c.status === 'pending') && l.match_status === 'unique';
                      return (
                        <div className="mt-2 rounded-lg border border-border bg-background px-2.5 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${LEVEL_STYLE[v.level]}`}><ShieldCheck size={10} /> {v.label}</span>
                            <span className="text-muted-foreground">{v.summary}</span>
                            <button onClick={() => setChecksOpen(checksOpen === l.property_id ? null : l.property_id)} className="text-primary hover:underline">{checksOpen === l.property_id ? 'Hide checks' : `Show ${v.checks.length} checks`}</button>
                            {canRun && <button onClick={() => crossCheck(l.property_id)} disabled={verifying === l.property_id} className="h-7 px-2 rounded border border-border bg-card font-semibold inline-flex items-center gap-1 hover:bg-muted disabled:opacity-60">{verifying === l.property_id ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Run skip-trace cross-check</button>}
                          </div>
                          {verifyErr[l.property_id] && <p className="mt-1 text-red-600">{verifyErr[l.property_id]}</p>}
                          {checksOpen === l.property_id && (
                            <ul className="mt-1.5 space-y-1">{v.checks.map(c => <li key={c.id} className="flex gap-2"><span className={`w-4 shrink-0 text-center font-bold ${CHECK_STYLE[c.status]}`} aria-label={c.status}>{CHECK_MARK[c.status]}</span><span><span className="font-medium">{c.label}.</span> <span className="text-muted-foreground">{c.detail}</span></span></li>)}</ul>
                          )}
                          {v.nextStep && <p className="mt-1 text-muted-foreground">Next: {v.nextStep}</p>}
                        </div>
                      );
                    })()}
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
                          <TextComposer propertyId={l.property_id} sms={d.sms} phones={p.phones ?? []} thread={p.thread ?? []} blocked={!!p.optedOut || ['declined', 'not_a_fit'].includes(l.pipeline_stage)}
                            onSent={thread => { setPanels(x => ({ ...x, [l.property_id]: { ...x[l.property_id], thread } })); load(); }} />
                        </>
                      );
                    })()}
                  </div>
                )}
                {open === l.property_id && <textarea defaultValue={l.reviewer_notes ?? ''} onBlur={e => e.target.value !== (l.reviewer_notes ?? '') && update(l.property_id, { notes: e.target.value })} placeholder="Review notes (saved when you click away)" rows={3} className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm" />}
              </div>
            );
          })}
          {shown.length > 150 && <p className="text-xs text-muted-foreground">Showing the first 150 of {shown.length}. Narrow by state, market or stage to see the rest.</p>}
        </div>
      )}
    </div>
  );
}
