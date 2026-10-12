'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Megaphone, RefreshCw, Download, Sparkles, Loader2, Flame, MessageSquare, MousePointerClick, Send, CheckCircle2, ShieldOff, DollarSign, AlertTriangle, Clock } from 'lucide-react';

interface BatchInfo { batch: string; texts: number; firstSend: string; lastSend: string; audience: string | null }
interface Bucket { texts: number; delivered: number; clicked: number; viewed: number; submitted: number; replied: number; yes: number; optOut: number; hot: number; cost: number; deliveredPct: number; clickPct: number; viewPct: number; submitPct: number; replyPct: number; optOutPct: number; hotPct: number }
interface Hot { leadId: string; batch: string; temperature: string; score: number; address: string; owner: string | null; stage: string | null; phone: string | null; why: string }
interface Overview {
  empty?: boolean; updatedAt?: string; final?: boolean; totals: Bucket;
  funnel: { texts: number; sent: number; delivered: number; clicked: number; viewed: number; contactStarted: number; submitted: number; replied: number; optedIn: number; optedOut: number };
  statuses: Record<string, number>; deliveryErrors: Record<string, number>; replyIntents: Record<string, number>;
  by: Record<string, Record<string, Bucket>>; hotLeads: Hot[]; replies: Array<{ leadId: string; at: string; intent: string; text: string }>; chatQuestions: string[];
  cost: { totalUsd: number; pricedTexts: number; perClick: number | null; perSubmission: number | null; perHotLead: number | null }; botClicksFiltered: number;
}
interface Insights { headline: string; whatWorked: string[]; whatDidNot: string[]; objections: string[]; nextCampaign: { audience: string; copyTests: string[]; sendTiming: string; followUp: string[] }; crmActions: string[]; dataGaps: string[]; confidence: string; _createdAt?: string }

const BREAKDOWNS: Array<[string, string]> = [
  ['audience', 'Audience'], ['variant', 'Tone'], ['writtenBy', 'AI vs template'], ['segments', 'Length'], ['estimate', 'Estimate size'], ['state', 'State'],
  ['device', 'Device'], ['os', 'Phone OS'], ['sendHourUtc', 'Send hour (UTC)'], ['timeToClick', 'Time to click'], ['phone', 'Phone quality'], ['temperature', 'Outcome'],
];
const TEMP_STYLE: Record<string, string> = { hot: 'bg-red-100 text-red-700', warm: 'bg-amber-100 text-amber-700', cold: 'bg-slate-100 text-slate-600', unreachable: 'bg-purple-100 text-purple-700', opted_out: 'bg-rose-100 text-rose-700', declined: 'bg-slate-200 text-slate-700', untouched: 'bg-slate-100 text-slate-500', pending: 'bg-blue-100 text-blue-700' };
const fmtDate = (s: string) => new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '0%');

