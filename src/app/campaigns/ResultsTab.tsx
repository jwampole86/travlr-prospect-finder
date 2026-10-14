'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Copy, DollarSign, Flame, Loader2, MessageSquare, MousePointerClick, Search, Send, ShieldOff, Sparkles, ArrowDown, ArrowUp, Eye, X, Check } from 'lucide-react';
import { BatchInfo, Card, Chip, DrillSpec, ERROR_MEANING, Hot, Insights, Notice, Overview, SectionTitle, Skeleton, TEMP_STYLE, cx, fmtDate, pct, post, timeAgo } from './shared';
import DrilldownDrawer from './DrilldownDrawer';

const BREAKDOWNS: Array<[string, string]> = [
  ['audience', 'Audience'], ['variant', 'Tone'], ['writtenBy', 'AI vs template'], ['segments', 'Length'], ['estimate', 'Estimate size'], ['state', 'State'],
  ['device', 'Device'], ['os', 'Phone OS'], ['sendHourUtc', 'Send hour (UTC)'], ['timeToClick', 'Time to click'], ['phone', 'Phone quality'], ['temperature', 'Outcome'],
];
const LEAD_GROUPS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'hot', label: 'Hot', hint: 'Submitted the form, asked for a call or replied YES. Call these first.' },
  { key: 'warm', label: 'Warm', hint: 'Opened the link, spent time on the estimate or replied.' },
  { key: 'wrong_contact', label: 'Wrong contact', hint: 'Said it is the wrong person or number. Find the right contact.' },
];
const LEAD_PREVIEW = 8;
const TIMELINE_PREVIEW = 15;
const FUNNEL_METRIC: Record<string, string> = { texts: 'texts', sent: 'sent', delivered: 'delivered', clicked: 'clicked', viewed: 'viewed', contact: 'contact', submitted: 'submitted' };

function status(b: BatchInfo, now = Date.now()): { label: string; tone: 'blue' | 'amber' | 'green' | 'muted' } {
  if (b.canceled >= b.texts) return { label: 'Canceled', tone: 'muted' };
  if (Date.parse(b.firstSend) > now) return { label: 'Scheduled', tone: 'blue' };
  return b.pending > 0 ? { label: 'Sending', tone: 'amber' } : { label: 'Complete', tone: 'green' };
}

function countdown(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000)); const d = Math.floor(t / 86400); const h = Math.floor((t % 86400) / 3600); const m = Math.floor((t % 3600) / 60); const sec = t % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
}

