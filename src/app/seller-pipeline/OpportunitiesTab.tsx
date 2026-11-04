'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { Card, cx } from '@/app/campaigns/shared';
import { STAGES, STAGE_LABEL } from '@/lib/seller/types';
import OpportunityPanel from './OpportunityPanel';
import { AuthBadge, Bar, api, btnCls, inputCls, primaryBtnCls } from './ui';

type Item = {
  id: string; lead_id: string; stage: string; status: string; intent_score: number; service_fit_score: number; authorization_status: string;
  next_action: string | null; next_action_at: string | null; signal_text: string | null;
  lead: { contact_name: string | null; address: string | null; city: string | null; state: string | null } | null;
};

export default function OpportunitiesTab({ openId, onOpenChange }: { openId: string | null; onOpenChange: (id: string | null) => void }) {
  const [status, setStatus] = useState('open');
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flagId, setFlagId] = useState('');
  const [flagNote, setFlagNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await api<{ items: Item[] }>(`/api/seller/opportunities?status=${status}`)).items); setError(null); } catch (e) { setError((e as Error).message); }
  }, [status]);
  useEffect(() => { setItems(null); load(); }, [load]);

  async function flag() {
    setBusy(true); setError(null);
    try {
      const leadId = flagId.trim().replace(/^.*[?&]id=/, '');
      const r = await api<{ item: { id: string } }>('/api/seller/opportunities', { method: 'POST', body: { leadId, text: flagNote } });
      setFlagId(''); setFlagNote(''); await load(); onOpenChange(r.item.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Flag a lead as a seller (paste the lead ID or its profile link)</label>
            <input className={inputCls} value={flagId} onChange={(e) => setFlagId(e.target.value)} placeholder="lead-import-… or /lead-profile?id=…" />
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">What the owner said</label>
            <input className={inputCls} value={flagNote} onChange={(e) => setFlagNote(e.target.value)} placeholder="Said on the phone they may sell this summer" />
          </div>
          <button disabled={busy || !flagId.trim()} onClick={flag} className={primaryBtnCls}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />} Flag as seller</button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </Card>

      <div className="flex flex-wrap gap-2">
        {['open', 'paused', 'won', 'lost', 'all'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cx(btnCls, status === s && '!bg-primary !text-primary-foreground !border-primary')}>{s[0].toUpperCase() + s.slice(1)}</button>
        ))}
      </div>

      <div className={cx('grid gap-4', openId ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]' : '')}>
        <Card className="overflow-hidden">
          {!items ? <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div> : items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No opportunities here yet. A text reply that sounds like a sale is added automatically. You can also flag a lead above.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((o) => (
                <li key={o.id}>
                  <button onClick={() => onOpenChange(o.id)} className={cx('w-full p-4 text-left hover:bg-muted/50', openId === o.id && 'bg-primary/5')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{o.lead?.contact_name || 'Unnamed owner'}</p>
                        <p className="text-xs text-muted-foreground truncate">{[o.lead?.address, o.lead?.city, o.lead?.state].filter(Boolean).join(', ') || o.lead_id}</p>
                      </div>
                      <AuthBadge status={o.authorization_status} />
                    </div>
                    {o.signal_text && <p className="mt-1.5 text-xs italic text-muted-foreground line-clamp-2">&ldquo;{o.signal_text}&rdquo;</p>}
                    <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-center gap-3 text-[11px] text-muted-foreground">
                      <div>Intent {o.intent_score}<Bar value={o.intent_score} /></div>
                      <div>Fit {o.service_fit_score}<Bar value={o.service_fit_score} tone="green" /></div>
                      <span className="font-medium text-foreground">{STAGE_LABEL[o.stage as (typeof STAGES)[number]] ?? o.stage}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {openId && <OpportunityPanel id={openId} onClose={() => onOpenChange(null)} onChanged={load} />}
      </div>
    </div>
  );
}
