'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, Download, ExternalLink, Loader2, Search, X } from 'lucide-react';
import { Chip, DrillSpec, ERROR_MEANING, TEMP_STYLE, cx, fmtDate, timeAgo } from './shared';

interface DrillRow {
  leadId: string; batch: string; address: string; owner: string | null; state: string | null; phone: string | null; stage: string | null;
  status: string; errorCode: string | null; tone: string | null; audience: string | null; scheduledFor: string; deliveredAt: string | null;
  clicks: number; viewed: boolean; timeOnPage: number | null; deepestStep: string | null; submittedAt: string | null;
  replyAt: string | null; replyIntent: string | null; replyText: string | null; optedOut: boolean; temperature: string; score: number; device: string | null; os: string | null;
  lastActivityAt: string | null; lastActivity: string | null;
}
interface Detail {
  leadId: string; batch: string; temperature: string; score: number; status: string; errorCode: string | null; audience: string | null; tone: string | null; writtenBy: string | null;
  segments: number | null; range: string | null; phoneQuality: string | null; priceUsd: number | null; message: string | null;
  lead: { address: string; owner: string | null; phone: string | null; stage: string | null; score: number | null; price: number | null; beds: number | null; baths: number | null } | null;
  timeline: Array<{ at: string; label: string; detail?: string }>;
}

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'muted'> = { delivered: 'green', read: 'green', sent: 'blue', queued: 'blue', scheduled: 'blue', failed: 'red', undelivered: 'red', canceled: 'muted' };

function csvCell(v: unknown) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <button onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard unavailable */ } }} title="Copy" className="text-muted-foreground hover:text-primary">{done ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}</button>;
}

