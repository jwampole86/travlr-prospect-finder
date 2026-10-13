'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, Clock, DollarSign, Eye, Loader2, Megaphone, MessageSquare, MousePointerClick, RefreshCw, Send, ShieldOff, XCircle } from 'lucide-react';
import { BatchInfo, Card, Chip, DrillSpec, ERROR_MEANING, Notice, Overview, SectionTitle, Skeleton, cx, fmtDate, pct } from '../campaigns/shared';
import DrilldownDrawer from '../campaigns/DrilldownDrawer';

/**
 * Live numbers for every text campaign. It reads the same per-text record as the Campaigns page (Twilio delivery, link clicks with bots
 * removed, replies and opt-outs), so the two pages always agree.
 */
export default function SMSCampaignAnalyticsPage() {
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [selected, setSelected] = useState('all');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillSpec | null>(null);
  const closeDrill = useCallback(() => setDrill(null), []);

  const load = useCallback(async (key: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/overview?batch=${encodeURIComponent(key)}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load campaign analytics');
      setBatches(j.batches ?? []); setData(j.overview?.empty ? null : j.overview); setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(selected); }, [selected, load]);
  useEffect(() => { const t = setInterval(() => load(selected, true), 60_000); return () => clearInterval(t); }, [selected, load]);

  const f = data?.funnel;
  const t = data?.totals;
  const queued = data && f ? Math.max(0, data.totals.texts - f.sent - (data.statuses.canceled ?? 0)) : 0;
  const undelivered = data ? (data.statuses.undelivered ?? 0) + (data.statuses.failed ?? 0) : 0;
  const steps = f ? [
    { key: 'sent', label: 'Sent', n: f.sent, metric: 'sent' }, { key: 'delivered', label: 'Delivered', n: f.delivered, metric: 'delivered' },
    { key: 'clicked', label: 'Opened the link', n: f.clicked, metric: 'clicked' }, { key: 'viewed', label: 'Viewed the estimate', n: f.viewed, metric: 'viewed' },
    { key: 'submitted', label: 'Submitted the form', n: f.submitted, metric: 'submitted' }, { key: 'replied', label: 'Replied', n: f.replied, metric: 'replied' },
  ] : [];

  const kpi = (label: string, value: string | number, sub: string, icon: React.ReactNode, tone: string, spec?: DrillSpec) => (
    <button key={label} onClick={spec ? () => setDrill(spec) : undefined} className={cx('text-left rounded-2xl border border-border bg-card p-4 transition-all', spec ? 'hover:shadow-md hover:-translate-y-0.5' : 'cursor-default')}>
      <div className="flex items-center justify-between"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><span className={cx('w-7 h-7 rounded-lg flex items-center justify-center', tone)}>{icon}</span></div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p><p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </button>
  );

  return (
    <AppLayout>
      <div className="px-4 sm:px-6 py-5 max-w-7xl mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">SMS Campaign Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Delivery, engagement and cost for every homeowner text campaign. A text counts as sent only once Twilio confirms it left the queue.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/campaigns" className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"><Megaphone size={14} /> Campaigns</Link>
            <Link href="/sms-inbound-threads" className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-border bg-card text-sm hover:bg-muted"><MessageSquare size={14} /> Inbound threads</Link>
            <button onClick={() => load(selected)} aria-label="Refresh" className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-border bg-card hover:bg-muted"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ batch: 'all', label: 'All campaigns' }, ...batches.map(b => ({ batch: b.batch, label: b.batch }))].map(b => (
            <button key={b.batch} onClick={() => setSelected(b.batch)} className={cx('shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors', selected === b.batch ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:border-primary/50')}>{b.label}</button>
          ))}
        </div>

        {error && <Notice tone="red"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</Notice>}
        {loading && !data && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>}
        {!loading && !data && !error && <Card className="p-10 text-center"><p className="font-semibold">No campaign data yet</p><p className="text-sm text-muted-foreground mt-1">Results appear here once the first campaign is scheduled.</p></Card>}

        {data && f && t && (
          <>
            {queued > 0 && <Notice tone="blue"><Clock size={15} className="mt-0.5 shrink-0" /> {queued} text{queued === 1 ? ' is' : 's are'} queued and have not gone out yet. They are not counted as sent.</Notice>}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {kpi('Texts', t.texts, `${f.sent} sent${queued ? ` · ${queued} queued` : ''}`, <Send size={14} />, 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300', { title: 'All texts', metric: 'texts', batch: selected })}
              {kpi('Delivered', f.delivered, `${pct(f.delivered, f.sent)}% of sent`, <CheckCircle2 size={14} />, 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300', { title: 'Delivered texts', metric: 'delivered', batch: selected })}
              {kpi('Undelivered', undelivered, f.sent ? `${pct(undelivered, f.sent)}% of sent` : 'none sent yet', <XCircle size={14} />, 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300', { title: 'Not delivered', metric: 'notdelivered', batch: selected })}
              {kpi('Opened link', t.clicked, `${t.clickPct}% of delivered`, <MousePointerClick size={14} />, 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300', { title: 'Opened the link', metric: 'clicked', batch: selected })}
              {kpi('Submitted form', t.submitted, `${pct(t.submitted, f.delivered)}% of delivered`, <Eye size={14} />, 'bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300', { title: 'Submitted the form', metric: 'submitted', batch: selected })}
              {kpi('Replies', t.replied, `${t.yes} YES`, <MessageSquare size={14} />, 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300', { title: 'Replies', metric: 'replied', batch: selected })}
              {kpi('Opt-outs', t.optOut, `${pct(t.optOut, f.sent)}% of sent`, <ShieldOff size={14} />, 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300', { title: 'Opt-outs', metric: 'optout', batch: selected })}
              {kpi('Cost', `$${data.cost.totalUsd}`, data.cost.perClick != null ? `$${data.cost.perClick} per click` : `${data.cost.pricedTexts} priced texts`, <DollarSign size={14} />, 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300')}
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2 p-5">
                <SectionTitle title="Funnel" hint="How far homeowners get. The percentage is the share of texts that were sent." />
                <div className="space-y-2">
                  {steps.map(s => (
                    <button key={s.key} onClick={() => setDrill({ title: s.label, metric: s.metric, batch: selected })} className="w-full flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 text-left hover:bg-primary/5">
                      <span className="w-36 sm:w-44 text-xs text-muted-foreground shrink-0">{s.label}</span>
                      <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden"><div className="h-full bg-primary/70 rounded-md" style={{ width: `${f.sent ? Math.max(s.n ? 2 : 0, (s.n / f.sent) * 100) : 0}%` }} /></div>
                      <span className="w-24 text-right text-xs tabular-nums shrink-0">{s.n} <span className="text-muted-foreground">({pct(s.n, f.sent)}%)</span></span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">{data.botClicksFiltered} link-preview and scanner hits were removed from the click numbers.</p>
              </Card>
              <Card className="p-5 space-y-4">
                <div><SectionTitle title="Delivery status" />
                  <div className="text-xs space-y-1.5">{Object.entries(data.statuses).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted-foreground capitalize">{k}</span><b>{v}</b></div>)}</div></div>
                {Object.keys(data.deliveryErrors).length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Carrier errors</p>
                  <div className="text-xs space-y-1.5">{Object.entries(data.deliveryErrors).map(([k, v]) => <div key={k} className="flex justify-between gap-3" title={ERROR_MEANING[k]?.[1]}><span className="text-amber-600">{k}{ERROR_MEANING[k] ? ` · ${ERROR_MEANING[k][0]}` : ''}</span><b>{v}</b></div>)}</div></div>}
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Reply types</p>
                  <div className="flex flex-wrap gap-1.5">{Object.keys(data.replyIntents).length ? Object.entries(data.replyIntents).map(([k, v]) => <Chip key={k} tone={k === 'yes' ? 'green' : k === 'stop' || k === 'no' ? 'red' : 'muted'} className="uppercase">{k} {v}</Chip>) : <span className="text-xs text-muted-foreground">No replies yet</span>}</div></div>
              </Card>
            </div>

            <Card className="p-5">
              <SectionTitle title="Activity by day" hint="Mountain time. Sent and delivered use the delivery time Twilio reports; clicks and replies use when they happened." />
              {(data.daily?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">Nothing has gone out yet.</p> : (
                <div className="h-64"><ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Legend />
                    <Line type="monotone" dataKey="sent" name="Sent" stroke="#6366f1" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="delivered" name="Delivered" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="clicked" name="Opened link" stroke="#8b5cf6" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="replied" name="Replied" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart></ResponsiveContainer></div>
              )}
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{data.updatedAt ? `Data updated ${fmtDate(data.updatedAt)}.` : ''} Refreshes every minute.</span>
              <button onClick={() => setDrill({ title: selected === 'all' ? 'All texts' : `Texts in ${selected}`, metric: 'texts', batch: selected })} className="font-medium text-primary hover:underline inline-flex items-center gap-1">{loading && <Loader2 size={12} className="animate-spin" />}See every recipient</button>
            </div>
          </>
        )}
      </div>
      {drill && <DrilldownDrawer spec={drill} batch={selected} onClose={closeDrill} />}
    </AppLayout>
  );
}
