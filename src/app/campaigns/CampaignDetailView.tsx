'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Loader2, Megaphone, RefreshCw } from 'lucide-react';
import { BatchInfo, Card, Insights, Overview, fmtDate, post } from './shared';
import ResultsTab from './ResultsTab';

function decodeBatch(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw ?? '';
  try { return decodeURIComponent(value); } catch { return value; }
}

export default function CampaignDetailView() {
  const params = useParams<{ batch: string }>();
  const router = useRouter();
  const batch = decodeBatch(params?.batch);

  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [data, setData] = useState<Overview | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'refresh' | 'insights' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/overview?batch=${encodeURIComponent(batch)}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load this campaign');
      setBatches(j.batches ?? []); setData(j.overview?.empty ? null : j.overview); setInsights(j.insights ?? null); setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [batch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => load(true), 60_000); return () => clearInterval(t); }, [load]);

  async function refresh() {
    setBusy('refresh');
    try { await post('/api/campaigns/refresh', { batch }); await load(true); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function makeInsights() {
    setBusy('insights'); setError(null);
    try { const j = await post<{ insights: Insights }>('/api/campaigns/insights', { batch }); setInsights({ ...j.insights, _createdAt: new Date().toISOString() }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  const info = batches.find(b => b.batch === batch);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> All campaigns</Link>

      <Card className="p-5 sm:p-6 bg-gradient-to-br from-primary/10 via-card to-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5 break-words"><span className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0"><Megaphone size={18} /></span>{batch}</h1>
            {info && (
              <p className="text-sm text-muted-foreground mt-1.5">
                {info.audience ? `${info.audience} · ` : ''}{info.texts} texts · first send {fmtDate(info.firstSend)}{info.lastSend !== info.firstSend ? `, last send ${fmtDate(info.lastSend)}` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={refresh} disabled={busy !== null} className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-border bg-card text-sm hover:bg-muted disabled:opacity-60">
              {busy === 'refresh' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh data</button>
            <a href={`/api/campaigns/export?batch=${encodeURIComponent(batch)}`} className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-border bg-card text-sm hover:bg-muted"><Download size={14} /> Export CSV</a>
          </div>
        </div>
      </Card>

      <ResultsTab detail batches={info ? [info] : []} selected={batch} setSelected={() => undefined} data={data} insights={insights} loading={loading} error={error} busy={busy}
        onInsights={makeInsights} onReload={() => load(true)} onAskHelper={() => router.push('/campaigns')} onNew={() => router.push('/campaigns')} />
    </div>
  );
}
