'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, Copy, DollarSign, Flame, Loader2, MessageSquare, MousePointerClick, Search, Send, ShieldOff, Sparkles, ArrowDown, ArrowUp, Eye, X, Check } from 'lucide-react';
import { BatchInfo, Card, Chip, Insights, Notice, Overview, SectionTitle, Skeleton, cx, fmtDate, pct, post } from './shared';

const BREAKDOWNS: Array<[string, string]> = [
  ['audience', 'Audience'], ['variant', 'Tone'], ['writtenBy', 'AI vs template'], ['segments', 'Length'], ['estimate', 'Estimate size'], ['state', 'State'],
  ['device', 'Device'], ['os', 'Phone OS'], ['sendHourUtc', 'Send hour (UTC)'], ['timeToClick', 'Time to click'], ['phone', 'Phone quality'], ['temperature', 'Outcome'],
];
const TEMP_STYLE: Record<string, string> = {
  wrong_contact: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', hot: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', warm: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  cold: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300', unreachable: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300', opted_out: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  declined: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300', untouched: 'bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400', pending: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
};

function status(b: BatchInfo): { label: string; tone: 'blue' | 'amber' | 'green' | 'muted' } {
  if (b.canceled >= b.texts) return { label: 'Canceled', tone: 'muted' };
  if (Date.parse(b.firstSend) > Date.now()) return { label: 'Scheduled', tone: 'blue' };
  return b.pending > 0 ? { label: 'Sending', tone: 'amber' } : { label: 'Complete', tone: 'green' };
}

