'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, Loader2, Megaphone, RefreshCw, Rocket, Sparkles } from 'lucide-react';
import { AssistantResult, BatchInfo, BuilderForm, CampaignOption, Card, Insights, Overview, cx, fmtDate, post } from './shared';
import ResultsTab from './ResultsTab';
import HelperTab from './HelperTab';
import BuilderTab, { defaultForm } from './BuilderTab';

type TabId = 'results' | 'helper' | 'new';
const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'results', label: 'Results', icon: <BarChart3 size={15} /> },
  { id: 'helper', label: 'AI Campaign Helper', icon: <Sparkles size={15} /> },
  { id: 'new', label: 'New campaign', icon: <Rocket size={15} /> },
];

export default function CampaignsView() {
  const [tab, setTab] = useState<TabId>('results');
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [selected, setSelected] = useState('all');
  const [data, setData] = useState<Overview | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'refresh' | 'insights' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);

  // Kept here so switching tabs does not lose the helper's answer or a half-filled campaign.
  const [goal, setGoal] = useState('');
  const [assistant, setAssistant] = useState<AssistantResult | null>(null);
  const [form, setForm] = useState<BuilderForm>(defaultForm);
  const [banner, setBanner] = useState<string | null>(null);
  const [builderOpened, setBuilderOpened] = useState(false);
  useEffect(() => { if (tab === 'new') setBuilderOpened(true); }, [tab]);
  const load = useCallback(async (key: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/overview?batch=${encodeURIComponent(key)}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load campaigns');
      setBatches(j.batches ?? []); setData(j.overview?.empty ? null : j.overview); setInsights(j.insights ?? null); setError(null); setLastLoaded(Date.now());
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(selected); }, [selected, load]);
  useEffect(() => { const t = setInterval(() => load(selected, true), 60_000); return () => clearInterval(t); }, [selected, load]);

  async function refresh() {
    setBusy('refresh');
    try { await post('/api/campaigns/refresh', { batch: selected }); await load(selected, true); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function makeInsights() {
    setBusy('insights'); setError(null);
    try { const j = await post<{ insights: Insights }>('/api/campaigns/insights', { batch: selected }); setInsights({ ...j.insights, _createdAt: new Date().toISOString() }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  function applyOption(o: CampaignOption) {
    setForm({ name: o.suggestedName, audience: o.audience.id, states: o.audience.states, minScore: o.audience.minScore, maxTexts: o.suggestedMaxTexts, tone: o.tone, startAt: o.startAt, spreadHours: o.spreadHours });
    setBanner(o.title); setTab('new');
  }
  function askHelper(g: string) { setGoal(g); setAssistant(null); setTab('helper'); }
  function viewResults(batch: string) { setSelected(batch); load(batch, true); setTab('results'); }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-primary/10 via-card to-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5"><span className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center"><Megaphone size={18} /></span>Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">Plan with AI, launch text campaigns to homeowners we want to convert to short-term rentals, and see what is working.</p>
            <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
              Live{data?.updatedAt ? `, data updated ${fmtDate(data.updatedAt)}` : lastLoaded ? `, loaded ${fmtDate(new Date(lastLoaded).toISOString())}` : ''}
            </p>
          </div>
          {tab === 'results' && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={refresh} disabled={busy !== null} className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-border bg-card text-sm hover:bg-muted disabled:opacity-60">
                {busy === 'refresh' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh data</button>
              <a href={`/api/campaigns/export?batch=${encodeURIComponent(selected)}`} className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-border bg-card text-sm hover:bg-muted"><Download size={14} /> Export CSV</a>
            </div>
          )}
        </div>
      </Card>

      <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-2xl border border-border bg-card p-1 shadow-sm">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cx('inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all', tab === t.id ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'results' && <ResultsTab batches={batches} selected={selected} setSelected={setSelected} data={data} insights={insights} loading={loading} error={error} busy={busy}
        onInsights={makeInsights} onReload={() => load(selected, true)} onAskHelper={askHelper} onNew={() => setTab('new')} />}
      {tab === 'helper' && <HelperTab goal={goal} setGoal={setGoal} result={assistant} setResult={setAssistant} onUse={applyOption} />}
      {/* Stays mounted once opened so a campaign that is being scheduled keeps running if you switch tabs. */}
      {builderOpened && <div className={tab === 'new' ? '' : 'hidden'}><BuilderTab form={form} setForm={setForm} banner={banner} onClearBanner={() => setBanner(null)} onViewResults={viewResults} /></div>}
    </div>
  );
}