function DetailView({ leadId, batch, onBack }: { leadId: string; batch: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true; setD(null); setErr(null);
    fetch(`/api/campaigns/drilldown?lead=${encodeURIComponent(leadId)}&batch=${encodeURIComponent(batch)}`, { cache: 'no-store' })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not load this text'); if (live) setD(j); })
      .catch(e => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [leadId, batch]);

  if (err) return <div className="p-6 text-sm text-rose-600">{err}</div>;
  if (!d) return <div className="p-10 flex justify-center text-muted-foreground"><Loader2 className="animate-spin" /></div>;
  const l = d.lead;
  const facts: Array<[string, React.ReactNode]> = [
    ['Owner', l?.owner ?? 'Unknown'], ['Phone', l?.phone ? <span className="inline-flex items-center gap-1.5">{l.phone}<CopyButton text={l.phone} /></span> : '-'], ['Stage', l?.stage ?? '-'],
    ['Prospect score', l?.score ?? '-'], ['List price', l?.price ? `$${Number(l.price).toLocaleString()}` : '-'], ['Beds / baths', l?.beds != null ? `${l.beds} / ${l.baths ?? '-'}` : '-'], ['Estimate in the text', d.range ?? '-'],
    ['Audience', d.audience ?? '-'], ['Tone', d.tone ?? '-'], ['Written by', d.writtenBy ?? '-'], ['Phone check', d.phoneQuality ?? '-'], ['Length', d.segments ? `${d.segments} segment${d.segments === 1 ? '' : 's'}` : '-'], ['Twilio cost', d.priceUsd != null ? `$${d.priceUsd.toFixed(4)}` : '-'],
  ];
  return (
    <div className="p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"><ArrowLeft size={13} /> Back to the list</button>
          <h3 className="text-lg font-semibold">{l?.address || d.leadId}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className={cx('px-2 py-0.5 rounded-full text-[11px] font-semibold', TEMP_STYLE[d.temperature])}>{d.temperature.replace('_', ' ')}</span>
            <Chip tone={STATUS_TONE[d.status] ?? 'muted'}>{d.status}</Chip>
            {d.errorCode && <Chip tone="red">{ERROR_MEANING[d.errorCode]?.[0] ?? `error ${d.errorCode}`}</Chip>}
            <span className="text-xs text-muted-foreground">Engagement score {d.score}</span>
          </div>
        </div>
        <Link href={`/lead-profile?id=${d.leadId}`} className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"><ExternalLink size={14} /> Open lead profile</Link>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">The text they received</p>
        {d.message ? <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm whitespace-pre-wrap max-w-xl">{d.message}</div> : <p className="text-sm text-muted-foreground">The message was not recorded.</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
        {facts.map(([k, v]) => <div key={k} className="flex justify-between gap-3 text-sm border-b border-border/60 py-1.5"><span className="text-muted-foreground">{k}</span><span className="font-medium text-right">{v}</span></div>)}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">What happened</p>
        <ol className="relative border-l border-border ml-2 space-y-4">
          {d.timeline.map((t, i) => (
            <li key={i} className="pl-5 relative">
              <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
              <p className="text-sm font-medium">{t.label}</p>
              {t.detail && <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{t.detail}</p>}
              <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(t.at)}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function DrilldownDrawer({ spec, batch, onClose }: { spec: DrillSpec; batch: string; onClose: () => void }) {
  const useBatch = spec.batch ?? batch;
  const [data, setData] = useState<{ total: number; shown: number; rows: DrillRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest' | 'strongest'>('newest');
  const [open, setOpen] = useState<{ leadId: string; batch: string } | null>(spec.openLead ?? null);

  useEffect(() => {
    let live = true; setData(null); setErr(null); setOpen(spec.openLead ?? null); setQuery('');
    const qs = new URLSearchParams({ batch: useBatch, metric: spec.metric });
    if (spec.group) qs.set('group', spec.group);
    if (spec.value != null) qs.set('value', spec.value);
    fetch(`/api/campaigns/drilldown?${qs}`, { cache: 'no-store' })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not load the details'); if (live) setData(j); })
      .catch(e => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [spec, useBatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (open) setOpen(null); else onClose(); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const at = (r: DrillRow) => (r.lastActivityAt ? Date.parse(r.lastActivityAt) : 0);
    const list = (data?.rows ?? []).filter(r => !q || `${r.address} ${r.owner ?? ''} ${r.phone ?? ''} ${r.state ?? ''} ${r.replyText ?? ''}`.toLowerCase().includes(q));
    if (order === 'strongest') return [...list].sort((a, b) => b.score - a.score || at(b) - at(a));
    if (order === 'oldest') return [...list].sort((a, b) => (at(a) || Infinity) - (at(b) || Infinity) || b.score - a.score);
    return list;
  }, [data, query, order]);

  function exportCsv() {
    const head = ['Address', 'Owner', 'Phone', 'State', 'Campaign', 'Audience', 'Tone', 'Status', 'Scheduled', 'Last activity', 'Last activity at', 'Opened link', 'Viewed estimate', 'Submitted form', 'Reply', 'Reply text', 'Opted out', 'Outcome', 'Score'];
    const body = rows.map(r => [r.address, r.owner, r.phone, r.state, r.batch, r.audience, r.tone, r.status, r.scheduledFor, r.lastActivity ?? '', r.lastActivityAt ?? '', r.clicks, r.viewed ? 'yes' : 'no', r.submittedAt ?? '', r.replyIntent ?? '', r.replyText ?? '', r.optedOut ? 'yes' : 'no', r.temperature, r.score]);
    const blob = new Blob([[head, ...body].map(l => l.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={spec.title}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div className="relative w-full max-w-4xl h-full bg-background shadow-2xl overflow-y-auto border-l border-border">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{spec.title}</h2>
            <p className="text-xs text-muted-foreground">{useBatch === 'all' ? 'All campaigns' : useBatch}{data ? ` · ${data.total} text${data.total === 1 ? '' : 's'}${data.shown < data.total ? ` (showing the top ${data.shown})` : ''}` : ''}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl border border-border hover:bg-muted inline-flex items-center justify-center shrink-0" aria-label="Close"><X size={16} /></button>
        </div>

        {open ? <DetailView leadId={open.leadId} batch={open.batch} onBack={() => setOpen(null)} /> : (
          <div className="p-5 space-y-4">
            {err && <p className="text-sm text-rose-600">{err}</p>}
            {!data && !err && <div className="py-16 flex justify-center text-muted-foreground"><Loader2 className="animate-spin" /></div>}
            {data && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search address, owner, phone" className="h-8 w-64 rounded-xl border border-border bg-background pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-primary/40" /></div>
                  <select value={order} onChange={e => setOrder(e.target.value as typeof order)} aria-label="Sort" className="h-8 rounded-xl border border-border bg-background px-2 text-xs"><option value="newest">Newest activity first</option><option value="oldest">Oldest activity first</option><option value="strongest">Strongest first</option></select>
                  <button onClick={exportCsv} disabled={!rows.length} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-xl border border-border text-xs hover:bg-muted disabled:opacity-50"><Download size={13} /> Export these {rows.length}</button>
                  <span className="text-[11px] text-muted-foreground">Click a row for the message and full timeline.</span>
                </div>
                {rows.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">{data.total ? 'Nothing matches that search.' : 'No texts in this group yet.'}</p> : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40"><th className="py-2 pl-4 pr-3">Lead</th><th className="pr-3">Status</th><th className="pr-3">Activity</th><th className="pr-3">Reply</th><th className="pr-4 text-right">Outcome</th></tr></thead>
                      <tbody>{rows.map(r => (
                        <tr key={`${r.leadId}-${r.batch}`} onClick={() => setOpen({ leadId: r.leadId, batch: r.batch })} className="border-t border-border align-top cursor-pointer hover:bg-muted/50">
                          <td className="py-2.5 pl-4 pr-3 max-w-xs"><p className="font-medium text-primary truncate">{r.address || r.leadId}</p><p className="text-[11px] text-muted-foreground truncate">{r.owner ?? 'Owner unknown'}{r.phone ? ` · ${r.phone}` : ''}</p><p className="text-[11px] text-muted-foreground">{[r.tone, r.audience].filter(Boolean).join(' · ')}</p></td>
                          <td className="pr-3 whitespace-nowrap"><Chip tone={STATUS_TONE[r.status] ?? 'muted'}>{r.status}</Chip>{r.errorCode && <p className="text-[11px] text-amber-600 mt-1">{ERROR_MEANING[r.errorCode]?.[0] ?? `error ${r.errorCode}`}</p>}<p className="text-[11px] text-muted-foreground mt-1">{fmtDate(r.scheduledFor)}</p></td>
                          <td className="pr-3 text-xs text-muted-foreground">{r.lastActivityAt && <p className="text-foreground font-medium">{timeAgo(r.lastActivityAt)}<span className="text-muted-foreground font-normal"> · {r.lastActivity}</span></p>}{r.clicks > 0 ? <p className="text-foreground">Opened the link{r.clicks > 1 ? ` x${r.clicks}` : ''}</p> : <p>No click</p>}{r.viewed && <p>Viewed the estimate{r.timeOnPage ? ` (${r.timeOnPage}s)` : ''}</p>}{r.submittedAt && <p className="text-emerald-600 font-medium">Submitted the form</p>}</td>
                          <td className="pr-3 text-xs max-w-[14rem]">{r.replyAt ? <><Chip tone={r.replyIntent === 'yes' ? 'green' : r.replyIntent === 'stop' ? 'red' : 'muted'} className="uppercase">{r.replyIntent ?? 'reply'}</Chip><p className="text-muted-foreground mt-1 line-clamp-2">{r.replyText}</p></> : <span className="text-muted-foreground">-</span>}</td>
                          <td className="pr-4 text-right whitespace-nowrap"><span className={cx('px-2 py-0.5 rounded-full text-[11px] font-semibold', TEMP_STYLE[r.temperature])}>{r.temperature.replace('_', ' ')}</span><p className="text-[11px] text-muted-foreground mt-1">score {r.score}</p></td>
                        </tr>))}</tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