function Kpi({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between text-muted-foreground"><span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>{icon}</div>
      <p className="mt-1.5 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function List({ title, items, tone = 'text-foreground' }: { title: string; items: string[]; tone?: string }) {
  if (!items?.length) return null;
  return (
    <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</p>
      <ul className="space-y-1.5">{items.map((t, i) => <li key={i} className={`text-sm leading-relaxed ${tone}`}>&bull; {t}</li>)}</ul></div>
  );
}

export default function CampaignsView() {
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [selected, setSelected] = useState('all');
  const [data, setData] = useState<Overview | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'refresh' | 'insights' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('audience');

  const load = useCallback(async (key: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/overview?batch=${encodeURIComponent(key)}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load campaigns');
      setBatches(j.batches ?? []); setData(j.overview?.empty ? null : j.overview); setInsights(j.insights ?? null); setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(selected); }, [selected, load]);
  useEffect(() => { const t = setInterval(() => load(selected, true), 60_000); return () => clearInterval(t); }, [selected, load]);

  async function refresh() {
    setBusy('refresh');
    try { await fetch('/api/campaigns/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch: selected }) }); await load(selected, true); }
    finally { setBusy(null); }
  }
  async function makeInsights() {
    setBusy('insights'); setError(null);
    try {
      const res = await fetch('/api/campaigns/insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch: selected }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not create insights');
      setInsights({ ...j.insights, _createdAt: new Date().toISOString() });
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  const f = data?.funnel;
  const notSent = !!f && f.sent === 0;
  const funnelRows = useMemo(() => f ? [
    ['Texts', f.texts], ['Sent', f.sent], ['Delivered', f.delivered], ['Opened the link', f.clicked], ['Viewed the estimate', f.viewed], ['Started the contact form', f.contactStarted], ['Submitted the form', f.submitted],
  ] as Array<[string, number]> : [], [f]);
  const rows = data?.by?.[tab] ? Object.entries(data.by[tab]) : [];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Megaphone size={20} className="text-primary" /> Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Delivery, engagement and outcomes for every text campaign, with takeaways for the next one.{data?.updatedAt && <> Updated {fmtDate(data.updatedAt)}.</>}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={selected} onChange={e => setSelected(e.target.value)} className="h-9 rounded-lg border border-border bg-card px-3 text-sm" aria-label="Campaign">
              <option value="all">All campaigns</option>
              {batches.map(b => <option key={b.batch} value={b.batch}>{b.batch} ({b.texts})</option>)}
            </select>
            <button onClick={refresh} disabled={busy !== null} className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-border bg-card text-sm hover:bg-muted disabled:opacity-60">
              {busy === 'refresh' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh data</button>
            <a href={`/api/campaigns/export?batch=${encodeURIComponent(selected)}`} className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-border bg-card text-sm hover:bg-muted"><Download size={14} /> Export CSV</a>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 flex items-center gap-2"><AlertTriangle size={15} /> {error}</div>}
        {loading && !data && <div className="py-20 flex justify-center text-muted-foreground"><Loader2 className="animate-spin" /></div>}
        {!loading && !data && !error && <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No campaign data yet. It appears here as soon as the first campaign is scheduled and the next collection run completes.</div>}

        {data && (
          <>
            {notSent && <div className="rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-sm px-4 py-3 flex items-center gap-2"><Clock size={15} /> {data.totals.texts} texts are scheduled and have not gone out yet. Numbers fill in automatically as they send, are delivered and homeowners respond.</div>}

            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
              <Kpi label="Texts" value={data.totals.texts} sub={`${f?.sent ?? 0} sent`} icon={<Send size={14} />} />
              <Kpi label="Delivered" value={data.totals.delivered} sub={`${data.totals.deliveredPct}% of texts`} icon={<CheckCircle2 size={14} />} />
              <Kpi label="Opened link" value={data.totals.clicked} sub={`${data.totals.clickPct}% of delivered`} icon={<MousePointerClick size={14} />} />
              <Kpi label="Viewed estimate" value={data.totals.viewed} sub={`${data.totals.viewPct}%`} icon={<MousePointerClick size={14} />} />
              <Kpi label="Submitted form" value={data.totals.submitted} sub={`${data.totals.submitPct}%`} icon={<CheckCircle2 size={14} />} />
              <Kpi label="Replies" value={data.totals.replied} sub={`${data.totals.yes} YES`} icon={<MessageSquare size={14} />} />
              <Kpi label="Opt-outs" value={data.totals.optOut} sub={`${data.totals.optOutPct}%`} icon={<ShieldOff size={14} />} />
              <Kpi label="Hot leads" value={data.totals.hot} sub={data.cost.perHotLead != null ? `$${data.cost.perHotLead} each` : undefined} icon={<Flame size={14} />} />
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold mb-3">Funnel</h2>
                <div className="space-y-2.5">
                  {funnelRows.map(([label, n]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="w-40 text-xs text-muted-foreground shrink-0">{label}</span>
                      <div className="flex-1 h-5 bg-muted rounded overflow-hidden"><div className="h-full bg-primary/70" style={{ width: `${f && f.texts ? Math.max(n ? 2 : 0, (n / f.texts) * 100) : 0}%` }} /></div>
                      <span className="w-24 text-right text-xs tabular-nums">{n} <span className="text-muted-foreground">({pct(n, f?.texts ?? 0)})</span></span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">{data.botClicksFiltered} link-preview and scanner hits were filtered out of the click numbers.</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div><h2 className="text-sm font-semibold mb-2">Cost</h2>
                  <p className="text-2xl font-bold">${data.cost.totalUsd}</p>
                  <p className="text-[11px] text-muted-foreground">Twilio message price for {data.cost.pricedTexts} sent texts, before carrier fees.</p>
                  <div className="mt-2 text-xs space-y-1"><div className="flex justify-between"><span className="text-muted-foreground">Per click</span><span>{data.cost.perClick != null ? `$${data.cost.perClick}` : '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Per submission</span><span>{data.cost.perSubmission != null ? `$${data.cost.perSubmission}` : '-'}</span></div></div></div>
                <div><h2 className="text-sm font-semibold mb-2">Delivery</h2>
                  <div className="text-xs space-y-1">{Object.entries(data.statuses).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted-foreground capitalize">{k}</span><span>{v}</span></div>)}
                    {Object.entries(data.deliveryErrors).map(([k, v]) => <div key={k} className="flex justify-between text-amber-700"><span>Error {k}</span><span>{v}</span></div>)}</div></div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2"><Sparkles size={15} className="text-primary" /> What to do next</h2>
                <button onClick={makeInsights} disabled={busy !== null || notSent} title={notSent ? 'Available once texts have gone out' : ''} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                  {busy === 'insights' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {insights ? 'Refresh insights' : 'Generate insights'}</button>
              </div>
              {!insights && <p className="text-sm text-muted-foreground">AI takeaways are written automatically 24 hours and 72 hours after a campaign's last text. You can also generate them now once results start to come in.</p>}
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
                  <p className="text-[11px] text-muted-foreground">{insights.confidence}{insights._createdAt && <> Written {fmtDate(insights._createdAt)}.</>}</p>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Flame size={15} className="text-red-500" /> Leads to follow up</h2>
              {data.hotLeads.length === 0 ? <p className="text-sm text-muted-foreground">No engaged leads yet. Homeowners who open the link, submit the form, ask for a call or reply will be listed here, strongest first.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Lead</th><th className="pr-3">Status</th><th className="pr-3">Score</th><th className="pr-3">What they did</th><th>Phone</th></tr></thead>
                  <tbody>{data.hotLeads.map(h => (
                    <tr key={`${h.leadId}-${h.batch}`} className="border-t border-border align-top">
                      <td className="py-2.5 pr-3"><Link href={`/lead-profile?id=${h.leadId}`} className="font-medium text-primary hover:underline">{h.address || h.leadId}</Link><div className="text-[11px] text-muted-foreground">{h.owner ?? 'Owner unknown'}{h.stage ? ` · ${h.stage}` : ''}</div></td>
                      <td className="pr-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${TEMP_STYLE[h.temperature] ?? ''}`}>{h.temperature}</span></td>
                      <td className="pr-3 tabular-nums">{h.score}</td><td className="pr-3 text-xs text-muted-foreground max-w-md">{h.why}</td><td className="text-xs whitespace-nowrap">{h.phone ?? ''}</td>
                    </tr>))}</tbody></table></div>)}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-3">What is working, by segment</h2>
              <div className="flex flex-wrap gap-1.5 mb-4">{BREAKDOWNS.map(([k, label]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${tab === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>{label}</button>)}</div>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Segment</th><th className="pr-3 text-right">Texts</th><th className="pr-3 text-right">Delivered</th><th className="pr-3 text-right">Opened</th><th className="pr-3 text-right">Submitted</th><th className="pr-3 text-right">Replied</th><th className="pr-3 text-right">Opt-out</th><th className="text-right">Hot</th></tr></thead>
                <tbody>{rows.map(([k, b]) => (
                  <tr key={k} className="border-t border-border"><td className="py-2 pr-3 font-medium">{k}</td><td className="pr-3 text-right tabular-nums">{b.texts}</td><td className="pr-3 text-right tabular-nums">{b.deliveredPct}%</td>
                    <td className="pr-3 text-right tabular-nums">{b.clicked} <span className="text-muted-foreground text-xs">({b.clickPct}%)</span></td><td className="pr-3 text-right tabular-nums">{b.submitted}</td><td className="pr-3 text-right tabular-nums">{b.replied}</td><td className="pr-3 text-right tabular-nums">{b.optOut}</td><td className="text-right tabular-nums">{b.hot}</td></tr>))}</tbody></table></div>
              <p className="text-[11px] text-muted-foreground mt-3">Small groups swing a lot. Treat differences under a few dozen texts as ideas to test, not conclusions.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-5"><h2 className="text-sm font-semibold mb-3">Replies</h2>
                {data.replies.length === 0 ? <p className="text-sm text-muted-foreground">No replies yet.</p> : <ul className="space-y-2.5 max-h-80 overflow-y-auto">{data.replies.map((r, i) => (
                  <li key={i} className="text-sm"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase mr-2 ${r.intent === 'yes' ? 'bg-emerald-100 text-emerald-700' : r.intent === 'stop' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{r.intent}</span>{r.text}<Link href={`/lead-profile?id=${r.leadId}`} className="ml-2 text-xs text-primary hover:underline">open lead</Link><div className="text-[11px] text-muted-foreground">{fmtDate(r.at)}</div></li>))}</ul>}</div>
              <div className="bg-card border border-border rounded-xl p-5"><h2 className="text-sm font-semibold mb-3">Questions asked in the chat</h2>
                {data.chatQuestions.length === 0 ? <p className="text-sm text-muted-foreground">No questions yet. This shows what homeowners want to know before they commit.</p> : <ul className="space-y-2 max-h-80 overflow-y-auto">{data.chatQuestions.map((q, i) => <li key={i} className="text-sm">&ldquo;{q}&rdquo;</li>)}</ul>}</div>
            </div>
          </>
        )}
    </div>
  );
}