function CampaignStrip({ batches, selected, onSelect, onCancelled }: { batches: BatchInfo[]; selected: string; onSelect: (k: string) => void; onCancelled: () => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function cancel(batch: string) {
    setBusy(batch); setMsg(null);
    try {
      const r = await post<{ canceled: number; failed: number; alreadySent: number }>('/api/campaigns/builder', { action: 'cancel', batch });
      setMsg(`Canceled ${r.canceled} unsent text${r.canceled === 1 ? '' : 's'}${r.failed ? `, ${r.failed} could not be canceled` : ''}.`); setConfirm(null); onCancelled();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }
  const all = batches.reduce((s, b) => s + b.texts, 0);
  return (
    <div className="space-y-2">
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        <button onClick={() => onSelect('all')} className={cx('snap-start shrink-0 w-44 text-left rounded-2xl border p-4 transition-all', selected === 'all' ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border bg-card hover:border-primary/50 hover:shadow-sm')}>
          <p className="text-xs text-muted-foreground">Everything</p><p className="font-semibold mt-0.5">All campaigns</p><p className="text-xs text-muted-foreground mt-2">{all} texts · {batches.length} campaign{batches.length === 1 ? '' : 's'}</p>
        </button>
        {batches.map(b => {
          const st = status(b); const sent = Math.max(0, b.texts - b.pending - b.canceled);
          return (
            <div key={b.batch} className={cx('snap-start shrink-0 w-64 rounded-2xl border p-4 transition-all', selected === b.batch ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border bg-card hover:border-primary/50 hover:shadow-sm')}>
              <button onClick={() => onSelect(b.batch)} className="text-left w-full">
                <div className="flex items-center justify-between gap-2"><Chip tone={st.tone}>{st.label}</Chip>{b.audience && <span className="text-[11px] text-muted-foreground truncate">{b.audience}</span>}</div>
                <p className="font-semibold text-sm mt-2 truncate" title={b.batch}>{b.batch}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{b.texts} texts · {fmtDate(b.firstSend)}</p>
                <div className="h-1.5 rounded-full bg-muted mt-3 overflow-hidden"><div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct(sent, b.texts)}%` }} /></div>
                <p className="text-[11px] text-muted-foreground mt-1">{sent} sent{b.pending ? ` · ${b.pending} waiting` : ''}{b.canceled ? ` · ${b.canceled} canceled` : ''}</p>
              </button>
              {b.pending > 0 && (confirm === b.batch ? (
                <div className="mt-3 flex items-center gap-1.5 text-xs"><span className="text-rose-600 font-medium">Cancel {b.pending}?</span>
                  <button disabled={busy === b.batch} onClick={() => cancel(b.batch)} className="px-2 py-1 rounded-lg bg-rose-600 text-white font-semibold disabled:opacity-60">{busy === b.batch ? <Loader2 size={12} className="animate-spin" /> : 'Yes'}</button>
                  <button onClick={() => setConfirm(null)} className="px-2 py-1 rounded-lg border border-border">Keep</button></div>
              ) : <button onClick={() => setConfirm(b.batch)} className="mt-3 text-xs text-muted-foreground hover:text-rose-600 inline-flex items-center gap-1"><X size={12} /> Cancel unsent texts</button>)}
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
  const [leadFilter, setLeadFilter] = useState<'all' | 'hot' | 'warm'>('all');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

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
  const leads = useMemo(() => (data?.hotLeads ?? []).filter(h => (leadFilter === 'all' || h.temperature === leadFilter) && (!query || `${h.address} ${h.owner ?? ''} ${h.phone ?? ''}`.toLowerCase().includes(query.toLowerCase()))), [data, leadFilter, query]);

  const th = (k: SortKey, label: string) => (
    <th className="pr-3 text-right"><button onClick={() => setSort(s => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }))} className="inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-foreground">{label}{sort.key === k && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</button></th>
  );
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard unavailable */ } }

  return (
    <div className="space-y-6">
      {batches.length > 0 && <CampaignStrip batches={batches} selected={selected} onSelect={setSelected} onCancelled={onReload} />}

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
            <Kpi label="Texts" value={data.totals.texts} sub={`${f.sent} sent`} icon={<Send size={14} />} tone="bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" active={focus === 'texts'} onClick={() => setFocus(focus === 'texts' ? null : 'texts')} />
            <Kpi label="Delivered" value={data.totals.delivered} sub={`${data.totals.deliveredPct}% of texts`} icon={<CheckCircle2 size={14} />} tone="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" active={focus === 'delivered'} onClick={() => setFocus(focus === 'delivered' ? null : 'delivered')} />
            <Kpi label="Opened link" value={data.totals.clicked} sub={`${data.totals.clickPct}% of delivered`} icon={<MousePointerClick size={14} />} tone="bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" active={focus === 'clicked'} onClick={() => setFocus(focus === 'clicked' ? null : 'clicked')} />
            <Kpi label="Viewed estimate" value={data.totals.viewed} sub={`${data.totals.viewPct}%`} icon={<Eye size={14} />} tone="bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300" active={focus === 'viewed'} onClick={() => setFocus(focus === 'viewed' ? null : 'viewed')} />
            <Kpi label="Submitted form" value={data.totals.submitted} sub={`${data.totals.submitPct}%`} icon={<CheckCircle2 size={14} />} tone="bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300" active={focus === 'submitted'} onClick={() => setFocus(focus === 'submitted' ? null : 'submitted')} />
            <Kpi label="Replies" value={data.totals.replied} sub={`${data.totals.yes} YES`} icon={<MessageSquare size={14} />} tone="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" />
            <Kpi label="Opt-outs" value={data.totals.optOut} sub={`${data.totals.optOutPct}%`} icon={<ShieldOff size={14} />} tone="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" />
            <Kpi label="Hot leads" value={data.totals.hot} sub={data.cost.perHotLead != null ? `$${data.cost.perHotLead} each` : undefined} icon={<Flame size={14} />} tone="bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 p-5 min-w-0">
              <SectionTitle title="Funnel" hint="How far homeowners get. The percentage in each bar is the share of all texts; the pill is how many carried on from the step before." />
              <div className="space-y-2">
                {steps.map((s, i) => {
                  const prev = i > 0 ? steps[i - 1].n : null; const w = f.texts ? Math.max(s.n ? 2 : 0, (s.n / f.texts) * 100) : 0;
                  return (
                    <div key={s.key} onMouseEnter={() => setFocus(s.key)} className={cx('flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 transition-colors', focus === s.key && 'bg-primary/5')}>
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
                <div className="text-xs space-y-1.5">{Object.entries(data.statuses).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted-foreground capitalize">{k}</span><b>{v}</b></div>)}
                  {Object.entries(data.deliveryErrors).map(([k, v]) => <div key={k} className="flex justify-between text-amber-600"><span>Error {k}</span><b>{v}</b></div>)}</div></div>
            </Card>
          </div>

          <Card className="p-5">
            <SectionTitle title="Skip-trace accuracy" hint="How reliable the phone numbers were, by audience. A delivered text shows a live phone, not that the owner read it, and wrong-person replies only count people who answered." />
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Audience</th><th className="pr-3 text-right">Landline or invalid before sending</th><th className="pr-3 text-right">Delivered</th><th className="pr-3 text-right">Wrong person</th><th className="pr-3 text-right">Engaged</th><th className="text-right">Likely reached</th></tr></thead>
              <tbody>{(data.skipTrace ?? []).map(s => (
                <tr key={s.audience} className="border-t border-border"><td className="py-2.5 pr-3 font-medium">{s.audience}</td>
                  <td className="pr-3 text-right tabular-nums">{s.landlinePct != null ? `${s.landlinePct}% (${(s.prefilterLandline ?? 0) + (s.prefilterInvalid ?? 0)} of ${s.screenedLeads})` : 'not recorded'}</td>
                  <td className="pr-3 text-right tabular-nums">{s.sent ? `${s.deliveredPct}% (${s.delivered} of ${s.sent})` : 'not sent yet'}</td>
                  <td className="pr-3 text-right tabular-nums">{s.wrongPerson}</td><td className="pr-3 text-right tabular-nums">{s.engaged} <span className="text-muted-foreground text-xs">({s.engagedPct}%)</span></td>
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
                <div className="inline-flex rounded-xl border border-border p-0.5 text-xs">{(['all', 'hot', 'warm'] as const).map(k => <button key={k} onClick={() => setLeadFilter(k)} className={cx('px-3 py-1 rounded-lg capitalize', leadFilter === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{k}</button>)}</div>
                <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" className="h-8 w-36 rounded-xl border border-border bg-background pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-primary/40" /></div></div>} />
            {data.hotLeads.length === 0 ? <p className="text-sm text-muted-foreground">No engaged leads yet. Homeowners who open the link, submit the form, ask for a call or reply will be listed here, strongest first.</p> : leads.length === 0 ? <p className="text-sm text-muted-foreground">Nothing matches that filter.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Lead</th><th className="pr-3">Status</th><th className="pr-3">Score</th><th className="pr-3">What they did</th><th>Phone</th></tr></thead>
                <tbody>{leads.map(h => (
                  <tr key={`${h.leadId}-${h.batch}`} className="border-t border-border align-top hover:bg-muted/40">
                    <td className="py-2.5 pr-3"><Link href={`/lead-profile?id=${h.leadId}`} className="font-medium text-primary hover:underline">{h.address || h.leadId}</Link><div className="text-[11px] text-muted-foreground">{h.owner ?? 'Owner unknown'}{h.stage ? ` · ${h.stage}` : ''}</div></td>
                    <td className="pr-3"><span className={cx('px-2 py-0.5 rounded-full text-[11px] font-semibold', TEMP_STYLE[h.temperature])}>{h.temperature}</span></td>
                    <td className="pr-3 tabular-nums">{h.score}</td><td className="pr-3 text-xs text-muted-foreground max-w-md">{h.why}</td>
                    <td className="text-xs whitespace-nowrap">{h.phone && <button onClick={() => copy(h.phone!)} title="Copy number" className="inline-flex items-center gap-1 hover:text-primary">{h.phone} {copied === h.phone ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} className="opacity-50" />}</button>}</td>
                  </tr>))}</tbody></table></div>)}
          </Card>

          <Card className="p-5">
            <SectionTitle title="What is working, by segment" hint="Click a column to sort. Small groups swing a lot, so treat differences under a few dozen texts as ideas to test, not conclusions." />
            <div className="flex flex-wrap gap-1.5 mb-4">{BREAKDOWNS.map(([k, label]) => <button key={k} onClick={() => setTab(k)} className={cx('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors', tab === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50')}>{label}</button>)}</div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Segment</th>{th('texts', 'Texts')}{th('deliveredPct', 'Delivered')}{th('clickPct', 'Opened')}{th('submitted', 'Submitted')}{th('replied', 'Replied')}{th('optOut', 'Opt-out')}{th('hot', 'Hot')}</tr></thead>
              <tbody>{rows.map(([k, b]) => (
                <tr key={k} className="border-t border-border hover:bg-muted/40"><td className="py-2.5 pr-3 font-medium">{k}{leading === k && <Chip tone="green" className="ml-2">Leading</Chip>}</td><td className="pr-3 text-right tabular-nums">{b.texts}</td><td className="pr-3 text-right tabular-nums">{b.deliveredPct}%</td>
                  <td className="pr-3 text-right tabular-nums"><div className="flex items-center justify-end gap-2"><span className="hidden sm:block w-16 h-1.5 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-primary" style={{ width: `${Math.min(100, b.clickPct)}%` }} /></span>{b.clicked} <span className="text-muted-foreground text-xs">({b.clickPct}%)</span></div></td>
                  <td className="pr-3 text-right tabular-nums">{b.submitted}</td><td className="pr-3 text-right tabular-nums">{b.replied}</td><td className="pr-3 text-right tabular-nums">{b.optOut}</td><td className="text-right tabular-nums">{b.hot}</td></tr>))}</tbody></table></div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-5"><SectionTitle title="Replies" />
              {data.replies.length === 0 ? <p className="text-sm text-muted-foreground">No replies yet.</p> : <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">{data.replies.map((r, i) => (
                <li key={i} className="text-sm"><Chip tone={r.intent === 'yes' ? 'green' : r.intent === 'stop' ? 'red' : 'muted'} className="mr-2 uppercase">{r.intent}</Chip>{r.text}<Link href={`/lead-profile?id=${r.leadId}`} className="ml-2 text-xs text-primary hover:underline">open lead</Link><div className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(r.at)}</div></li>))}</ul>}</Card>
            <Card className="p-5"><SectionTitle title="Questions asked in the chat" />
              {data.chatQuestions.length === 0 ? <p className="text-sm text-muted-foreground">No questions yet. This shows what homeowners want to know before they commit.</p> : <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">{data.chatQuestions.map((q, i) => <li key={i} className="text-sm rounded-xl bg-muted/60 px-3 py-2">&ldquo;{q}&rdquo;</li>)}</ul>}</Card>
          </div>
        </>
      )}
    </div>
  );
}
