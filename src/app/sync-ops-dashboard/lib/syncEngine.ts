export type SourceKey = 'trulia' | 'padmapper' | 'hotpads' | 'zillow';

export interface SourceDef {
  key: SourceKey;
  name: string;
  /** Lead `source` value stored on leads / sync_events. */
  leadSource: string;
  accent: string;
  body: (stateCode: string) => Record<string, unknown>;
}

// Same provider mix and depth the automatic cron uses (Craigslist is excluded: ~124 requests/month).
export const SOURCES: SourceDef[] = [
  { key: 'trulia', name: 'Trulia', leadSource: 'Trulia', accent: 'bg-sky-500', body: (st) => ({ provider: 'trulia', location: st, maxPages: 3 }) },
  { key: 'padmapper', name: 'PadMapper', leadSource: 'PadMapper', accent: 'bg-violet-500', body: (st) => ({ provider: 'padmapper', state: st }) },
  { key: 'hotpads', name: 'HotPads', leadSource: 'HotPads', accent: 'bg-orange-500', body: (st) => ({ provider: 'hotpads', state: st }) },
  { key: 'zillow', name: 'Zillow', leadSource: 'Zillow', accent: 'bg-emerald-500', body: (st) => ({ provider: 'zillow-search', region: st.toLowerCase(), maxPages: 1 }) },
];

export type SourceRunStatus = 'success' | 'empty' | 'skipped' | 'failed';

export interface SourceRunResult {
  source: SourceKey;
  status: SourceRunStatus;
  fetched: number;
  newLeads: number;
  updated: number;
  duplicates: number;
  rowErrors: number;
  error: string | null;
  durationMs: number;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Pull one source for one state through the same import pipeline the cron and dashboard use. */
export async function pullSource(def: SourceDef, stateCode: string): Promise<SourceRunResult> {
  const t0 = Date.now();
  const base = { source: def.key, fetched: 0, newLeads: 0, updated: 0, duplicates: 0, rowErrors: 0 };
  try {
    const res = await fetch('/api/leads/rapidapi-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(def.body(stateCode)),
    });
    const data = await res.json().catch(() => ({}));
    const durationMs = Date.now() - t0;

    // 400/404 = no cities configured for this source in this state; nothing to pull.
    if (res.status === 400 || res.status === 404) {
      return { ...base, status: 'skipped', error: data?.error ?? null, durationMs };
    }
    // 422 = the provider answered but nothing was importable.
    if (res.status === 422) {
      return { ...base, status: 'empty', error: null, durationMs };
    }
    if (!res.ok || data?.error) {
      return { ...base, status: 'failed', error: String(data?.error || `HTTP ${res.status}`), durationMs };
    }

    const t = data?.totals || {};
    const fetched = num(data?.fetched);
    const rowErrors = num(t.rowsError);
    return {
      ...base,
      status: fetched === 0 ? 'empty' : 'success',
      fetched,
      newLeads: num(t.rowsNew),
      updated: num(t.rowsUpdatedExisting) + num(t.rowsUnchangedExisting),
      duplicates: num(t.rowsDuplicateInFile),
      rowErrors,
      error: rowErrors > 0 ? `${rowErrors} row(s) failed to import` : null,
      durationMs,
    };
  } catch (err) {
    return { ...base, status: 'failed', error: err instanceof Error ? err.message : 'Network error', durationMs: Date.now() - t0 };
  }
}

export type PortfolioHealth = 'never' | 'ok' | 'partial' | 'failed' | 'empty';

/** Roll per-source results up into one portfolio verdict. */
export function summarize(results: SourceRunResult[]): PortfolioHealth {
  const attempted = results.filter((r) => r.status !== 'skipped');
  if (attempted.length === 0) return 'empty';
  const failed = attempted.filter((r) => r.status === 'failed').length;
  const delivered = attempted.filter((r) => r.status === 'success').length;
  if (failed === attempted.length) return 'failed';
  if (failed > 0 || attempted.some((r) => r.rowErrors > 0)) return 'partial';
  return delivered > 0 ? 'ok' : 'empty';
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
