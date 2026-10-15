'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowUpRight, Bot, Clock, ExternalLink, FileText, Flame, Home, Layers, Mail, MapPin, MessageSquare, MousePointerClick, Phone, RefreshCw, Send, ShieldCheck, StickyNote, User } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import StageBadge from '@/components/ui/StageBadge';
import LeadPicker from '@/app/lead-profile/components/LeadPicker';
import { authFetch } from '@/lib/authFetch';
import { normalizeLeadStage } from '@/lib/leadStage';
import type { LeadRecordData, RecordCall, TimelineEvent, TimelineKind } from '@/lib/leadRecordTypes';

const STAGES = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live', 'Not a Fit'];
type Tab = 'all' | 'messages' | 'calls' | 'notes';

const KIND_STYLE: Record<TimelineKind, { icon: React.ElementType; chip: string; label: string }> = {
  call: { icon: Phone, chip: 'bg-emerald-500/10 text-emerald-600', label: 'Call' },
  sms: { icon: MessageSquare, chip: 'bg-sky-500/10 text-sky-600', label: 'Text' },
  email: { icon: Mail, chip: 'bg-violet-500/10 text-violet-600', label: 'Email' },
  note: { icon: StickyNote, chip: 'bg-amber-500/10 text-amber-600', label: 'Note' },
  stage: { icon: Layers, chip: 'bg-primary/10 text-primary', label: 'Stage' },
  engagement: { icon: MousePointerClick, chip: 'bg-rose-500/10 text-rose-600', label: 'Estimate' },
  system: { icon: Bot, chip: 'bg-muted text-muted-foreground', label: 'System' },
};

const TAB_KINDS: Record<Tab, TimelineKind[] | null> = { all: null, messages: ['sms', 'email', 'engagement'], calls: ['call'], notes: ['note', 'stage'] };

