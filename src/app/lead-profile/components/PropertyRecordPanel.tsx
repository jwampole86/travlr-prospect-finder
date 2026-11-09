'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';

type Review = { id: string; reason: string; score: number; detail: string | null; records: Array<{ id: string; name: string }> };
type Data = {
  linked: boolean; unit?: boolean;
  property?: { street_number: string; street_name: string; city: string | null; state: string | null; zip5: string } | null;
  otherRecords?: Array<{ system: string; id: string; name: string | null }>;
  reviews?: Review[];
};

const REASON: Record<string, string> = { similar_address: 'Similar address', unit_ambiguity: 'Could be a unit in this building', nearby_coordinates: 'Very close on the map', conflicting_details: 'Details disagree' };
const SYSTEM: Record<string, string> = { avyro: 'AVYRO lead', homes: 'NAVEO Homes', stays: 'NAVEO Stays', live: 'NAVEO Live' };

async function call<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, { method: init?.method ?? 'GET', cache: 'no-store', ...(init?.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j as T;
}

/**
 * Admin-only. The property registry gives every address one identity across AVYRO and NAVEO. This shows the other records at this property, and
 * any possible duplicates a person should decide: it never changes a lead, only how registry records are grouped.
 */
export default function PropertyRecordPanel({ leadId }: { leadId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await call<Data>(`/api/registry/leads/${encodeURIComponent(leadId)}`)); setError(null); }
    catch (e) { setError((e as Error).message); setData({ linked: false }); }
  }, [leadId]);
  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, decision: 'merge' | 'keep_separate') {
    setBusy(id); setError(null);
    try { await call(`/api/registry/review/${id}`, { method: 'POST', body: { decision } }); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  if (data === null) return <div className="bg-card border border-border rounded-xl p-5"><Loader2 className="animate-spin" size={16} /></div>;
  const others = data.otherRecords ?? [];
  const reviews = data.reviews ?? [];
  if (!data.linked || (others.length === 0 && reviews.length === 0 && !error)) return null; // nothing to say yet

  return (
    <div className="bg-card border border-border rounded-xl p-5" data-testid="property-record">
      <div className="flex items-center gap-2 mb-1">
        <Building2 size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Property record</h3>
        {reviews.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{reviews.length} to review</span>}
      </div>
      {data.property && <p className="text-xs text-muted-foreground mb-3">{data.property.street_number} {data.property.street_name}, {data.property.zip5}{data.unit ? ' (this lead is one unit in the building)' : ''}</p>}
      {error && <p role="alert" className="mb-2 text-xs text-red-700">{error}</p>}

      {others.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-foreground mb-1">Other records at this property</p>
          <ul className="space-y-1 text-xs">
            {others.map((o) => (
              <li key={`${o.system}:${o.id}`} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate"><span className="text-muted-foreground">{SYSTEM[o.system] ?? o.system}: </span>{o.name ?? o.id}</span>
                {o.system === 'avyro' && <a className="text-primary hover:underline shrink-0" href={`/lead-profile?id=${encodeURIComponent(o.id)}`}>Open</a>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reviews.length > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground mb-1">Possible duplicates</p>
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-2.5 text-xs">
                <p className="font-medium">{REASON[r.reason] ?? r.reason}{r.detail ? <span className="font-normal text-muted-foreground">: {r.detail}</span> : null}</p>
                {r.records.map((x) => <p key={x.id} className="text-muted-foreground">{x.name} · <a className="text-primary hover:underline" href={`/lead-profile?id=${encodeURIComponent(x.id)}`}>Open</a></p>)}
                <div className="mt-2 flex gap-1.5">
                  <button disabled={busy === r.id} onClick={() => decide(r.id, 'merge')} className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground disabled:opacity-50">Same property</button>
                  <button disabled={busy === r.id} onClick={() => decide(r.id, 'keep_separate')} className="rounded-md border border-border px-2.5 py-1 hover:bg-muted disabled:opacity-50">Keep separate</button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">Deciding only groups the property records. No lead is changed, merged or deleted.</p>
        </div>
      )}
    </div>
  );
}
