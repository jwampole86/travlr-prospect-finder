'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Clock, ExternalLink, Eye, Mail, MailCheck, MailOpen, MailX, RefreshCw, Reply, Search, X } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { authFetch } from '@/lib/authFetch';
import type { EmailCampaignCounts, EmailMessageRow, EmailOverview } from '@/lib/emailOverviewTypes';

type View = 'all' | 'draft' | 'delivered' | 'opened' | 'replied' | 'bounced';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', delivered: 'bg-emerald-500/10 text-emerald-600', sent: 'bg-sky-500/10 text-sky-600',
  bounced: 'bg-destructive/10 text-destructive', failed: 'bg-destructive/10 text-destructive',
};
function countdown(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000)); const d = Math.floor(t / 86400); const h = Math.floor((t % 86400) / 3600); const m = Math.floor((t % 3600) / 60); const sec = t % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
}
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

function matches(m: EmailMessageRow, v: View) {
  if (v === 'all') return true;
  if (v === 'draft') return m.status === 'draft';
  if (v === 'delivered') return !!m.deliveredAt;
  if (v === 'opened') return !!m.openedAt;
  if (v === 'replied') return !!m.repliedAt;
  return !!m.bouncedAt || m.status === 'bounced';
}

export default function EmailCampaignsPage() {
  const [data, setData] = useState<EmailOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignId, setCampaignId] = useState<string>('all');
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<EmailMessageRow | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch('/api/campaigns/email-overview');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load email campaigns');
      setData(json);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load email campaigns'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!preview) return; const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [preview]);

  const counts: EmailCampaignCounts | null = useMemo(() => (data ? (campaignId === 'all' ? data.totals : data.campaigns.find((c) => c.id === campaignId)?.counts ?? data.totals) : null), [data, campaignId]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.messages ?? []).filter((m) => (campaignId === 'all' || m.campaignId === campaignId) && matches(m, view) && (!term || `${m.toName ?? ''} ${m.toEmail} ${m.subject}`.toLowerCase().includes(term)));
  }, [data, campaignId, view, q]);

  const tiles = counts ? [
    { label: 'Emails sent', value: counts.sent, sub: `${counts.drafts} waiting as drafts`, icon: Mail },
    { label: 'Delivered', value: counts.delivered, sub: `${pct(counts.delivered, counts.sent)} of sent`, icon: MailCheck },
    { label: 'Opened', value: counts.opened, sub: `${pct(counts.opened, counts.delivered)} of delivered`, icon: MailOpen },
    { label: 'Replied', value: counts.replied, sub: `${pct(counts.replied, counts.delivered)} of delivered`, icon: Reply },
    { label: 'Bounced', value: counts.bounced, sub: `${pct(counts.bounced, counts.sent)} of sent`, icon: MailX },
  ] : [];
  const views: Array<{ id: View; label: string }> = [{ id: 'all', label: 'All' }, { id: 'draft', label: 'Drafts' }, { id: 'delivered', label: 'Delivered' }, { id: 'opened', label: 'Opened' }, { id: 'replied', label: 'Replied' }, { id: 'bounced', label: 'Bounced' }];

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Email campaigns</h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">Co-host outreach emails to Airbnb hosts: what was sent, what was delivered, opened and answered, and what is still waiting as a draft.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/email-campaigns/bulk" className="h-9 px-3 rounded-xl border border-border text-sm font-medium inline-flex items-center hover:bg-muted">Bulk sender</Link>
            <button onClick={load} disabled={loading} className="h-9 px-3 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-60"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</button>
          </div>
        </header>

        {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm flex items-center gap-2 text-destructive"><AlertCircle size={16} />{error}</div>}

        {data && (
          <>
            <div className="rounded-2xl border border-border bg-card px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2 text-sm"><Clock size={14} className="text-primary" /><span className="text-muted-foreground">Sent today</span><span className="font-semibold text-foreground">{data.daily.sentToday} of {data.daily.cap}</span></div>
              <div className="flex-1 min-w-[140px] h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (data.daily.sentToday / data.daily.cap) * 100)}%` }} /></div>
              <p className="text-sm text-muted-foreground">Daily limit resets in <span className="font-semibold tabular-nums text-foreground">{countdown(Date.parse(data.daily.resetsAt) - now)}</span></p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button onClick={() => setCampaignId('all')} className={`rounded-2xl border p-4 text-left transition-colors ${campaignId === 'all' ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'}`}>
                <p className="text-sm font-semibold text-foreground">All campaigns</p>
                <p className="text-xs text-muted-foreground mt-0.5">{data.totals.total} emails · {data.totals.sent} sent · {data.totals.drafts} drafts</p>
              </button>
              {data.campaigns.map((c) => {
                const release = c.nextRelease ? Date.parse(c.nextRelease) - now : null;
                const capped = data.daily.sentToday >= data.daily.cap;
                return (
                  <button key={c.id} onClick={() => setCampaignId(c.id)} className={`rounded-2xl border p-4 text-left transition-colors ${campaignId === c.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'}`}>
                    <p className="text-sm font-semibold text-foreground truncate" title={c.name}>{c.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.counts.total} emails · {c.counts.sent} sent · {c.counts.drafts} drafts</p>
                    <div className="h-1.5 rounded-full bg-muted mt-3 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${c.counts.total ? (c.counts.sent / c.counts.total) * 100 : 0}%` }} /></div>
                    {release !== null && release > 0 ? (
                      <div className="mt-3 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 px-3 py-2">
                        <p className="text-[11px] text-sky-700 dark:text-sky-300 inline-flex items-center gap-1"><Clock size={11} />{c.held} resend{c.held === 1 ? '' : 's'} held for the owner's morning. Next goes out in</p>
                        <p className="text-base font-bold tabular-nums text-sky-900 dark:text-sky-100 leading-tight">{countdown(release)}</p>
                      </div>
                    ) : c.counts.drafts > 0 ? (
                      <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2">
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><Clock size={11} />{c.counts.drafts} waiting to be sent</p>
                        <p className="text-sm font-semibold text-foreground leading-tight">{capped ? <>Daily limit reached. Resumes in <span className="tabular-nums">{countdown(Date.parse(data.daily.resetsAt) - now)}</span></> : `Ready now · ${data.daily.cap - data.daily.sentToday} sends left today`}</p>
                      </div>
                    ) : <p className="mt-3 text-[11px] text-muted-foreground inline-flex items-center gap-1"><Clock size={11} />Nothing waiting</p>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {loading && !data ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />) : tiles.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><s.icon size={12} />{s.label}</p>
              <p className="mt-1 text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-1 p-3 border-b border-border">
            {views.map((v) => <button key={v.id} onClick={() => setView(v.id)} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${view === v.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{v.label}</button>)}
            <div className="relative ml-auto w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or subject" className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          {loading && !data ? <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />)}</div>
            : rows.length === 0 ? <div className="py-14 text-center text-sm text-muted-foreground">{data?.messages.length ? 'No emails match this view.' : 'No co-host emails yet. Drafts created from Co-Host Offers appear here.'}</div>
            : (
              <ul className="divide-y divide-border">
                {rows.map((m) => (
                  <li key={m.id}>
                    <button onClick={() => setPreview(m)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/40 transition-colors">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground truncate">{m.toName || m.toEmail}</span>
                        <span className="block text-xs text-muted-foreground truncate">{m.subject}</span>
                      </span>
                      <span className="hidden sm:flex items-center gap-1.5 text-[11px]">
                        {m.openedAt && <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600">Opened</span>}
                        {m.repliedAt && <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600">Replied</span>}
                        {m.retryAt && Date.parse(m.retryAt) > now && <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 tabular-nums">Resends in {countdown(Date.parse(m.retryAt) - now)}</span>}
                        {m.optedOut && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">Opted out</span>}
                      </span>
                      <span className="text-xs text-muted-foreground w-28 text-right hidden md:block">{m.sentAt ? when(m.sentAt) : 'Not sent'}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[m.status] ?? 'bg-muted text-muted-foreground'}`}>{m.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div role="dialog" aria-label="Email preview" className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-card border border-border shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{preview.subject}</p>
                <p className="text-xs text-muted-foreground truncate">To {preview.toName ? `${preview.toName} · ` : ''}{preview.toEmail}</p>
              </div>
              <button onClick={() => setPreview(null)} aria-label="Close" className="w-8 h-8 rounded-lg inline-flex items-center justify-center hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Sent {when(preview.sentAt)}</span><span>Delivered {when(preview.deliveredAt)}</span><span>Opened {when(preview.openedAt)}</span><span>Replied {when(preview.repliedAt)}</span>
              </div>
              {(preview.failureReason || preview.bouncedAt) && <p className="text-sm text-destructive">{preview.bounceType ? `${preview.bounceType} bounce` : 'Problem'}{preview.failureReason ? `: ${preview.failureReason}` : ''}</p>}
              {preview.replyText && <p className="rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-foreground">Reply: “{preview.replyText}”</p>}
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground rounded-xl bg-muted/40 p-3">{preview.body}</pre>
            </div>
            {preview.offerCode && (
              <div className="p-3 border-t border-border">
                <a href={`/h/${preview.offerCode}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Eye size={14} />View their offer page<ExternalLink size={12} /></a>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
