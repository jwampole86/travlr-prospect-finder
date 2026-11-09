'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { RIGHTS_BASES, type RightsBasis, type RightsStatus } from '@/lib/media/rights';

type Photo = {
  id: string; previewUrl: string; rights_status: RightsStatus; rights_basis: RightsBasis | null; rights_note: string | null;
  hidden: boolean | null; is_hero: boolean | null; storage_path: string | null; source?: string | null;
};

const BASIS_LABEL: Record<RightsBasis, string> = {
  seller_provided: 'The seller provided it', owner_authorized: 'The owner authorized it', licensed_feed: 'It comes from a licensed feed',
  source_terms_allow: 'The source\'s terms allow it (write which)', own_photography: 'Our own photography',
};
const STATUS_STYLE: Record<RightsStatus, string> = {
  unreviewed: 'bg-amber-100 text-amber-800', cleared: 'bg-emerald-100 text-emerald-800', restricted: 'bg-slate-200 text-slate-700', rejected: 'bg-red-100 text-red-800',
};
const STATUS_LABEL: Record<RightsStatus, string> = { unreviewed: 'Not reviewed', cleared: 'Cleared to publish', restricted: 'Restricted', rejected: 'Rejected' };

async function call<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, { method: init?.method ?? 'GET', cache: 'no-store', ...(init?.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j as T;
}

/**
 * Admin-only. Photos captured from listing sites belong to someone else, so none is shown in a NAVEO gallery until a person records why it may be
 * published. This is where that decision is made, one photo at a time.
 */
export default function PhotoRightsPanel({ leadId }: { leadId: string }) {
  const [items, setItems] = useState<Photo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { basis: RightsBasis | ''; note: string }>>({});

  const load = useCallback(async () => {
    try { setItems((await call<{ items: Photo[] }>(`/api/media/leads/${encodeURIComponent(leadId)}`)).items); setError(null); }
    catch (e) { setError((e as Error).message); setItems([]); }
  }, [leadId]);
  useEffect(() => { void load(); }, [load]);

  async function patch(p: Photo, body: Record<string, unknown>) {
    setBusy(p.id); setError(null);
    try { await call(`/api/media/${p.id}`, { method: 'PATCH', body }); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  if (items === null) return <div className="bg-card border border-border rounded-xl p-5"><Loader2 className="animate-spin" size={16} /></div>;
  if (items.length === 0 && !error) return null; // nothing was captured for this property

  const waiting = items.filter((p) => p.rights_status === 'unreviewed').length;
  return (
    <div className="bg-card border border-border rounded-xl p-5" data-testid="photo-rights">
      <div className="flex items-center gap-2 mb-1">
        <ImageIcon size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Property photos &amp; publishing rights</h3>
        {waiting > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{waiting} to review</span>}
      </div>
      <p className="text-xs text-muted-foreground mb-3">These photos came from listing sites and belong to the photographer, listing agent or brokerage. A photo is only used in a gallery after you record why it may be published.</p>
      {error && <p role="alert" className="mb-2 text-xs text-red-700">{error}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => {
          const d = draft[p.id] ?? { basis: '', note: '' };
          const set = (v: Partial<typeof d>) => setDraft({ ...draft, [p.id]: { ...d, ...v } });
          const disabled = busy === p.id;
          return (
            <li key={p.id} className="rounded-lg border border-border p-2.5 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt="Property photo to review" referrerPolicy="no-referrer" loading="lazy" className="h-32 w-full rounded-md object-cover bg-muted" />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[p.rights_status]}`}>{STATUS_LABEL[p.rights_status]}</span>
                {p.is_hero && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Main photo</span>}
                {p.hidden && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">Hidden</span>}
              </div>
              {p.rights_status === 'cleared' && p.rights_basis && <p className="mt-1 text-muted-foreground">{BASIS_LABEL[p.rights_basis]}{p.rights_note ? `: ${p.rights_note}` : ''}</p>}
              {p.rights_status !== 'cleared' && (
                <div className="mt-2 space-y-1.5">
                  <select aria-label="Why may this photo be published?" value={d.basis} onChange={(e) => set({ basis: e.target.value as RightsBasis | '' })} className="h-8 w-full rounded-md border border-border bg-background px-2">
                    <option value="">Why may it be published?</option>
                    {RIGHTS_BASES.map((b) => <option key={b} value={b}>{BASIS_LABEL[b]}</option>)}
                  </select>
                  {d.basis === 'source_terms_allow' && <input aria-label="Which term or licence allows it" value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="Which term or licence allows it?" className="h-8 w-full rounded-md border border-border bg-background px-2" />}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.rights_status !== 'cleared' && (
                  <button disabled={disabled || !d.basis} onClick={() => patch(p, { rights_status: 'cleared', rights_basis: d.basis, rights_note: d.note || null })} className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground disabled:opacity-50">Clear to publish</button>
                )}
                {p.rights_status !== 'restricted' && <button disabled={disabled} onClick={() => patch(p, { rights_status: 'restricted' })} className="rounded-md border border-border px-2.5 py-1 hover:bg-muted disabled:opacity-50">Restrict</button>}
                {p.rights_status !== 'rejected' && <button disabled={disabled} onClick={() => patch(p, { rights_status: 'rejected' })} className="rounded-md border border-border px-2.5 py-1 hover:bg-muted disabled:opacity-50">Reject</button>}
                {p.rights_status === 'cleared' && !p.is_hero && <button disabled={disabled} onClick={() => patch(p, { is_hero: true })} className="rounded-md border border-border px-2.5 py-1 hover:bg-muted disabled:opacity-50">Make main photo</button>}
                {p.rights_status === 'cleared' && <button disabled={disabled} onClick={() => patch(p, { rights_status: 'unreviewed' })} className="rounded-md border border-border px-2.5 py-1 hover:bg-muted disabled:opacity-50">Withdraw</button>}
                <button disabled={disabled} onClick={() => patch(p, { hidden: !p.hidden })} className="rounded-md border border-border px-2.5 py-1 hover:bg-muted disabled:opacity-50">{p.hidden ? 'Show' : 'Hide'}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
