'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, ArrowDownRight, ArrowUpRight, Download, Lightbulb, Mail, Minus, Phone, RefreshCw, Sparkles, Wallet } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { authFetch } from '@/lib/authFetch';
import type { AnalyticsOverview, CampaignRow, GroupRow, Kpi } from '@/lib/analyticsTypes';

const RANGES = [7, 14, 30, 60, 90];
const C = { texts: '#0ea5e9', clicks: '#8b5cf6', replies: '#10b981', emails: '#f59e0b', calls: '#f43f5e', grid: 'rgba(148,163,184,0.25)' };
const PALETTE = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#64748b', '#14b8a6', '#ec4899'];

const nf = (n: number) => n.toLocaleString('en-US');
const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const rate = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const short = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;

function formatKpi(k: Kpi) { return k.format === 'percent' ? `${k.value}%` : k.format === 'currency' ? money(k.value) : nf(k.value); }

function Delta({ k }: { k: Kpi }) {
  if (k.prev == null) return null;
  if (k.prev === 0 && k.value === 0) return <span className="text-xs text-muted-foreground inline-flex items-center gap-0.5"><Minus size={12} />no change</span>;
  const diff = k.format === 'percent' ? k.value - k.prev : k.prev === 0 ? null : ((k.value - k.prev) / k.prev) * 100;
  const up = k.value >= k.prev;
  const good = k.invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const text = diff == null ? 'up from 0' : k.format === 'percent' ? `${Math.abs(diff).toFixed(1)} pts` : `${Math.abs(diff).toFixed(0)}%`;
  return <span className={`text-xs font-medium inline-flex items-center gap-0.5 ${good ? 'text-emerald-600' : 'text-rose-600'}`}><Icon size={13} />{text}{diff != null && <span className="text-muted-foreground font-normal"> vs prior</span>}</span>;
}