function CampaignStrip({ batches, selected, onSelect, onCancelled, onDrill }: { batches: BatchInfo[]; selected: string; onSelect: (k: string) => void; onCancelled: () => void; onDrill: (d: DrillSpec) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  async function cancel(batch: string) {
    setBusy(batch); setMsg(null);
    try {
      const r = await post<{ canceled: number; failed: number; alreadySent: number }>('/api/campaigns/builder', { action: 'cancel', batch });
      setMsg(`Canceled ${r.canceled} unsent text${r.canceled === 1 ? '' : 's'}${r.failed ? `, ${r.failed} could not be canceled` : ''}.`); setConfirm(null); onCancelled();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }
  const all = batches.reduce((s, b) => s + b.texts, 0);
  const ordered = useMemo(() => {
    const rank = (b: BatchInfo) => { const l = status(b, now).label; return l === 'Sending' ? 0 : l === 'Scheduled' ? 1 : l === 'Complete' ? 2 : 3; };
    return [...batches].sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? a.firstSend.localeCompare(b.firstSend) : b.firstSend.localeCompare(a.firstSend)));
  }, [batches, now]);
  return (
    <div className="space-y-2">
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        <button onClick={() => onSelect('all')} className={cx('snap-start shrink-0 w-44 text-left rounded-2xl border p-4 transition-all', selected === 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border bg-card hover:border-primary/50 hover:shadow-sm')}>
          <p className="text-xs text-muted-foreground">Everything</p><p className="font-semibold mt-0.5">All campaigns</p><p className="text-xs text-muted-foreground mt-2">{all} texts · {batches.length} campaign{batches.length === 1 ? '' : 's'}</p>
        </button>
        {ordered.map(b => {
          const st = status(b, now); const sent = Math.max(0, b.texts - b.pending - b.canceled);
          return (
            <div key={b.batch} className={cx('snap-start shrink-0 w-64 rounded-2xl border p-4 transition-all', selected === b.batch ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border bg-card hover:border-primary/50 hover:shadow-sm')}>
              <button onClick={() => onSelect(b.batch)} className="text-left w-full">
                <div className="flex items-center justify-between gap-2"><Chip tone={st.tone}>{st.label}</Chip>{b.audience && <span className="text-[11px] text-muted-foreground truncate">{b.audience}</span>}</div>
                <p className="font-semibold text-sm mt-2 truncate" title={b.batch}>{b.batch}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{b.texts} texts · {fmtDate(b.firstSend)}</p>
                <div className="h-1.5 rounded-full bg-muted mt-3 overflow-hidden"><div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct(sent, b.texts)}%` }} /></div>
                <p className="text-[11px] text-muted-foreground mt-1">{sent} sent{b.pending ? ` · ${b.pending} waiting` : ''}{b.canceled ? ` · ${b.canceled} canceled` : ''}</p>
              </button>
              {b.pending > 0 && (Date.parse(b.firstSend) > now
                ? <div className="mt-3 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 px-3 py-2"><p className="text-[11px] text-sky-700 dark:text-sky-300 inline-flex items-center gap-1"><Clock size={11} /> Starts in</p><p className="text-base font-bold tabular-nums text-sky-900 dark:text-sky-100 leading-tight">{countdown(Date.parse(b.firstSend) - now)}</p><p className="text-[11px] text-muted-foreground">{fmtDate(b.firstSend)}</p></div>
                : Date.parse(b.lastSend) > now
                  ? <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2"><p className="text-[11px] text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><Clock size={11} /> Sending now, last text in</p><p className="text-base font-bold tabular-nums leading-tight">{countdown(Date.parse(b.lastSend) - now)}</p><p className="text-[11px] text-muted-foreground">{fmtDate(b.lastSend)}</p></div>
                  : <p className="mt-3 text-[11px] text-muted-foreground inline-flex items-center gap-1"><Clock size={11} /> Waiting for Twilio to confirm delivery</p>)}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={() => onDrill({ title: `Texts in ${b.batch}`, metric: 'texts', batch: b.batch })} className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/5">View every text</button>
                {b.pending > 0 && confirm !== b.batch && <button onClick={() => setConfirm(b.batch)} className="h-8 px-3 rounded-lg border border-rose-500 text-rose-600 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-500/10 inline-flex items-center gap-1"><X size={12} /> Cancel unsent</button>}
              </div>
              {b.pending > 0 && confirm === b.batch && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs rounded-lg border border-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-2"><span className="text-rose-700 dark:text-rose-300 font-medium">Cancel {b.pending} unsent?</span>
                  <button disabled={busy === b.batch} onClick={() => cancel(b.batch)} className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-semibold disabled:opacity-60">{busy === b.batch ? <Loader2 size={12} className="animate-spin" /> : 'Yes, cancel'}</button>
                  <button onClick={() => setConfirm(null)} className="px-2.5 py-1 rounded-lg border border-border bg-background">Keep</button></div>)}
            </div>
          );
        })}
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

function Kpi({ label, value, sub, icon, active, onClick, tone }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; active?: boolean; onClick?: () => void; tone: string }) {
  return (
    <button onClick={onClick} className={cx('text-left rounded-2xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5', active ? 'border-primary ring-2 ring-primary/30' : 'border-border', !onClick && 'cursor-default')}>
      <div className="flex items-center justify-between"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><span className={cx('w-7 h-7 rounded-lg flex items-center justify-center', tone)}>{icon}</span></div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </button>
  );
}

function List({ title, items, tone = 'text-foreground' }: { title: string; items: string[]; tone?: string }) {
  if (!items?.length) return null;
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</p><ul className="space-y-1.5">{items.map((t, i) => <li key={i} className={`text-sm leading-relaxed ${tone}`}>&bull; {t}</li>)}</ul></div>;
}

type SortKey = 'texts' | 'deliveredPct' | 'clickPct' | 'submitted' | 'replied' | 'optOut' | 'hot';

export default function ResultsTab(props: {
  batches: BatchInfo[]; selected: string; setSelected: (k: string) => void; data: Overview | null; insights: Insights | null; loading: boolean; error: string | null;
  busy: 'refresh' | 'insights' | null; onInsights: () => void; onReload: () => void; onAskHelper: (goal: string) => void; onNew: () => void;
}) {
  const { batches, selected, setSelected, data, insights, loading, error, busy, onInsights, onReload, onAskHelper, onNew } = props;
  const [tab, setTab] = useState('audience');
  const [focus, setFocus] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'texts', dir: -1 });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ hot: true });
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [leadView, setLeadView] = useState<'timeline' | 'groups'>('timeline');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillSpec | null>(null);
  const closeDrill = useCallback(() => setDrill(null), []);

  const f = data?.funnel;
  const notSent = !!f && f.sent === 0;
  const steps = useMemo(() => f ? [
    { key: 'texts', label: 'Texts', n: f.texts }, { key: 'sent', label: 'Sent', n: f.sent }, { key: 'delivered', label: 'Delivered', n: f.delivered }, { key: 'clicked', label: 'Opened the link', n: f.clicked },
    { key: 'viewed', label: 'Viewed the estimate', n: f.viewed }, { key: 'contact', label: 'Started the contact form', n: f.contactStarted }, { key: 'submitted', label: 'Submitted the form', n: f.submitted },
  ] : [], [f]);

  const rows = useMemo(() => {
    const r = data?.by?.[tab] ? Object.entries(data.by[tab]) : [];
    return r.sort((a, b) => (a[1][sort.key] - b[1][sort.key]) * sort.dir);
  }, [data, tab, sort]);
  const leading = useMemo(() => { const c = rows.filter(([, b]) => b.texts >= 15 && b.delivered > 0); return c.length > 1 ? c.reduce((m, x) => (x[1].submitPct + x[1].replyPct > m[1].submitPct + m[1].replyPct ? x : m))[0] : null; }, [rows]);
  const leadGroups = useMemo(() => {
    const at = (h: Hot) => (h.lastActivityAt ? Date.parse(h.lastActivityAt) : 0);
    const found = (data?.hotLeads ?? []).filter(h => !query || `${h.address} ${h.owner ?? ''} ${h.phone ?? ''}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => order === 'newest' ? at(b) - at(a) || b.score - a.score : (at(a) || Infinity) - (at(b) || Infinity) || b.score - a.score);
    return { all: found, groups: LEAD_GROUPS.map(g => ({ ...g, rows: found.filter(h => h.temperature === g.key) })) };
  }, [data, query, order]);
  const groupOpen = (key: string, n: number) => (query ? n > 0 : !!openGroups[key]);

  const th = (k: SortKey, label: string) => (
    <th className="pr-3 text-right"><button onClick={() => setSort(s => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }))} className="inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-foreground">{label}{sort.key === k && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</button></th>
  );
  const METRIC_LABEL: Record<string, string> = { texts: 'texts', delivered: 'delivered', clicked: 'opened the link', submitted: 'submitted the form', replied: 'replied', optout: 'opted out', 'temp:hot': 'hot leads' };
  const seg = (n: number, metric: string, value: string, shown?: React.ReactNode) => n > 0
    ? <button onClick={() => setDrill({ title: `${BREAKDOWNS.find(([k]) => k === tab)?.[1] ?? tab}: ${value}, ${METRIC_LABEL[metric]}`, metric, group: tab, value })} className="hover:text-primary hover:underline">{shown ?? n}</button>
    : <>{shown ?? n}</>;
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard unavailable */ } }

  const leadTable = (list: Hot[], showTemp: boolean) => (
    <table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pl-4 pr-3">Lead</th><th className="pr-3 whitespace-nowrap">Last activity</th><th className="pr-3">Score</th><th className="pr-3">What they did</th><th className="pr-4">Phone</th></tr></thead>
      <tbody>{list.map(h => {
        const fresh = !!h.lastActivityAt && Date.now() - Date.parse(h.lastActivityAt) < 86_400_000;
        return (
          <tr key={`${h.leadId}-${h.batch}`} className="border-t border-border align-top hover:bg-muted/40">
            <td className="py-2.5 pl-4 pr-3"><Link href={`/lead-profile?id=${h.leadId}`} className="font-medium text-primary hover:underline">{h.address || h.leadId}</Link><div className="text-[11px] text-muted-foreground">{h.owner ?? 'Owner unknown'}{h.stage ? ` · ${h.stage}` : ''}</div>{showTemp && <span className={cx('mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold', TEMP_STYLE[h.temperature])}>{h.temperature.replace('_', ' ')}</span>}</td>
            <td className="pr-3 text-xs whitespace-nowrap">{h.lastActivityAt ? <><p className={cx('font-medium inline-flex items-center gap-1.5', fresh && 'text-emerald-600')}>{fresh && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}{timeAgo(h.lastActivityAt)}</p><p className="text-muted-foreground">{h.lastActivity}</p><p className="text-[11px] text-muted-foreground">{fmtDate(h.lastActivityAt)}</p></> : <span className="text-muted-foreground">-</span>}</td>
            <td className="pr-3 tabular-nums">{h.score}</td><td className="pr-3 text-xs text-muted-foreground max-w-md">{h.why}</td>
            <td className="pr-4 text-xs whitespace-nowrap"><div className="flex flex-col items-start gap-1">{h.phone && <button onClick={() => copy(h.phone!)} title="Copy number" className="inline-flex items-center gap-1 hover:text-primary">{h.phone} {copied === h.phone ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} className="opacity-50" />}</button>}
              <button onClick={() => setDrill({ title: h.address || 'Lead', metric: `temp:${h.temperature}`, batch: h.batch, openLead: { leadId: h.leadId, batch: h.batch } })} className="text-primary font-medium hover:underline">Message and timeline</button></div></td>
          </tr>);
      })}</tbody></table>
  );

  return (
    <div className="space-y-6">
      {batches.length > 0 && <CampaignStrip batches={batches} selected={selected} onSelect={setSelected} onCancelled={onReload} onDrill={setDrill} />}

      {error && <Notice tone="red"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</Notice>}
      {loading && !data && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>}
      {!loading && !data && !error && (
        <Card className="p-10 text-center"><p className="font-semibold">No campaign data yet</p><p className="text-sm text-muted-foreground mt-1 mb-4">Results appear here as soon as the first campaign sends.</p>
          <button onClick={onNew} className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Create a campaign</button></Card>
      )}

      {data && f && (
        <>
          {notSent && <Notice tone="blue"><Clock size={15} className="mt-0.5 shrink-0" /> {data.totals.texts} texts are scheduled and have not gone out yet. Numbers fill in automatically as they send, are delivered and homeowners respond.</Notice>}

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            <Kpi label="Texts" value={data.totals.texts} sub={`${f.sent} sent${data.totals.texts - f.sent - (data.statuses.canceled ?? 0) > 0 ? ` · ${data.totals.texts - f.sent - (data.statuses.canceled ?? 0)} queued` : ''}`} icon={<Send size={14} />} tone="bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" active={focus === 'texts'} onClick={() => setDrill({ title: 'All texts', metric: 'texts' })} />
            <Kpi label="Delivered" value={data.totals.delivered} sub={`${data.totals.deliveredPct}% of texts`} icon={<CheckCircle2 size={14} />} tone="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" active={focus === 'delivered'} onClick={() => setDrill({ title: 'Delivered texts', metric: 'delivered' })} />
            <Kpi label="Opened link" value={data.totals.clicked} sub={`${data.totals.clickPct}% of delivered`} icon={<MousePointerClick size={14} />} tone="bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" active={focus === 'clicked'} onClick={() => setDrill({ title: 'Opened the link', metric: 'clicked' })} />
            <Kpi label="Viewed estimate" value={data.totals.viewed} sub={`${data.totals.viewPct}%`} icon={<Eye size={14} />} tone="bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300" active={focus === 'viewed'} onClick={() => setDrill({ title: 'Viewed the estimate', metric: 'viewed' })} />
            <Kpi label="Submitted form" value={data.totals.submitted} sub={`${data.totals.submitPct}%`} icon={<CheckCircle2 size={14} />} tone="bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300" active={focus === 'submitted'} onClick={() => setDrill({ title: 'Submitted the form', metric: 'submitted' })} />
            <Kpi label="Replies" value={data.totals.replied} sub={`${data.totals.yes} YES`} icon={<MessageSquare size={14} />} tone="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" onClick={() => setDrill({ title: 'Replies', metric: 'replied' })} />
            <Kpi label="Opt-outs" value={data.totals.optOut} sub={`${data.totals.optOutPct}%`} icon={<ShieldOff size={14} />} tone="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" onClick={() => setDrill({ title: 'Opt-outs', metric: 'optout' })} />
            <Kpi label="Hot leads" value={data.totals.hot} sub={data.cost.perHotLead != null ? `$${data.cost.perHotLead} each` : undefined} icon={<Flame size={14} />} tone="bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" onClick={() => setDrill({ title: 'Hot leads', metric: 'temp:hot' })} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 p-5 min-w-0">
              <SectionTitle title="Funnel" hint="How far homeowners get. The percentage in each bar is the share of all texts; the pill is how many carried on from the step before." />
              <div className="space-y-2">
                {steps.map((s, i) => {
                  const prev = i > 0 ? steps[i - 1].n : null; const w = f.texts ? Math.max(s.n ? 2 : 0, (s.n / f.texts) * 100) : 0;
                  return (
                    <div key={s.key} role="button" tabIndex={0} title={`See the ${s.n} text${s.n === 1 ? '' : 's'} at this step`} onMouseEnter={() => setFocus(s.key)} onClick={() => setDrill({ title: s.label, metric: FUNNEL_METRIC[s.key] })} onKeyDown={e => e.key === 'Enter' && setDrill({ title: s.label, metric: FUNNEL_METRIC[s.key] })} className={cx('flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 transition-colors cursor-pointer hover:bg-primary/5', focus === s.key && 'bg-primary/5')}>
                      <span className="w-24 sm:w-44 text-xs text-muted-foreground shrink-0">{s.label}</span>
                      <div className="flex-1 min-w-8 h-6 bg-muted rounded-md overflow-hidden"><div className={cx('h-full rounded-md transition-all duration-700', focus === s.key ? 'bg-primary' : 'bg-primary/60')} style={{ width: `${w}%` }} /></div>
                      <span className="w-20 sm:w-28 text-right text-xs tabular-nums shrink-0">{s.n} <span className="text-muted-foreground">({pct(s.n, f.texts)}%)</span></span>
                      <span className="w-12 sm:w-14 text-right shrink-0">{prev ? <Chip tone={prev && s.n / prev >= 0.5 ? 'green' : 'muted'}>{pct(s.n, prev)}%</Chip> : null}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">{data.botClicksFiltered} link-preview and scanner hits were filtered out of the click numbers.</p>
            </Card>
            <Card className="p-5 space-y-5">
              <div><SectionTitle icon={<DollarSign size={15} className="text-primary" />} title="Cost" />
                <p className="text-3xl font-bold tabular-nums">${data.cost.totalUsd}</p>
                <p className="text-[11px] text-muted-foreground">Twilio price for {data.cost.pricedTexts} sent texts, before carrier fees.</p>
                <div className="mt-3 text-xs space-y-1.5"><div className="flex justify-between"><span className="text-muted-foreground">Per click</span><b>{data.cost.perClick != null ? `$${data.cost.perClick}` : '-'}</b></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Per submission</span><b>{data.cost.perSubmission != null ? `$${data.cost.perSubmission}` : '-'}</b></div></div></div>
              <div><SectionTitle title="Delivery" />
                <div className="text-xs space-y-1.5">{Object.entries(data.statuses).map(([k, v]) => <button key={k} onClick={() => setDrill({ title: `Texts with status "${k}"`, metric: `status:${k}` })} className="w-full flex justify-between rounded-md px-1 -mx-1 hover:bg-muted"><span className="text-muted-foreground capitalize">{k}</span><b>{v}</b></button>)}
                  {Object.entries(data.deliveryErrors).map(([k, v]) => <button key={k} onClick={() => setDrill({ title: `Error ${k}${ERROR_MEANING[k] ? `: ${ERROR_MEANING[k][0]}` : ''}`, metric: `error:${k}` })} title={ERROR_MEANING[k]?.[1]} className="w-full flex justify-between gap-3 text-amber-600 text-left rounded-md px-1 -mx-1 hover:bg-muted"><span>Error {k}{ERROR_MEANING[k] && <span className="text-muted-foreground"> · {ERROR_MEANING[k][0]}</span>}</span><b>{v}</b></button>)}</div></div>
            </Card>
          </div>

          <Card className="p-5">
            <SectionTitle title="Skip-trace accuracy" hint="How reliable the phone numbers were, by audience. A delivered text shows a live phone, not that the owner read it, and wrong-person replies only count people who answered." />
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Audience</th><th className="pr-3 text-right">Landline or invalid before sending</th><th className="pr-3 text-right">Delivered</th><th className="pr-3 text-right">Wrong person</th><th className="pr-3 text-right">Engaged</th><th className="text-right">Likely reached</th></tr></thead>
              <tbody>{(data.skipTrace ?? []).map(s => (
                <tr key={s.audience} className="border-t border-border"><td className="py-2.5 pr-3 font-medium">{s.audience}</td>
                  <td className="pr-3 text-right tabular-nums">{s.landlinePct != null ? `${s.landlinePct}% (${(s.prefilterLandline ?? 0) + (s.prefilterInvalid ?? 0)} of ${s.screenedLeads})` : 'not recorded'}</td>
                  <td className="pr-3 text-right tabular-nums">{s.sent ? <button onClick={() => setDrill({ title: `${s.audience}: delivered`, metric: 'delivered', group: 'audience', value: s.audience })} className="hover:text-primary hover:underline">{`${s.deliveredPct}% (${s.delivered} of ${s.sent})`}</button> : 'not sent yet'}</td>
                  <td className="pr-3 text-right tabular-nums">{s.wrongPerson ? <button onClick={() => setDrill({ title: `${s.audience}: wrong person`, metric: 'wrong_person', group: 'audience', value: s.audience })} className="hover:text-primary hover:underline">{s.wrongPerson}</button> : s.wrongPerson}</td><td className="pr-3 text-right tabular-nums">{s.engaged ? <button onClick={() => setDrill({ title: `${s.audience}: engaged`, metric: 'engaged', group: 'audience', value: s.audience })} className="hover:text-primary hover:underline">{s.engaged} <span className="text-muted-foreground text-xs">({s.engagedPct}%)</span></button> : <>{s.engaged} <span className="text-muted-foreground text-xs">({s.engagedPct}%)</span></>}</td>
                  <td className="text-right tabular-nums font-semibold">{s.sent ? `${s.likelyReachedPct}%` : '-'}</td></tr>))}</tbody></table></div>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={<Sparkles size={15} className="text-primary" />} title="What to do next"
              right={<button onClick={onInsights} disabled={busy !== null || notSent} title={notSent ? 'Available once texts have gone out' : ''} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                {busy === 'insights' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {insights ? 'Refresh insights' : 'Generate insights'}</button>} />
            {!insights && <p className="text-sm text-muted-foreground">AI takeaways are written automatically 24 and 72 hours after a campaign&apos;s last text. You can also generate them now once results start to come in.</p>}
            {insights && (
              <div className="space-y-4">
                <p className="text-sm font-medium">{insights.headline}</p>
                <div className="grid md:grid-cols-2 gap-5">
                  <List title="What worked" items={insights.whatWorked} /><List title="What did not" items={insights.whatDidNot} />
                  <List title="What homeowners worry about" items={insights.objections} />
                  <div className="space-y-4">
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Next campaign</p><p className="text-sm">{insights.nextCampaign.audience}</p>{insights.nextCampaign.sendTiming && <p className="text-sm text-muted-foreground mt-1">Timing: {insights.nextCampaign.sendTiming}</p>}</div>
                    <List title="Copy to test" items={insights.nextCampaign.copyTests} /><List title="Follow-up" items={insights.nextCampaign.followUp} />
                  </div>
                  <List title="CRM actions" items={insights.crmActions} /><List title="Data gaps" items={insights.dataGaps} tone="text-muted-foreground" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <p className="text-[11px] text-muted-foreground">{insights.confidence}{insights._createdAt && <> Written {fmtDate(insights._createdAt)}.</>}</p>
                  <button onClick={() => onAskHelper(`Plan the next campaign. ${insights.nextCampaign.audience}`.slice(0, 600))} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-xl border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/5"><Sparkles size={13} /> Plan it with the AI helper</button>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle icon={<Flame size={15} className="text-red-500" />} title="Leads to follow up"
              right={<div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">{([['timeline', 'By activity'], ['groups', 'By outcome']] as const).map(([k, l]) => <button key={k} onClick={() => setLeadView(k)} className={cx('px-2.5 py-1', leadView === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{l}</button>)}</div>
                <button onClick={() => setOrder(o => o === 'newest' ? 'oldest' : 'newest')} title="Change the order" className="px-2.5 py-1 rounded-lg border border-border text-xs hover:bg-muted inline-flex items-center gap-1">{order === 'newest' ? <ArrowDown size={11} /> : <ArrowUp size={11} />}{order === 'newest' ? 'Newest first' : 'Oldest first'}</button>
                {leadView === 'groups' && <div className="inline-flex gap-1 text-xs"><button onClick={() => setOpenGroups(Object.fromEntries(LEAD_GROUPS.map(g => [g.key, true])))} className="px-2.5 py-1 rounded-lg border border-border hover:bg-muted">Expand all</button><button onClick={() => setOpenGroups({})} className="px-2.5 py-1 rounded-lg border border-border hover:bg-muted">Collapse all</button></div>}
                <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" className="h-8 w-36 rounded-xl border border-border bg-background pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-primary/40" /></div></div>} />
            {data.hotLeads.length === 0 ? <p className="text-sm text-muted-foreground">No engaged leads yet. Homeowners who open the link, submit the form, ask for a call or reply will be listed here, newest activity first.</p> : leadGroups.all.length === 0 ? <p className="text-sm text-muted-foreground">Nothing matches that search.</p> : leadView === 'timeline' ? (
              <div className="rounded-xl border border-border overflow-hidden"><div className="overflow-x-auto">{leadTable(showAll.timeline || query ? leadGroups.all : leadGroups.all.slice(0, TIMELINE_PREVIEW), true)}</div>
                {leadGroups.all.length > TIMELINE_PREVIEW && !query && <button onClick={() => setShowAll(x => ({ ...x, timeline: !x.timeline }))} className="w-full py-2 text-xs font-medium text-primary hover:bg-muted/40 border-t border-border">{showAll.timeline ? 'Show fewer' : `Show all ${leadGroups.all.length}`}</button>}</div>
            ) : (
              <div className="space-y-2.5">{leadGroups.groups.filter(g => g.rows.length > 0 || !query).map(g => {
                const open = groupOpen(g.key, g.rows.length); const shownRows = showAll[g.key] || query ? g.rows : g.rows.slice(0, LEAD_PREVIEW);
                return (
                  <div key={g.key} className="rounded-xl border border-border overflow-hidden">
                    <button onClick={() => setOpenGroups(o => ({ ...o, [g.key]: !o[g.key] }))} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 text-left">
                      <ChevronDown size={15} className={cx('shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} />
                      <span className={cx('px-2 py-0.5 rounded-full text-[11px] font-semibold', TEMP_STYLE[g.key])}>{g.label}</span>
                      <span className="text-sm font-semibold tabular-nums">{g.rows.length}</span>
                      <span className="text-xs text-muted-foreground truncate">{g.hint}</span>
                      <span role="button" tabIndex={0} onClick={e => { e.stopPropagation(); setDrill({ title: `${g.label} leads`, metric: `temp:${g.key}` }); }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setDrill({ title: `${g.label} leads`, metric: `temp:${g.key}` }); } }} className="ml-auto shrink-0 text-xs font-medium text-primary hover:underline">See all</span>
                    </button>
                    {open && (g.rows.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">No leads here yet.</p> : (
                      <div className="overflow-x-auto">{leadTable(shownRows, false)}
                        {g.rows.length > LEAD_PREVIEW && !query && <button onClick={() => setShowAll(s => ({ ...s, [g.key]: !s[g.key] }))} className="w-full py-2 text-xs font-medium text-primary hover:bg-muted/40 border-t border-border">{showAll[g.key] ? 'Show fewer' : `Show all ${g.rows.length}`}</button>}
                      </div>))}
                  </div>);
              })}</div>)}
          </Card>

          <Card className="p-5">
            <SectionTitle title="What is working, by segment" hint="Click a column to sort. Small groups swing a lot, so treat differences under a few dozen texts as ideas to test, not conclusions." />
            <div className="flex flex-wrap gap-1.5 mb-4">{BREAKDOWNS.map(([k, label]) => <button key={k} onClick={() => setTab(k)} className={cx('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors', tab === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50')}>{label}</button>)}</div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Segment</th>{th('texts', 'Texts')}{th('deliveredPct', 'Delivered')}{th('clickPct', 'Opened')}{th('submitted', 'Submitted')}{th('replied', 'Replied')}{th('optOut', 'Opt-out')}{th('hot', 'Hot')}</tr></thead>
              <tbody>{rows.map(([k, b]) => (
                <tr key={k} className="border-t border-border hover:bg-muted/40"><td className="py-2.5 pr-3 font-medium">{k}{leading === k && <Chip tone="green" className="ml-2">Leading</Chip>}</td><td className="pr-3 text-right tabular-nums">{seg(b.texts, 'texts', k, String(b.texts))}</td><td className="pr-3 text-right tabular-nums">{seg(b.delivered, 'delivered', k, `${b.deliveredPct}%`)}</td>
                  <td className="pr-3 text-right tabular-nums"><div className="flex items-center justify-end gap-2"><span className="hidden sm:block w-16 h-1.5 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-primary" style={{ width: `${Math.min(100, b.clickPct)}%` }} /></span>{seg(b.clicked, 'clicked', k, <>{b.clicked} <span className="text-muted-foreground text-xs">({b.clickPct}%)</span></>)}</div></td>
                  <td className="pr-3 text-right tabular-nums">{seg(b.submitted, 'submitted', k)}</td><td className="pr-3 text-right tabular-nums">{seg(b.replied, 'replied', k)}</td><td className="pr-3 text-right tabular-nums">{seg(b.optOut, 'optout', k)}</td><td className="text-right tabular-nums">{seg(b.hot, 'temp:hot', k)}</td></tr>))}</tbody></table></div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-5"><SectionTitle title="Replies" right={data.replies.length > 0 ? <button onClick={() => setDrill({ title: 'Replies', metric: 'replied' })} className="text-xs font-medium text-primary hover:underline">See all</button> : undefined} />
              {data.replies.length === 0 ? <p className="text-sm text-muted-foreground">No replies yet.</p> : <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">{data.replies.map((r, i) => (
                <li key={i} className="text-sm"><Chip tone={r.intent === 'yes' ? 'green' : r.intent === 'stop' ? 'red' : 'muted'} className="mr-2 uppercase">{r.intent}</Chip>{r.text}<button onClick={() => setDrill({ title: 'Replies', metric: 'replied', batch: r.batch, openLead: { leadId: r.leadId, batch: r.batch } })} className="ml-2 text-xs text-primary hover:underline">details</button><Link href={`/lead-profile?id=${r.leadId}`} className="ml-2 text-xs text-primary hover:underline">open lead</Link><div className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(r.at)}</div></li>))}</ul>}</Card>
            <Card className="p-5"><SectionTitle title="Questions asked in the chat" />
              {data.chatQuestions.length === 0 ? <p className="text-sm text-muted-foreground">No questions yet. This shows what homeowners want to know before they commit.</p> : <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">{data.chatQuestions.map((q, i) => <li key={i} className="text-sm rounded-xl bg-muted/60 px-3 py-2">&ldquo;{q}&rdquo;</li>)}</ul>}</Card>
          </div>
        </>
      )}
      {drill && <DrilldownDrawer spec={drill} batch={selected} onClose={closeDrill} />}
    </div>
  );
}
