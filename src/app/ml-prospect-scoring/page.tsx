'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowUpRight, Flame, Loader2, MessageSquare, MousePointerClick, RefreshCw, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import AppLayout from '@/components/AppLayout';
import { authFetch } from '@/lib/authFetch';
import type { EngagedProspect, EngagedProspectsResponse } from '@/lib/engagedProspectTypes';

type Filter = 'all' | 'hot' | 'warm' | 'replied' | 'clicked';
type Ai = { score: number; reasoning: string; action?: string; flags?: string[]; model?: string };

const TEMP_STYLE: Record<string, string> = { hot: 'bg-rose-500/10 text-rose-600', warm: 'bg-amber-500/10 text-amber-600', cold: 'bg-muted text-muted-foreground' };
const TEMP_FILL: Record<string, string> = { hot: '#e11d48', warm: '#d97706', cold: '#94a3b8' };

export default function ProspectScoringPage() {
  const [data, setData] = useState<EngagedProspectsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [engagementWeight, setEngagementWeight] = useState(60);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [ai, setAi] = useState<Record<string, Ai>>({});
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch('/api/scoring/engaged');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load prospects');
      setData(json);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load prospects'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.prospects ?? [])
      .map((p) => ({ ...p, blended: Math.round((p.baseScore * (100 - engagementWeight) + p.engagementScore * engagementWeight) / 100) }))
      .filter((p) => (filter === 'all' || (filter === 'hot' ? p.temperature === 'hot' : filter === 'warm' ? p.temperature === 'warm' : filter === 'replied' ? p.replied : p.clicks > 0))
        && (!term || `${p.address} ${p.name ?? ''} ${p.place}`.toLowerCase().includes(term)))
      .sort((a, b) => b.blended - a.blended);
  }, [data, engagementWeight, filter, q]);

  const scoreWithAi = async (p: EngagedProspect) => {
    setAiBusy(p.leadId); setAiError(null);
    try {
      const state = p.place.split(',').pop()?.trim();
      const res = await authFetch('/api/ai/prospect-score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: p.leadId, propertyDetails: { address: p.address, state }, regulatoryContext: { state, regulationComplexity: p.regulation === 'Allowed' ? 'low' : p.regulation === 'Restricted' ? 'high' : 'unknown' },
          contactHistory: { emailClicks: p.clicks, smsReplies: p.replied ? 1 : 0 }, currentScore: p.baseScore, stage: p.stage ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Scoring failed');
      setAi((m) => ({ ...m, [p.leadId]: { score: json.aiScore, reasoning: json.reasoning, action: json.recommendedAction, flags: json.riskFlags, model: json.model } }));
    } catch (e) { setAiError(e instanceof Error ? e.message : 'Scoring failed'); } finally { setAiBusy(null); }
  };

  const t = data?.totals;
  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
  const tiles = t ? [
    { label: 'Texted', value: t.texted.toLocaleString(), sub: `${t.delivered.toLocaleString()} delivered`, icon: MessageSquare },
    { label: 'Clicked estimate link', value: t.clicked, sub: `${pct(t.clicked, t.delivered)} of delivered`, icon: MousePointerClick },
    { label: 'Replied', value: t.replied, sub: `${pct(t.replied, t.delivered)} of delivered`, icon: MessageSquare },
    { label: 'Hot', value: t.hot, sub: 'Ready for a call', icon: Flame },
    { label: 'Warm', value: t.warm, sub: 'Worth a follow-up', icon: Flame },
  ] : [];

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Prospect scoring</h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">Owners who have actually responded to a text, ranked by blending their fit score with how they engaged. Move the slider to decide how much engagement counts.</p>
          </div>
          <button onClick={load} disabled={loading} className="h-9 px-3 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-60"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</button>
        </header>

        {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm flex items-center gap-2 text-destructive"><AlertCircle size={16} />{error}</div>}

        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {loading && !data ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />) : tiles.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><s.icon size={12} />{s.label}</p>
              <p className="mt-1 text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </div>
          ))}
        </section>

        <section className="grid lg:grid-cols-3 gap-5">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><SlidersHorizontal size={14} className="text-primary" />Blend</h2>
            <p className="mt-1 text-xs text-muted-foreground">Blended score = fit score × {100 - engagementWeight}% + engagement score × {engagementWeight}%.</p>
            <input type="range" min={0} max={100} step={5} value={engagementWeight} onChange={(e) => setEngagementWeight(Number(e.target.value))} aria-label="Engagement weight" className="mt-4 w-full accent-primary" />
            <div className="flex justify-between text-[11px] text-muted-foreground"><span>Fit only</span><span>Engagement only</span></div>
            <p className="mt-4 text-xs text-muted-foreground">Engagement score comes from what the owner did: opening the link, time on the estimate, chat questions, replying, and asking to be contacted.</p>
          </div>
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Fit vs. engagement</h2>
            <div className="h-48 mt-2">
              {rows.length === 0 ? <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Nothing to plot yet.</div> : (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" dataKey="baseScore" name="Fit score" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <YAxis type="number" dataKey="engagementScore" name="Engagement" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => { const p = payload?.[0]?.payload as EngagedProspect | undefined; return p ? <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow"><p className="font-semibold text-foreground">{p.address}</p><p className="text-muted-foreground">Fit {p.baseScore} · Engagement {p.engagementScore}</p></div> : null; }} />
                    <Scatter data={rows}>{rows.map((p) => <Cell key={p.leadId} fill={TEMP_FILL[p.temperature]} />)}</Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
            {(['all', 'hot', 'warm', 'replied', 'clicked'] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-xl text-sm font-medium capitalize ${filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{f}</button>
            ))}
            <div className="relative ml-auto w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address or name" className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          {aiError && <p className="px-4 pt-3 text-sm text-destructive">{aiError}</p>}
          {loading && !data ? <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}</div>
            : rows.length === 0 ? <div className="py-14 text-center text-sm text-muted-foreground">No prospects match this view.</div>
            : (
              <ul className="divide-y divide-border">
                {rows.map((p) => {
                  const a = ai[p.leadId];
                  return (
                    <li key={p.leadId} className="px-4 py-3">
                      <button onClick={() => setOpen(open === p.leadId ? null : p.leadId)} className="w-full flex items-center gap-3 text-left">
                        <span className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 text-primary font-bold inline-flex items-center justify-center">{p.blended}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground truncate">{p.address}</span>
                          <span className="block text-xs text-muted-foreground truncate">{[p.place, p.name].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {p.replied && <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600">Replied</span>}
                          {p.clicks > 0 && <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600">Clicked</span>}
                        </span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase ${TEMP_STYLE[p.temperature]}`}>{p.temperature}</span>
                      </button>
                      {open === p.leadId && (
                        <div className="mt-3 ml-14 grid md:grid-cols-2 gap-4 text-sm">
                          <div className="space-y-1.5">
                            <Line k="Fit score" v={String(p.baseScore)} /><Line k="Engagement score" v={String(p.engagementScore)} />
                            <Line k="Link clicks" v={String(p.clicks)} /><Line k="Viewed estimate" v={p.viewed ? `Yes${p.timeOnPage ? ` · ${Math.round(p.timeOnPage)}s` : ''}` : 'No'} />
                            <Line k="Chat questions" v={String(p.chatQuestions)} /><Line k="Asked for contact" v={p.contactRequested ? 'Yes' : 'No'} />
                            <Line k="Regulation" v={p.regulation ?? '—'} />
                            {p.replyText && <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-foreground">“{p.replyText}”{p.replyIntent ? <span className="text-xs text-muted-foreground"> · {p.replyIntent}</span> : null}</p>}
                          </div>
                          <div className="space-y-3">
                            {a ? (
                              <div className="rounded-xl border border-border p-3 space-y-1.5">
                                <p className="font-semibold text-foreground flex items-center gap-1.5"><Sparkles size={14} className="text-primary" />AI score {a.score}</p>
                                <p className="text-muted-foreground">{a.reasoning}</p>
                                {a.action && <p className="text-foreground"><span className="font-medium">Next step:</span> {a.action}</p>}
                                {a.flags && a.flags.length > 0 && <p className="text-xs text-destructive">{a.flags.join(' · ')}</p>}
                              </div>
                            ) : (
                              <button onClick={() => scoreWithAi(p)} disabled={aiBusy === p.leadId} className="h-9 px-3 rounded-xl border border-border inline-flex items-center gap-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60">
                                {aiBusy === p.leadId ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}{aiBusy === p.leadId ? 'Analyzing…' : 'Get AI read on this lead'}
                              </button>
                            )}
                            <div className="flex gap-2">
                              <Link href={`/lead-record?id=${p.leadId}`} className="h-9 px-3 rounded-xl bg-primary text-primary-foreground inline-flex items-center gap-1.5 text-sm font-medium">Open record<ArrowUpRight size={14} /></Link>
                              <Link href={`/lead-profile?id=${p.leadId}`} className="h-9 px-3 rounded-xl border border-border inline-flex items-center gap-1.5 text-sm font-medium hover:bg-muted">Profile</Link>
                            </div>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
        </section>
      </div>
    </AppLayout>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="text-foreground">{v}</span></div>;
}