function Card({ title, sub, children, className = '', action }: { title: string; sub?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div><h2 className="text-sm font-semibold text-foreground">{title}</h2>{sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

const tooltipStyle = { borderRadius: 12, border: '1px solid rgba(148,163,184,0.3)', fontSize: 12, background: 'var(--card, #fff)' };

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<Record<string, boolean>>({ texts: true, clicks: true, replies: true, emails: true });
  const [group, setGroup] = useState<'states' | 'sources'>('states');
  const [sort, setSort] = useState<keyof CampaignRow>('firstSend');

  const load = useCallback(async (range: number) => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`/api/analytics/overview?days=${range}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load analytics');
      setData(json);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load analytics'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(days); }, [days, load]);

  const campaigns = useMemo(() => [...(data?.campaigns ?? [])].sort((a, b) => (sort === 'firstSend' ? b.firstSend.localeCompare(a.firstSend) : Number(b[sort]) - Number(a[sort]))), [data, sort]);
  const hours = useMemo(() => (data?.hours ?? []).filter((h) => h.hour >= 6 && h.hour <= 21).map((h) => ({ ...h, label: hourLabel(h.hour), replyRate: h.sent ? Number(((h.replied / h.sent) * 100).toFixed(1)) : 0 })), [data]);
  const maxFunnel = Math.max(1, ...(data?.funnel ?? []).map((f) => f.value));
  const groupRows: GroupRow[] = data ? data[group] : [];

  const exportCsv = () => {
    if (!data) return;
    const head = ['Campaign', 'Audience', 'First send', 'Texts', 'Sent', 'Delivered', 'Clicked', 'Replied', 'Hot or warm', 'Opted out', 'Cost USD'];
    const lines = data.campaigns.map((c) => [c.batch, c.audience ?? '', c.firstSend, c.texts, c.sent, c.delivered, c.clicked, c.replied, c.hot, c.optedOut, c.cost].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `campaigns-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">How outreach is performing, where results come from, and what to do next. {data && <span>Updated {new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.</span>}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-border bg-card p-0.5" role="group" aria-label="Date range">
              {RANGES.map((r) => <button key={r} onClick={() => setDays(r)} className={`px-3 h-8 rounded-[10px] text-sm font-medium transition-colors ${days === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{r}d</button>)}
            </div>
            <button onClick={() => load(days)} disabled={loading} aria-label="Refresh" className="h-9 w-9 rounded-xl border border-border inline-flex items-center justify-center hover:bg-muted disabled:opacity-60"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </header>

        {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm flex items-center gap-2 text-destructive"><AlertCircle size={16} />{error}<button onClick={() => load(days)} className="ml-auto underline">Try again</button></div>}

        {!data && loading && (
          <div className="space-y-4 animate-pulse"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-muted" />)}</div><div className="h-80 rounded-2xl bg-muted" /></div>
        )}

        {data && (
          <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {data.kpis.map((k) => (
                <div key={k.key} className="rounded-2xl border border-border bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                  <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{formatKpi(k)}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2"><Delta k={k} />{k.sub && <span className="text-xs text-muted-foreground">{k.sub}</span>}</div>
                </div>
              ))}
            </section>

            {data.insights.length > 0 && (
              <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Sparkles size={14} className="text-primary" />What the numbers say</h2>
                <ul className="mt-2 grid md:grid-cols-2 gap-x-6 gap-y-1.5">
                  {data.insights.map((t) => <li key={t} className="text-sm text-foreground/90 flex gap-2"><Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-500" />{t}</li>)}
                </ul>
              </section>
            )}

            <Card title="Daily activity" sub="Texts, link clicks, replies and co-host emails per day (Mountain time)"
              action={<div className="flex flex-wrap gap-1.5">{([['texts', 'Texts'], ['clicks', 'Clicks'], ['replies', 'Replies'], ['emails', 'Emails']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setSeries((s) => ({ ...s, [k]: !s[k] }))} aria-pressed={series[k]} className={`px-2.5 h-7 rounded-full text-xs font-medium border transition-colors ${series[k] ? 'text-white border-transparent' : 'text-muted-foreground border-border'}`} style={series[k] ? { background: C[k] } : undefined}>{label}</button>
              ))}</div>}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs><linearGradient id="gTexts" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.texts} stopOpacity={0.35} /><stop offset="100%" stopColor={C.texts} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="date" tickFormatter={short} tick={{ fontSize: 11 }} minTickGap={24} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip labelFormatter={(l) => short(String(l))} contentStyle={tooltipStyle} />
                    {series.texts && <Area type="monotone" dataKey="texts" name="Texts" stroke={C.texts} fill="url(#gTexts)" strokeWidth={2} />}
                    {series.emails && <Area type="monotone" dataKey="emails" name="Emails" stroke={C.emails} fill="none" strokeWidth={2} />}
                    {series.replies && <Line type="monotone" dataKey="replies" name="Replies" stroke={C.replies} strokeWidth={2} dot={false} />}
                    {series.clicks && <Line type="monotone" dataKey="clicks" name="Clicks" stroke={C.clicks} strokeWidth={2} dot={false} />}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid lg:grid-cols-2 gap-5">
              <Card title="Outreach funnel" sub="Texts sent in this period and how far owners got">
                <ul className="space-y-2.5">
                  {data.funnel.map((f, i) => {
                    // Everything after "Delivered" is shown against delivered texts; viewing is shown against link opens.
                    const base = i === 0 ? null : f.label === 'Viewed the estimate' ? data.funnel[i - 1] : i === 1 ? data.funnel[0] : data.funnel[1];
                    const prev = base ? base.value : null;
                    const baseLabel = base ? (base.label === 'Texts sent' ? 'sent' : base.label === 'Delivered' ? 'delivered' : 'link opens') : '';
                    return (
                      <li key={f.label}>
                        <div className="flex items-baseline justify-between text-sm"><span className="text-foreground">{f.label}</span><span className="tabular-nums"><span className="font-semibold text-foreground">{nf(f.value)}</span>{prev ? <span className="text-xs text-muted-foreground"> · {rate(f.value, prev)} of {baseLabel}</span> : null}</span></div>
                        <div className="mt-1 h-2.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (f.value / maxFunnel) * 100)}%`, background: PALETTE[i % PALETTE.length] }} /></div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">Replies include opt-outs such as STOP, so the reply step can be higher than link clicks.</p>
              </Card>

              <Card title="Best time to text" sub="Reply rate by the hour texts were sent (Mountain time, all campaigns)">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hours} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid stroke={C.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v, _n, p) => [`${v}% (${(p.payload as { replied: number }).replied} of ${(p.payload as { sent: number }).sent} texts)`, 'Reply rate']} />
                      <Bar dataKey="replyRate" radius={[6, 6, 0, 0]}>{hours.map((h) => <Cell key={h.hour} fill={h.sent >= 25 ? C.replies : 'rgba(148,163,184,0.45)'} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground">Grey bars have fewer than 25 texts, so treat them as noise.</p>
              </Card>
            </div>

            <Card title="Campaigns" sub="Every text campaign, newest first" action={<button onClick={exportCsv} className="h-8 px-3 rounded-xl border border-border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted"><Download size={13} />Export CSV</button>}>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      {([['batch', 'Campaign'], ['sent', 'Sent'], ['delivered', 'Delivered'], ['clicked', 'Clicks'], ['replied', 'Replies'], ['hot', 'Hot/warm'], ['optedOut', 'Opt-outs']] as Array<[keyof CampaignRow, string]>).map(([k, label]) => (
                        <th key={k} className="px-2 py-2 font-medium"><button onClick={() => setSort(k === 'batch' ? 'firstSend' : k)} className={`hover:text-foreground ${sort === (k === 'batch' ? 'firstSend' : k) ? 'text-foreground' : ''}`}>{label}</button></th>
                      ))}
                      <th className="px-2 py-2 font-medium text-right">Reply rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {campaigns.map((c) => (
                      <tr key={c.batch} className="hover:bg-muted/40">
                        <td className="px-2 py-2.5"><p className="font-medium text-foreground truncate max-w-[280px]" title={c.batch}>{c.batch}</p><p className="text-xs text-muted-foreground">{c.audience ?? 'mixed'} · {new Date(c.firstSend).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p></td>
                        <td className="px-2 tabular-nums">{nf(c.sent)}</td><td className="px-2 tabular-nums">{rate(c.delivered, c.sent)}</td><td className="px-2 tabular-nums">{c.clicked}</td><td className="px-2 tabular-nums">{c.replied}</td><td className="px-2 tabular-nums">{c.hot}</td><td className="px-2 tabular-nums">{c.optedOut}</td>
                        <td className="px-2 text-right"><span className="inline-block min-w-[3.5rem] text-xs font-semibold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-700">{rate(c.replied, c.delivered)}</span></td>
                      </tr>
                    ))}
                    {campaigns.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">No campaigns yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid lg:grid-cols-3 gap-5">
              <Card className="lg:col-span-2" title={group === 'states' ? 'Markets' : 'Lead sources'} sub="Leads in the pipeline, how many were texted, and how they responded"
                action={<div className="inline-flex rounded-xl border border-border p-0.5">{(['states', 'sources'] as const).map((g) => <button key={g} onClick={() => setGroup(g)} className={`px-2.5 h-7 rounded-[9px] text-xs font-medium capitalize ${group === g ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{g === 'states' ? 'State' : 'Source'}</button>)}</div>}>
                <ul className="divide-y divide-border">
                  {groupRows.map((g) => {
                    const max = Math.max(1, ...groupRows.map((x) => x.leads));
                    return (
                      <li key={g.key} className="py-2.5 flex items-center gap-3">
                        <span className="w-28 shrink-0 text-sm font-medium text-foreground truncate" title={g.key}>{g.key}</span>
                        <div className="flex-1 min-w-0"><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary/80 rounded-full" style={{ width: `${(g.leads / max) * 100}%` }} /></div></div>
                        <span className="w-16 text-right text-sm tabular-nums text-foreground">{nf(g.leads)}</span>
                        <span className="hidden sm:block w-24 text-right text-xs text-muted-foreground tabular-nums">{g.texted ? `${rate(g.replied, g.texted)} replied` : 'not texted'}</span>
                        <span className="hidden md:block w-20 text-right text-xs text-muted-foreground tabular-nums">score {g.avgScore}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              <Card title="Lead quality" sub="Prospect score of every lead">
                <div className="h-44"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.scoreBands} dataKey="value" nameKey="label" innerRadius={46} outerRadius={72} paddingAngle={2}>{data.scoreBands.map((_, i) => <Cell key={i} fill={['#10b981', '#0ea5e9', '#f59e0b', '#94a3b8'][i]} />)}</Pie><Tooltip contentStyle={tooltipStyle} formatter={(v) => nf(Number(v))} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer></div>
                <div className="mt-2 space-y-1.5">
                  {data.regulation.slice(0, 4).map((r) => <div key={r.label} className="flex justify-between text-xs"><span className="text-muted-foreground">Rules: {r.label}</span><span className="tabular-nums text-foreground">{nf(r.value)}</span></div>)}
                </div>
              </Card>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              <Card title="Co-host emails" sub="This period"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Mail size={14} /></div>
                <dl className="grid grid-cols-2 gap-y-2 text-sm">{([['Sent', data.email.sent], ['Delivered', data.email.delivered], ['Opened', data.email.opened], ['Replied', data.email.replied], ['Bounced', data.email.bounced]] as const).map(([l, v]) => <React.Fragment key={l}><dt className="text-muted-foreground">{l}</dt><dd className="text-right tabular-nums text-foreground">{v}</dd></React.Fragment>)}</dl>
              </Card>
              <Card title="Calls" sub="This period"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Phone size={14} /></div>
                <dl className="grid grid-cols-2 gap-y-2 text-sm"><dt className="text-muted-foreground">Calls made</dt><dd className="text-right tabular-nums text-foreground">{data.calls.total}</dd><dt className="text-muted-foreground">Minutes talked</dt><dd className="text-right tabular-nums text-foreground">{data.calls.totalMinutes}</dd><dt className="text-muted-foreground">Average call</dt><dd className="text-right tabular-nums text-foreground">{data.calls.avgMinutes} min</dd></dl>
              </Card>
              <Card title="Text spend" sub="Carrier cost for texts in this period"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Wallet size={14} /></div>
                <dl className="grid grid-cols-2 gap-y-2 text-sm"><dt className="text-muted-foreground">Total</dt><dd className="text-right tabular-nums text-foreground">${data.spend.total.toFixed(2)}</dd><dt className="text-muted-foreground">Per reply</dt><dd className="text-right tabular-nums text-foreground">{data.spend.perReply != null ? `$${data.spend.perReply.toFixed(2)}` : '—'}</dd><dt className="text-muted-foreground">Per hot or warm owner</dt><dd className="text-right tabular-nums text-foreground">{data.spend.perHotLead != null ? `$${data.spend.perHotLead.toFixed(2)}` : '—'}</dd><dt className="text-muted-foreground">Per link click</dt><dd className="text-right tabular-nums text-foreground">{data.spend.perClick != null ? `$${data.spend.perClick.toFixed(2)}` : '—'}</dd></dl>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
