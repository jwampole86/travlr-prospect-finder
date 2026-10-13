'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Clock, Copy, Download, Eye, Flame, Loader2, Mail, MailOpen, MessageSquare, MousePointerClick, RefreshCw, Search, Send, ShieldOff, X, ExternalLink } from 'lucide-react';
import { Card, Chip, Notice, SectionTitle, Skeleton, cx, fmtDate, pct, post } from './shared';

interface Summary { id: string; name: string; createdAt: string; emails: number; drafts: number; sent: number; canceled: number; firstSend: string | null }
interface Row {
  id: string; campaignId: string; propertyId: string; title: string; market: string; owner: string | null; stage: string | null; toEmail: string; subject: string; body: string; status: string; temperature: string;
  sentAt: string | null; deliveredAt: string | null; openedAt: string | null; bouncedAt: string | null; bounceType: string | null; failureReason: string | null; repliedAt: string | null; replyText: string | null; optedOutAt: string | null; testedAt: string | null; triedEmails: string[]; retryAt: string | null;
  offer: { code: string | null; views: number; firstViewedAt: string | null; requested: boolean; requestedAt: string | null; ctaClicks: number };
}
interface Report { totals: { emails: number; drafts: number; sent: number; delivered: number; opened: number; viewed: number; clicked: number; requested: number; replied: number; bounced: number; optedOut: number; hot: number }; rows: Row[]; updatedAt: string }

const TEMP_TONE: Record<string, 'red' | 'amber' | 'muted' | 'green' | 'blue'> = { hot: 'red', warm: 'amber', cold: 'muted', draft: 'muted', undeliverable: 'red', opted_out: 'red', canceled: 'muted' };
const TEMP_LABEL: Record<string, string> = { hot: 'Hot', warm: 'Warm', cold: 'No response yet', draft: 'Draft', undeliverable: 'Not delivered', opted_out: 'Opted out', canceled: 'Canceled' };

const FILTERS: Record<string, (r: Row) => boolean> = {
  sent: r => !!r.sentAt, delivered: r => !!r.deliveredAt || !!r.openedAt, opened: r => !!r.openedAt, viewed: r => r.offer.views > 0, clicked: r => r.offer.ctaClicks > 0, requested: r => r.offer.requested,
  replied: r => !!r.repliedAt, notdelivered: r => r.status === 'bounced' || r.status === 'failed', optedOut: r => r.status === 'opted_out', hot: r => r.temperature === 'hot', warm: r => r.temperature === 'warm',
  cold: r => r.temperature === 'cold', draft: r => r.status === 'draft',
};
const QUICK: Array<[string, string]> = [['all', 'All'], ['hot', 'Hot'], ['warm', 'Warm'], ['cold', 'No response yet'], ['draft', 'Drafts'], ['notdelivered', 'Not delivered'], ['optedOut', 'Opted out']];

function campaignStatus(c: Summary): { label: string; tone: 'blue' | 'amber' | 'green' | 'muted' } {
  if (c.canceled >= c.emails) return { label: 'Canceled', tone: 'muted' };
  if (c.sent === 0) return { label: 'Draft', tone: 'muted' };
  return c.drafts > 0 ? { label: 'Sending', tone: 'amber' } : { label: 'Complete', tone: 'green' };
}

function why(r: Row): string {
  return [r.repliedAt && 'replied', r.offer.requested && 'asked for a listing audit', r.offer.ctaClicks > 0 && `clicked a button on the offer page`, r.offer.views > 0 && `opened the offer page${r.offer.views > 1 ? ` ${r.offer.views} times` : ''}`, r.openedAt && 'opened the email'].filter(Boolean).join(', ');
}

function Kpi({ label, value, sub, icon, tone, active, onClick }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; tone: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cx('text-left rounded-2xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5', active ? 'border-primary ring-2 ring-primary/30' : 'border-border')}>
      <div className="flex items-center justify-between"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><span className={cx('w-7 h-7 rounded-lg flex items-center justify-center', tone)}>{icon}</span></div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </button>
  );
}

