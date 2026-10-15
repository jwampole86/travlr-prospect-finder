'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowUpRight, CalendarClock, RefreshCw } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';

interface Agreement {
  id: string; address: string; place: string; owner: string | null; agent: string | null; signedOn: string; renewalOn: Date; days: number; monthlyRevenue: number | null; terms: string | null; termAssumed: boolean;
}

const BUCKETS = [{ label: 'Next 30 days', max: 30 }, { label: '31–60 days', max: 60 }, { label: '61–90 days', max: 90 }];

/** Reads a term like "12-month agreement" or "2 years" from the contract notes; falls back to 12 months and says so. */
function termMonths(terms: string | null): { months: number; assumed: boolean } {
  const m = (terms ?? '').match(/(\d+)\s*-?\s*(month|mo\b|year|yr)/i);
  if (!m) return { months: 12, assumed: true };
  const n = Number(m[1]);
  return { months: /^(y)/i.test(m[2]) ? n * 12 : n, assumed: false };
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function RenewalAlertsPage() {
  const [rows, setRows] = useState<Agreement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [window_, setWindow] = useState<number | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: err } = await createClient().from('leads')
      .select('id,address,city,state,owner_name,contact_name,primary_agent_name,assigned_agent_name,contract_date,contract_signed_at,contract_terms,contract_monthly_revenue')
      .not('contract_signed_at', 'is', null).limit(1000);
    if (err) { setError('Could not load agreements. Try again in a moment.'); setLoading(false); return; }
    const today = Date.now();
    setRows((data ?? []).map((l: Record<string, any>) => {
      const start = new Date(l.contract_date || l.contract_signed_at);
      const { months, assumed } = termMonths(l.contract_terms);
      const renewal = new Date(start); renewal.setMonth(renewal.getMonth() + months);
      return {
        id: l.id, address: l.address ?? '', place: [l.city, l.state].filter(Boolean).join(', '), owner: l.owner_name || l.contact_name || null, agent: l.primary_agent_name || l.assigned_agent_name || null,
        signedOn: start.toISOString(), renewalOn: renewal, days: Math.ceil((renewal.getTime() - today) / 86400000), monthlyRevenue: l.contract_monthly_revenue ?? null, terms: l.contract_terms ?? null, termAssumed: assumed,
      };
    }).sort((a, b) => a.days - b.days));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => (rows ?? []).filter((r) => window_ === 'all' || r.days <= window_), [rows, window_]);
  const overdue = (rows ?? []).filter((r) => r.days < 0).length;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Renewal alerts</h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">Signed management agreements and when each one comes up for renewal. Agreements appear here when contract details are saved on a lead.</p>
          </div>
          <button onClick={load} disabled={loading} className="h-9 px-3 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-60"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</button>
        </header>

        {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm flex items-center gap-2 text-destructive"><AlertCircle size={16} />{error}</div>}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {BUCKETS.map((b, i) => {
            const n = (rows ?? []).filter((r) => r.days <= b.max && (i === 0 ? true : r.days > BUCKETS[i - 1].max)).length;
            return (
              <button key={b.label} onClick={() => setWindow(window_ === b.max ? 'all' : b.max)} className={`rounded-2xl border px-4 py-3 text-left transition-colors ${window_ === b.max ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'}`}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><CalendarClock size={12} />{b.label}</p>
                <p className="mt-1 text-xl font-bold text-foreground">{loading && !rows ? '—' : n}</p>
              </button>
            );
          })}
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Signed agreements</p>
            <p className="mt-1 text-xl font-bold text-foreground">{rows?.length ?? '—'}</p>
            {overdue > 0 && <p className="text-xs text-destructive">{overdue} past renewal date</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card">
          {loading && !rows ? <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}</div>
            : (rows?.length ?? 0) === 0 ? (
              <div className="py-14 px-6 text-center">
                <CalendarClock className="mx-auto text-muted-foreground" size={28} />
                <p className="mt-3 text-sm font-medium text-foreground">No signed agreements yet</p>
                <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">When an owner signs, open their lead and save the contract details. Renewal dates and the 30, 60 and 90 day windows fill in here automatically.</p>
              </div>
            ) : visible.length === 0 ? <div className="py-14 text-center text-sm text-muted-foreground">No agreements renew in this window.</div>
            : (
              <ul className="divide-y divide-border">
                {visible.map((r) => (
                  <li key={r.id} className="px-4 py-3 flex items-center gap-3">
                    <span className={`w-14 shrink-0 text-center rounded-xl py-1.5 ${r.days < 0 ? 'bg-destructive/10 text-destructive' : r.days <= 30 ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
                      <span className="block text-base font-bold leading-none">{Math.abs(r.days)}</span><span className="block text-[10px]">{r.days < 0 ? 'days over' : 'days'}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground truncate">{r.address}</span>
                      <span className="block text-xs text-muted-foreground truncate">{[r.place, r.owner, r.agent ? `Agent: ${r.agent}` : null].filter(Boolean).join(' · ')}</span>
                      <span className="block text-xs text-muted-foreground">Signed {fmtDate(new Date(r.signedOn))} · Renews {fmtDate(r.renewalOn)}{r.termAssumed ? ' (12 months assumed; no term in the notes)' : ''}</span>
                    </span>
                    {r.monthlyRevenue ? <span className="hidden sm:block text-sm font-medium text-foreground">${Math.round(r.monthlyRevenue).toLocaleString()}/mo</span> : null}
                    <Link href={`/lead-record?id=${r.id}`} className="h-9 px-3 rounded-xl border border-border inline-flex items-center gap-1.5 text-sm font-medium hover:bg-muted">Open<ArrowUpRight size={14} /></Link>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>
    </AppLayout>
  );
}
