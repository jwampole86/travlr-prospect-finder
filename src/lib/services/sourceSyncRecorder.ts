import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const PROVIDER_SOURCE_NAMES: Record<string, string> = {
  trulia: 'Trulia',
  'zillow-search': 'Zillow',
  'zillow-real-estate': 'Zillow',
  'zillow-detail': 'Zillow',
  'rent-com': 'Rent.com',
  'us-property-data': 'US Property Data',
  padmapper: 'PadMapper',
  hotpads: 'HotPads',
  craigslist: 'Craigslist',
};

const STATE_SUFFIX = /(?:^|[\s,-])([A-Za-z]{2})$/;

export function sourceNameForProvider(provider: string): string | null {
  return PROVIDER_SOURCE_NAMES[provider] ?? null;
}

/** Best-effort state code from the request shapes rapidapi-import accepts ("CO", "Austin, TX", "austin-tx", ...). */
export function stateCodeFromImportBody(body: Record<string, unknown>): string | null {
  const regions = Array.isArray(body.regions) ? body.regions : [];
  const candidates = [body.state, body.location, body.region, (regions[0] as { state?: string } | undefined)?.state];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const value = c.trim();
    if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
    const m = STATE_SUFFIX.exec(value);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

export interface SourcePullOutcome {
  source: string;
  stateCode: string | null;
  ok: boolean;
  fetched?: number;
  imported?: number;
  newLeads?: number;
  error?: string | null;
}

/**
 * Persist the real outcome of a source pull so the Data Freshness Monitor, the sync
 * ticker and the zone-coverage table reflect what actually happened. Never throws.
 */
export async function recordSourcePull(outcome: SourcePullOutcome): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const status = outcome.ok ? 'success' : 'failed';

    await supabase.from('sync_events').insert({
      operation_type: 'source_sync',
      operation_id: [outcome.source, outcome.stateCode].filter(Boolean).join(' '),
      status,
      attempt_count: 1,
      max_attempts: 1,
      last_error: outcome.ok ? null : (outcome.error || 'Unknown error').slice(0, 1000),
      payload: {
        source: outcome.source,
        state_code: outcome.stateCode,
        fetched: outcome.fetched ?? 0,
        imported: outcome.imported ?? 0,
        new_leads: outcome.newLeads ?? 0,
        sync_mode: 'rapidapi_import',
      },
    });

    if (!outcome.stateCode) return;
    const { data: registry } = await supabase
      .from('portfolio_registry')
      .select('state_name')
      .eq('state_code', outcome.stateCode)
      .maybeSingle();
    if (!registry?.state_name) return;

    const { data: rows } = await supabase
      .from('sync_source_coverage')
      .select('id, leads_imported')
      .eq('source_name', outcome.source)
      .eq('portfolio', registry.state_name);

    for (const row of rows || []) {
      await supabase
        .from('sync_source_coverage')
        .update({
          last_synced_at: now,
          last_sync_status: status,
          last_sync_error: outcome.ok ? null : (outcome.error || 'Unknown error').slice(0, 1000),
          leads_imported: (row.leads_imported || 0) + (outcome.newLeads ?? 0),
          updated_at: now,
        })
        .eq('id', row.id);
    }
  } catch (err) {
    console.warn('[sourceSyncRecorder] failed to record source pull:', err instanceof Error ? err.message : err);
  }
}