function when(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}
function ago(iso: string | null) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}
function mmss(s: number | null) { return s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`; }

export default function LeadRecordContent() {
  const leadId = useSearchParams().get('id');
  const [data, setData] = useState<LeadRecordData | null>(null);
  const [loading, setLoading] = useState(!!leadId);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [openCall, setOpenCall] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!leadId) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/leads/timeline?leadId=${encodeURIComponent(leadId)}`);
      if (res.status === 404) { setNotFound(true); setData(null); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load this lead');
      setNotFound(false);
      setData(json as LeadRecordData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this lead');
    } finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { setData(null); setNotFound(false); setTab('all'); setNote(''); setOpenCall(null); if (leadId) load(); else setLoading(false); }, [leadId, load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);

  const act = async (payload: Record<string, string>, done: string) => {
    if (!leadId || busy) return;
    setBusy(true);
    try {
      const res = await authFetch('/api/leads/timeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, ...payload }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Something went wrong');
      setToast(done);
      await load(true);
      return true;
    } catch (e) { setToast(e instanceof Error ? e.message : 'Something went wrong'); } finally { setBusy(false); }
  };

  const events = useMemo(() => {
    const kinds = TAB_KINDS[tab];
    return (data?.timeline ?? []).filter((e) => !kinds || kinds.includes(e.kind));
  }, [data, tab]);

  if (!leadId || notFound) return <AppLayout><LeadPicker missingId={notFound ? leadId : null} basePath="/lead-record" /></AppLayout>;

  if (loading && !data) {
    return <AppLayout><div className="max-w-6xl mx-auto px-4 py-6 space-y-4 animate-pulse"><div className="h-28 rounded-2xl bg-muted" /><div className="grid lg:grid-cols-3 gap-4"><div className="lg:col-span-2 h-96 rounded-2xl bg-muted" /><div className="h-96 rounded-2xl bg-muted" /></div></div></AppLayout>;
  }

  if (!data) {
    return (
      <AppLayout><div className="max-w-md mx-auto py-20 text-center">
        <AlertCircle className="mx-auto text-destructive" size={28} />
        <p className="mt-3 text-sm text-foreground">{error ?? 'Could not load this lead.'}</p>
        <button onClick={() => load()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"><RefreshCw size={14} />Try again</button>
      </div></AppLayout>
    );
  }

  const { lead, engagement, counts, calls } = data;
  const stage = normalizeLeadStage(lead.stage);
  const place = [lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
  const person = lead.contactName || lead.ownerName;
  const tabs: Array<{ id: Tab; label: string; n: number }> = [
    { id: 'all', label: 'Everything', n: data.timeline.length },
    { id: 'messages', label: 'Messages', n: counts.texts + counts.emails + counts.replies },
    { id: 'calls', label: 'Calls', n: counts.calls },
    { id: 'notes', label: 'Notes & stages', n: data.timeline.filter((e) => e.kind === 'note' || e.kind === 'stage').length },
  ];

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground truncate">{lead.address}</h1>
              <StageBadge stage={stage} />
              {lead.luxury && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">Luxury</span>}
              {lead.smsOptedOut && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Opted out of texts</span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1"><MapPin size={13} />{place || 'No location'}</span>
              {person && <span className="inline-flex items-center gap-1"><User size={13} />{person}</span>}
              {lead.phone && <span className="inline-flex items-center gap-1"><Phone size={13} />{lead.phone}{lead.phoneVerified && <ShieldCheck size={12} className="text-emerald-500" />}</span>}
              {lead.agentName && <span>Agent: {lead.agentName}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={STAGES.includes(lead.stage ?? '') ? lead.stage! : stage} disabled={busy} onChange={(e) => act({ action: 'stage', stage: e.target.value }, `Moved to ${e.target.value}`)} aria-label="Change stage"
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Link href={`/lead-profile?id=${lead.id}`} className="h-9 px-3 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-1.5 hover:bg-muted">Full profile<ArrowUpRight size={14} /></Link>
            <button onClick={() => load(true)} aria-label="Refresh" className="h-9 w-9 rounded-xl border border-border inline-flex items-center justify-center hover:bg-muted"><RefreshCw size={14} /></button>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Prospect score', value: lead.score ?? '—', icon: Flame },
            { label: 'Texts sent', value: counts.texts, icon: MessageSquare },
            { label: 'Emails sent', value: counts.emails, icon: Mail },
            { label: 'Replies', value: counts.replies, icon: Send },
            { label: 'Last contact', value: ago(lead.lastContactedAt), icon: Clock },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><s.icon size={12} />{s.label}</p>
              <p className="mt-1 text-lg font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </section>

        <div className="grid lg:grid-cols-3 gap-5">
          <section className="lg:col-span-2 rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  {t.label} <span className={tab === t.id ? 'opacity-80' : 'opacity-60'}>{t.n}</span>
                </button>
              ))}
            </div>

            {(tab === 'all' || tab === 'notes') && (
              <form className="p-4 border-b border-border flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: 'note', text: note }, 'Note saved')) setNote(''); }}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000} placeholder="Add a note about this lead…" className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <button type="submit" disabled={busy || !note.trim()} className="self-end h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Save note</button>
              </form>
            )}

            {tab === 'calls' && calls.length > 0 && (
              <ul className="divide-y divide-border">
                {calls.map((c) => <CallRow key={c.id} call={c} open={openCall === c.id} onToggle={() => setOpenCall(openCall === c.id ? null : c.id)} />)}
              </ul>
            )}

            {!(tab === 'calls' && calls.length > 0) && (events.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                {tab === 'calls' ? 'No calls with this lead yet. Calls made from the dialer will show up here with recordings and transcripts.' : tab === 'notes' ? 'No notes or stage changes yet.' : 'Nothing recorded yet.'}
              </div>
            ) : (
              <ol className="p-4 space-y-3">
                {events.map((e) => <EventRow key={e.id} e={e} />)}
              </ol>
            ))}
          </section>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><MousePointerClick size={14} className="text-primary" />Estimate engagement</h2>
              {engagement ? (
                <div className="mt-3 space-y-2 text-sm">
                  {engagement.temperature && <p><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${engagement.temperature === 'hot' ? 'bg-rose-500/10 text-rose-600' : 'bg-muted text-muted-foreground'}`}>{engagement.temperature.toUpperCase()}</span></p>}
                  {engagement.rangeText && <Row k="Estimate sent" v={engagement.rangeText} />}
                  <Row k="Text delivered" v={engagement.delivered ? 'Yes' : 'No'} />
                  <Row k="Opened link" v={engagement.clicked ? 'Yes' : 'No'} />
                  <Row k="Viewed estimate" v={engagement.viewed ? `Yes${engagement.timeOnPage ? ` · ${Math.round(engagement.timeOnPage)}s` : ''}` : 'No'} />
                  <Row k="Chat questions" v={String(engagement.chatQuestions)} />
                  <Row k="Asked for contact" v={engagement.contactRequested ? 'Yes' : 'No'} />
                  {engagement.replyText && <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-foreground">“{engagement.replyText}”</p>}
                </div>
              ) : <p className="mt-2 text-sm text-muted-foreground">No estimate text has been sent to this lead yet.</p>}
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Home size={14} className="text-primary" />Property &amp; pipeline</h2>
              <div className="mt-3 space-y-2 text-sm">
                <Row k="Beds / baths" v={lead.beds || lead.baths ? `${lead.beds ?? '—'} / ${lead.baths ?? '—'}` : '—'} />
                <Row k="Price" v={lead.price ? `$${Math.round(lead.price).toLocaleString()}${lead.priceType ? ` (${lead.priceType})` : ''}` : '—'} />
                <Row k="Regulation" v={lead.regulation ?? '—'} />
                <Row k="Program" v={lead.program ?? '—'} />
                <Row k="Next follow-up" v={lead.nextFollowupDue ? when(lead.nextFollowupDue) : '—'} />
                <Row k="Added" v={lead.createdAt ? ago(lead.createdAt) : '—'} />
                {lead.listingUrl && <a href={lead.listingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Listing<ExternalLink size={12} /></a>}
              </div>
              {lead.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{lead.tags.slice(0, 12).map((t) => <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{t}</span>)}</div>}
            </div>

            {lead.notes && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><FileText size={14} className="text-primary" />Notes on the lead</h2>
                <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}
          </aside>
        </div>
      </div>
      {toast && <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-foreground text-background px-4 py-2 text-sm shadow-lg">{toast}</div>}
    </AppLayout>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="text-foreground text-right">{v}</span></div>;
}

function EventRow({ e }: { e: TimelineEvent }) {
  const s = KIND_STYLE[e.kind];
  const Icon = s.icon;
  const failed = typeof e.status === 'string' && e.status.startsWith('failed');
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 w-8 h-8 shrink-0 rounded-xl inline-flex items-center justify-center ${s.chip}`}><Icon size={15} /></span>
      <div className="min-w-0 flex-1 rounded-xl bg-muted/40 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-medium text-foreground">{e.title}</span>
          {e.status && <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${failed ? 'bg-destructive/10 text-destructive' : 'bg-background text-muted-foreground'}`}>{e.status}</span>}
          <span className="ml-auto text-xs text-muted-foreground">{when(e.at)}</span>
        </div>
        {e.body && <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">{e.body}</p>}
        {(e.by || e.meta?.campaign) && <p className="mt-1 text-[11px] text-muted-foreground">{[e.by, e.meta?.campaign ? `Campaign: ${e.meta.campaign}` : null].filter(Boolean).join(' · ')}</p>}
      </div>
    </li>
  );
}

function CallRow({ call, open, onToggle }: { call: RecordCall; open: boolean; onToggle: () => void }) {
  return (
    <li className="p-4">
      <button onClick={onToggle} className="w-full flex items-center gap-3 text-left">
        <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 inline-flex items-center justify-center"><Phone size={15} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-foreground">{call.outcome ?? 'Call'} · {mmss(call.durationSeconds)}</span>
          <span className="block text-xs text-muted-foreground">{when(call.startedAt)}{call.agent ? ` · ${call.agent}` : ''}</span>
        </span>
        <span className="text-xs text-primary">{open ? 'Hide' : 'Details'}</span>
      </button>
      {open && (
        <div className="mt-3 pl-11 space-y-3">
          {call.summary && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{call.summary}</p>}
          {call.recordingUrl ? <audio controls preload="none" src={call.recordingUrl} className="w-full" /> : <p className="text-xs text-muted-foreground">No recording was saved for this call.</p>}
          {call.transcript.length > 0 && (
            <div className="rounded-xl bg-muted/40 p-3 space-y-1.5 max-h-72 overflow-y-auto">
              {call.transcript.map((t, i) => <p key={i} className="text-sm"><span className="font-semibold text-foreground">{t.speaker || 'Speaker'}:</span> <span className="text-muted-foreground">{t.text}</span></p>)}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