function EmailRow({ r, focusId, onChanged, onError }: { r: Row; focusId: string | null; onChanged: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focusId === r.id) { setOpen(true); requestAnimationFrame(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })); } }, [focusId, r.id]);
  const [subject, setSubject] = useState(r.subject);
  const [body, setBody] = useState(r.body);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const editable = r.status === 'draft' || r.status === 'failed';
  const dirty = subject !== r.subject || body !== r.body;
  useEffect(() => { setSubject(r.subject); setBody(r.body); }, [r.subject, r.body]);

  async function act(action: string, extra: Record<string, unknown> = {}, ok?: string) {
    setBusy(action); setNote(null);
    try { await post('/api/campaigns/cohost-email', { action, id: r.id, ...extra }); if (ok) setNote(ok); setConfirm(false); setReplying(false); onChanged(); }
    catch (e) { onError((e as Error).message); setConfirm(false); } finally { setBusy(null); }
  }
  const spin = (a: string) => busy === a && <Loader2 size={12} className="animate-spin" />;

  return (
    <div ref={box} className={cx('border-t border-border', focusId === r.id && 'bg-primary/5')}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/40">
        <ChevronDown size={15} className={cx('shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} />
        <div className="min-w-0 flex-1 basis-56"><p className="font-medium text-sm truncate">{r.title}</p><p className="text-[11px] text-muted-foreground truncate">{r.market}{r.owner ? ` · ${r.owner}` : ''} · {r.toEmail}</p></div>
        <Chip tone={TEMP_TONE[r.temperature] ?? 'muted'}>{TEMP_LABEL[r.temperature] ?? r.temperature}</Chip>
        <span className="text-[11px] text-muted-foreground w-44 hidden md:block">{r.sentAt ? `Sent ${fmtDate(r.sentAt)}` : r.testedAt ? 'Tested, not sent' : 'Not sent yet'}{r.offer.views ? ` · ${r.offer.views} page view${r.offer.views === 1 ? '' : 's'}` : ''}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {r.temperature !== 'draft' && r.temperature !== 'canceled' && (
            <ol className="text-xs text-muted-foreground space-y-0.5">
              {r.triedEmails.length > 0 && <li className="text-amber-600">{r.triedEmails.length === 1 ? 'An earlier address bounced' : `${r.triedEmails.length} earlier addresses bounced`} ({r.triedEmails.join(', ')}); it was resent to {r.toEmail} automatically.</li>}
              {r.sentAt && <li>Sent {fmtDate(r.sentAt)}</li>}
              {r.deliveredAt && <li>Delivered {fmtDate(r.deliveredAt)}</li>}
              {r.openedAt && <li className="text-emerald-600">Opened the email {fmtDate(r.openedAt)}</li>}
              {r.offer.firstViewedAt && <li className="text-emerald-600">Opened the offer page {fmtDate(r.offer.firstViewedAt)}{r.offer.views > 1 ? ` (${r.offer.views} views)` : ''}</li>}
              {r.offer.requestedAt && <li className="text-emerald-600 font-medium">Asked for a listing audit {fmtDate(r.offer.requestedAt)}</li>}
              {r.repliedAt && <li className="text-emerald-600 font-medium">Replied {fmtDate(r.repliedAt)}</li>}
              {r.bouncedAt && <li className="text-rose-600">Bounced ({r.bounceType}): {r.failureReason}</li>}
              {r.retryAt && ['bounced', 'failed'].includes(r.status) && <li className="text-amber-600">Waiting to resend to the next address on file until {fmtDate(r.retryAt)}, 9 AM in the owner&apos;s time zone.</li>}
              {!r.bouncedAt && r.status === 'failed' && <li className="text-rose-600">Could not send: {r.failureReason}</li>}
              {r.optedOutAt && <li className="text-rose-600">Opted out {fmtDate(r.optedOutAt)}</li>}
              {!r.openedAt && r.sentAt && <li>Opens are not always reported, so the offer page views above are the better signal.</li>}
            </ol>
          )}
          {r.replyText && <div className="rounded-xl bg-muted/60 px-3 py-2 text-sm">&ldquo;{r.replyText}&rdquo;</div>}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>Home: <b className="text-foreground font-medium">{r.title}</b>{r.market ? `, ${r.market}` : ''}</span>
            {r.stage && <span>Stage: <b className="text-foreground font-medium">{r.stage}</b></span>}
            <span>Sent to: <b className="text-foreground font-medium">{r.toEmail}</b></span>
            <a href={`/cohost?open=${encodeURIComponent(r.propertyId)}`} className="inline-flex items-center gap-1 text-primary font-medium hover:underline">Open in Co-Host pipeline <ExternalLink size={11} /></a>
            {r.offer.code && <a href={`/h/${r.offer.code}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary font-medium hover:underline">View their offer page <ExternalLink size={11} /></a>}
            {r.offer.ctaClicks > 0 && <span>{r.offer.ctaClicks} button click{r.offer.ctaClicks === 1 ? '' : 's'} on the offer page</span>}
          </div>

          <div className="space-y-2">
            <input value={subject} onChange={e => setSubject(e.target.value)} disabled={!editable} aria-label="Subject" className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm font-medium disabled:opacity-80 outline-none focus:ring-2 focus:ring-primary/40" />
            <textarea value={body} onChange={e => setBody(e.target.value)} disabled={!editable} rows={Math.min(22, Math.max(8, body.split('\n').length + 1))} aria-label="Email body" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed disabled:opacity-80 outline-none focus:ring-2 focus:ring-primary/40" />
            <p className="text-[11px] text-muted-foreground">An unsubscribe link and our postal address are added to the bottom of every email automatically.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {editable && <button disabled={!dirty || busy !== null} onClick={() => act('edit', { subject, body }, 'Saved. Send a new test before sending.')} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-xl border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50">{spin('edit')} Save changes</button>}
            {editable && <button disabled={dirty || busy !== null} onClick={() => act('test', {}, 'Test sent to your email. Read it, then send.')} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-xl border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50">{spin('test') || <Eye size={12} />} Send a test to me</button>}
            {editable && (confirm ? (
              <span className="inline-flex items-center gap-1.5 text-xs"><span className="font-medium">Send to {r.toEmail}?</span>
                <button disabled={busy !== null} onClick={() => act('send')} className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60">{spin('send') || 'Yes, send'}</button>
                <button onClick={() => setConfirm(false)} className="px-2.5 py-1 rounded-lg border border-border">No</button></span>
            ) : <button disabled={dirty || !r.testedAt || busy !== null} title={!r.testedAt ? 'Send a test to yourself first' : ''} onClick={() => setConfirm(true)} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"><Send size={12} /> Send</button>)}
            {editable && <button disabled={busy !== null} onClick={() => act('cancel')} className="h-8 inline-flex items-center gap-1 px-2.5 text-xs text-muted-foreground hover:text-rose-600"><X size={12} /> Cancel this email</button>}
            {r.sentAt && !r.repliedAt && r.status !== 'opted_out' && <button onClick={() => setReplying(v => !v)} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-xl border border-border text-xs font-semibold hover:bg-muted"><MessageSquare size={12} /> Log a reply</button>}
            <button onClick={() => navigator.clipboard?.writeText(`${r.subject}\n\n${r.body}`)} className="h-8 inline-flex items-center gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"><Copy size={12} /> Copy</button>
            {note && <span className="text-xs text-emerald-600 inline-flex items-center gap-1"><Check size={12} /> {note}</span>}
          </div>
          {replying && (
            <div className="flex gap-2"><input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Paste what they wrote" className="flex-1 h-9 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
              <button disabled={!replyText.trim() || busy !== null} onClick={() => act('reply', { text: replyText })} className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">{spin('reply') || 'Save'}</button></div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CoHostEmailTab() {
  const [campaigns, setCampaigns] = useState<Summary[]>([]);
  const [selected, setSelected] = useState('all');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ key: string; label: string } | null>(null);
  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const show = (key: string, label: string) => { setFilter(key === 'emails' || key === 'all' ? null : { key, label }); setQuery(''); setFocusId(null); requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  useEffect(() => { setFilter(null); setQuery(''); setFocusId(null); }, [selected]);

  const load = useCallback(async (key: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/cohost-email?campaign=${encodeURIComponent(key)}`, { cache: 'no-store' }); const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load');
      setCampaigns(j.campaigns ?? []); setReport(j.report ?? null); setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(selected); }, [selected, load]);
  useEffect(() => { const t = setInterval(() => load(selected, true), 60_000); return () => clearInterval(t); }, [selected, load]);

  const t = report?.totals;
  const steps = useMemo(() => t ? [
    { key: 'emails', label: 'Emails written', n: t.emails }, { key: 'sent', label: 'Sent', n: t.sent }, { key: 'delivered', label: 'Delivered', n: t.delivered }, { key: 'opened', label: 'Opened the email', n: t.opened },
    { key: 'viewed', label: 'Opened the offer page', n: t.viewed }, { key: 'requested', label: 'Asked for an audit', n: t.requested },
  ] : [], [t]);
  const follow = useMemo(() => (report?.rows ?? []).filter(r => r.temperature === 'hot' || r.temperature === 'warm').sort((a, b) => Number(b.temperature === 'hot') - Number(a.temperature === 'hot')), [report]);
  const notSent = !!t && t.sent === 0;
  const visible = useMemo(() => {
    const pred = filter ? FILTERS[filter.key] : null; const q = query.trim().toLowerCase();
    return (report?.rows ?? []).filter(r => (!pred || pred(r)) && (!q || `${r.title} ${r.market} ${r.owner ?? ''} ${r.toEmail} ${r.subject}`.toLowerCase().includes(q)));
  }, [report, filter, query]);

  return (
    <div className="space-y-6">
      <Notice tone="amber"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> Co-Host emails are kept apart from the homeowner text campaigns: owners are never added to those, and each email here is reviewed, tested and sent by a person, one at a time. Unsubscribes and spam complaints are honored automatically.</Notice>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        <button onClick={() => setSelected('all')} className={cx('snap-start shrink-0 w-44 text-left rounded-2xl border p-4 transition-all', selected === 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border bg-card hover:border-primary/50 hover:shadow-sm')}>
          <p className="text-xs text-muted-foreground">Everything</p><p className="font-semibold mt-0.5">All co-host emails</p><p className="text-xs text-muted-foreground mt-2">{campaigns.reduce((s, c) => s + c.emails, 0)} emails · {campaigns.length} campaign{campaigns.length === 1 ? '' : 's'}</p>
        </button>
        {campaigns.map(c => {
          const st = campaignStatus(c);
          return (
            <button key={c.id} onClick={() => setSelected(c.id)} className={cx('snap-start shrink-0 w-64 text-left rounded-2xl border p-4 transition-all', selected === c.id ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border bg-card hover:border-primary/50 hover:shadow-sm')}>
              <div className="flex items-center justify-between gap-2"><Chip tone={st.tone}>{st.label}</Chip><span className="text-[11px] text-muted-foreground">Co-Host email</span></div>
              <p className="font-semibold text-sm mt-2 truncate" title={c.name}>{c.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.emails} emails · {fmtDate(c.firstSend ?? c.createdAt)}</p>
              <div className="h-1.5 rounded-full bg-muted mt-3 overflow-hidden"><div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct(c.sent, c.emails)}%` }} /></div>
              <p className="text-[11px] text-muted-foreground mt-1">{c.sent} sent{c.drafts ? ` · ${c.drafts} waiting` : ''}{c.canceled ? ` · ${c.canceled} canceled` : ''}</p>
            </button>
          );
        })}
      </div>

      {error && <Notice tone="red"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</Notice>}
      {loading && !report && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>}
      {!loading && report && report.rows.length === 0 && <Card className="p-10 text-center"><p className="font-semibold">No co-host email campaigns yet</p><p className="text-sm text-muted-foreground mt-1">Campaigns appear here once emails are written for Co-Host prospects.</p></Card>}

      {report && t && report.rows.length > 0 && (
        <>
          {notSent && <Notice tone="blue"><Clock size={15} className="mt-0.5 shrink-0" /> {t.emails} emails are written and ready for review. Send a test to yourself from each one, then send. Numbers fill in as they go out and owners respond.</Notice>}

          <div className="flex flex-wrap items-center gap-2 justify-end -mb-3">
            <button onClick={() => load(selected, true)} className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-border bg-card text-sm hover:bg-muted"><RefreshCw size={14} /> Refresh data</button>
            <a href={`/api/campaigns/cohost-email/export?campaign=${encodeURIComponent(selected)}`} className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-border bg-card text-sm hover:bg-muted"><Download size={14} /> Export CSV</a>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            <Kpi label="Emails" value={t.emails} sub={`${t.sent} sent`} icon={<Mail size={14} />} tone="bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" active={!filter} onClick={() => show('emails', 'All emails')} />
            <Kpi label="Delivered" value={t.delivered} sub={`${pct(t.delivered, t.sent)}% of sent`} icon={<CheckCircle2 size={14} />} tone="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" active={filter?.key === 'delivered'} onClick={() => show('delivered', 'Delivered')} />
            <Kpi label="Opened" value={t.opened} sub={`${pct(t.opened, t.sent)}% of sent`} icon={<MailOpen size={14} />} tone="bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" active={filter?.key === 'opened'} onClick={() => show('opened', 'Opened the email')} />
            <Kpi label="Offer page" value={t.viewed} sub={`${pct(t.viewed, t.sent)}% of sent`} icon={<MousePointerClick size={14} />} tone="bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300" active={filter?.key === 'viewed'} onClick={() => show('viewed', 'Opened the offer page')} />
            <Kpi label="Asked for audit" value={t.requested} sub={`${pct(t.requested, t.sent)}%`} icon={<CheckCircle2 size={14} />} tone="bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300" active={filter?.key === 'requested'} onClick={() => show('requested', 'Asked for an audit')} />
            <Kpi label="Replies" value={t.replied} sub={`${pct(t.replied, t.sent)}%`} icon={<MessageSquare size={14} />} tone="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" active={filter?.key === 'replied'} onClick={() => show('replied', 'Replied')} />
            <Kpi label="Opt-outs" value={t.optedOut} sub={`${t.bounced} not delivered`} icon={<ShieldOff size={14} />} tone="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" active={filter?.key === 'optedOut'} onClick={() => show('optedOut', 'Opted out')} />
            <Kpi label="Hot leads" value={t.hot} sub="asked or replied" icon={<Flame size={14} />} tone="bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" active={filter?.key === 'hot'} onClick={() => show('hot', 'Hot leads')} />
          </div>

          <Card className="p-5">
            <SectionTitle title="Funnel" hint="How far owners get. The percentage is the share of all emails written; the pill is how many carried on from the step before." />
            <div className="space-y-2">
              {steps.map((s, i) => {
                const prev = i > 0 ? steps[i - 1].n : null; const w = t.emails ? Math.max(s.n ? 2 : 0, (s.n / t.emails) * 100) : 0;
                return (
                  <div key={s.key} role="button" tabIndex={0} title={`See the ${s.n} email${s.n === 1 ? '' : 's'} at this step`} onClick={() => show(s.key, s.label)} onKeyDown={e => e.key === 'Enter' && show(s.key, s.label)} className="flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 cursor-pointer hover:bg-primary/5">
                    <span className="w-28 sm:w-44 text-xs text-muted-foreground shrink-0">{s.label}</span>
                    <div className="flex-1 min-w-8 h-6 bg-muted rounded-md overflow-hidden"><div className="h-full rounded-md bg-primary/70 transition-all duration-700" style={{ width: `${w}%` }} /></div>
                    <span className="w-20 sm:w-28 text-right text-xs tabular-nums shrink-0">{s.n} <span className="text-muted-foreground">({pct(s.n, t.emails)}%)</span></span>
                    <span className="w-12 sm:w-14 text-right shrink-0">{prev ? <Chip tone={s.n / prev >= 0.5 ? 'green' : 'muted'}>{pct(s.n, prev)}%</Chip> : null}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {follow.length > 0 && (
            <Card className="p-5">
              <SectionTitle icon={<Flame size={15} className="text-red-500" />} title="Owners to follow up" hint="Hot owners asked for an audit or replied: reach out now. Warm owners opened the email or offer page." />
              <ul className="divide-y divide-border">{follow.map(r => (
                <li key={r.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1"><Chip tone={TEMP_TONE[r.temperature]}>{TEMP_LABEL[r.temperature]}</Chip><button onClick={() => { setFilter(null); setQuery(''); setFocusId(r.id); requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} className="font-medium text-sm text-primary hover:underline text-left">{r.title}</button><span className="text-xs text-muted-foreground">{r.owner ?? r.toEmail}: {why(r)}</span></li>))}</ul>
            </Card>
          )}

          <div ref={listRef} className="scroll-mt-4"><Card className="overflow-hidden">
            <div className="p-5 pb-3">
              <SectionTitle title={filter ? `Emails: ${filter.label}` : 'Emails'} hint="Click any number above to see the emails behind it. Open an email to read it, edit it, send yourself a test, and send it. Sending is unlocked only after a test, and never in bulk." />
              <div className="flex flex-wrap items-center gap-2">
                {QUICK.map(([k, label]) => {
                  const n = k === 'all' ? report.rows.length : report.rows.filter(FILTERS[k]).length; const on = (filter?.key ?? 'all') === k;
                  return <button key={k} onClick={() => show(k, label)} className={cx('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50')}>{label} <span className="opacity-70">{n}</span></button>;
                })}
                <div className="relative ml-auto"><Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search home, owner, email" className="h-8 w-56 rounded-xl border border-border bg-background pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-primary/40" /></div>
              </div>
              {(filter || query) && <p className="text-[11px] text-muted-foreground mt-2">Showing {visible.length} of {report.rows.length}. <button onClick={() => { setFilter(null); setQuery(''); }} className="text-primary hover:underline">Clear</button></p>}
            </div>
            <div>{visible.length === 0 ? <p className="px-5 pb-6 text-sm text-muted-foreground">No emails match.</p> : visible.map(r => <EmailRow key={r.id} r={r} focusId={focusId} onChanged={() => load(selected, true)} onError={setError} />)}</div>
          </Card></div>
        </>
      )}
    </div>
  );
}
