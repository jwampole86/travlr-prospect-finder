'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ScanSearch } from 'lucide-react';
import { Card, cx } from '@/app/campaigns/shared';
import { STAGES, STAGE_LABEL } from '@/lib/seller/types';
import { AuthBadge, api, btnCls, money } from './ui';

type Dash = {
  identified: number; contacted: number; qualified: number; inService: number; collected: number; cost: number; invoiced: number;
  byStage: Record<string, number>;
  followUps: Array<{ id: string; lead_id: string; stage: string; next_action: string | null; next_action_at: string | null; intent_score: number; authorization_status: string }>;
};

export default function DashboardTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setD(await api<Dash>('/api/seller/dashboard')); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  async function scanReplies() {
    setBusy(true); setScan(null);
    try {
      const dry = await api<{ scanned: number; flagged: number }>('/api/seller/backfill', { method: 'POST', body: { dryRun: true } });
      if (!dry.flagged) { setScan(`Checked ${dry.scanned} past replies. None sound like a seller.`); return; }
      if (!window.confirm(`Checked ${dry.scanned} past replies. ${dry.flagged} sound like a seller. Add them to the pipeline? Nothing is sent to them.`)) return;
      const live = await api<{ created: number }>('/api/seller/backfill', { method: 'POST', body: { dryRun: false } });
      setScan(`Added ${live.created} new seller ${live.created === 1 ? 'opportunity' : 'opportunities'}.`);
      await load();
    } catch (e) { setScan((e as Error).message); } finally { setBusy(false); }
  }

  if (error) return <Card className="p-5 text-sm text-red-700">{error}</Card>;
  if (!d) return <Card className="p-8 flex justify-center"><Loader2 className="animate-spin" /></Card>;

  const margin = d.collected - d.cost;
  const questions = [
    { q: 'Seller leads identified', a: d.identified.toLocaleString(), sub: 'Owners whose reply sounded like a sale' },
    { q: 'Contacted and qualified', a: `${d.contacted.toLocaleString()} / ${d.qualified.toLocaleString()}`, sub: 'Past the first signal / fully qualified' },
    { q: 'In a service or partner workflow', a: d.inService.toLocaleString(), sub: 'Routed to a service or beyond' },
    { q: 'Collected, after cost', a: money(d.collected), sub: `${money(d.cost)} cost, ${money(margin)} margin` },
    { q: 'Need follow-up today', a: d.followUps.length.toLocaleString(), sub: 'Due within a day or overdue' },
  ];
  const max = Math.max(1, ...STAGES.map((s) => d.byStage[s] ?? 0));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {questions.map((x) => (
          <Card key={x.q} className="p-4">
            <p className="text-xs font-medium text-muted-foreground">{x.q}</p>
            <p className="mt-1 text-2xl font-bold">{x.a}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{x.sub}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Open opportunities by step</h2>
          <div className="mt-3 space-y-2.5">
            {STAGES.map((s) => (
              <div key={s} className="grid grid-cols-[170px_1fr_32px] items-center gap-3 text-sm">
                <span className="text-muted-foreground">{STAGE_LABEL[s]}</span>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${((d.byStage[s] ?? 0) / max) * 100}%` }} /></div>
                <span className="text-right font-medium">{d.byStage[s] ?? 0}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={scanReplies} disabled={busy} className={btnCls}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />} Scan past replies for sellers</button>
            {scan && <span className="text-xs text-muted-foreground">{scan}</span>}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Follow up today</h2>
          {d.followUps.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nothing is due. New seller replies show up here and as a task on the lead.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {d.followUps.map((f) => (
                <li key={f.id}>
                  <button onClick={() => onOpen(f.id)} className="w-full py-2.5 text-left hover:bg-muted/50 rounded-lg px-2 -mx-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{f.next_action || STAGE_LABEL[f.stage as keyof typeof STAGE_LABEL]}</span>
                      <AuthBadge status={f.authorization_status} />
                    </div>
                    <p className={cx('text-[11px] mt-0.5', f.next_action_at && new Date(f.next_action_at) < new Date() ? 'text-red-600' : 'text-muted-foreground')}>
                      {f.next_action_at ? `Due ${new Date(f.next_action_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'No date'} · intent {f.intent_score}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
