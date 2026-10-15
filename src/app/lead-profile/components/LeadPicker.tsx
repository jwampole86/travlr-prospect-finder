'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ChevronRight, Loader2, MapPin, Search, UserCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface LeadRow { id: string; address: string | null; city: string | null; state: string | null; contact_name: string | null; owner_name: string | null; stage: string | null; prospect_score: number | null }

/** Strips characters that would change a PostgREST filter, so a search never breaks the query. */
const safe = (q: string) => q.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();

/** Shown when no lead is chosen (or the chosen one does not exist): search by address or name, or jump back into a recent lead. */
export default function LeadPicker({ missingId, basePath = '/lead-profile' }: { missingId: string | null; basePath?: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const term = safe(q);
    const t = setTimeout(async () => {
      setLoading(true);
      let query = createClient().from('leads').select('id,address,city,state,contact_name,owner_name,stage,prospect_score').eq('is_synthetic', false).order('updated_at', { ascending: false }).limit(12);
      if (term.length >= 2) query = query.or(`address.ilike.%${term}%,contact_name.ilike.%${term}%,owner_name.ilike.%${term}%,city.ilike.%${term}%`);
      const { data, error: err } = await query;
      if (cancelled) return;
      if (err) { setError('Could not load leads. Try again in a moment.'); setRows([]); } else { setError(null); setRows((data ?? []) as LeadRow[]); }
      setLoading(false);
    }, q ? 250 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center">
        <span className="w-12 h-12 rounded-2xl bg-primary/10 text-primary inline-flex items-center justify-center">{missingId ? <AlertCircle size={22} /> : <UserCircle size={22} />}</span>
        <h1 className="mt-3 text-xl font-bold text-foreground">{missingId ? 'Lead not found' : 'Open a lead profile'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {missingId ? <>No lead matches <code className="bg-muted px-1 rounded text-xs">{missingId}</code>. Search for the right one below.</> : 'Search by address, owner or city, or pick one you worked on recently.'}
        </p>
      </div>

      <div className="relative mt-6">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search leads" aria-label="Search leads"
          className="w-full h-12 pl-10 pr-4 rounded-2xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
      </div>

      <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{safe(q).length >= 2 ? 'Matches' : 'Recently updated'}</p>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading && <div className="py-10 flex items-center justify-center text-muted-foreground"><Loader2 size={18} className="animate-spin" /></div>}
        {!loading && error && <p className="py-8 text-center text-sm text-red-600">{error}</p>}
        {!loading && !error && rows.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No leads match that search.</p>}
        {!loading && !error && rows.length > 0 && (
          <ul className="divide-y divide-border">
            {rows.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => router.push(`${basePath}?id=${encodeURIComponent(r.id)}`)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/60 transition-colors">
                  <span className="w-9 h-9 rounded-xl bg-muted inline-flex items-center justify-center text-muted-foreground shrink-0"><MapPin size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground truncate">{r.address || 'No address'}</span>
                    <span className="block text-xs text-muted-foreground truncate">{[r.city, r.state].filter(Boolean).join(', ')}{r.contact_name || r.owner_name ? ` · ${r.contact_name || r.owner_name}` : ''}</span>
                  </span>
                  {r.stage && <span className="hidden sm:inline text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{r.stage.replace(/_/g, ' ')}</span>}
                  {r.prospect_score !== null && <span className="text-xs font-semibold text-foreground tabular-nums w-8 text-right">{r.prospect_score}</span>}
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" onClick={() => router.push('/lead-management')} className="mt-4 mx-auto block text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Go to Lead Management</button>
    </div>
  );
}
