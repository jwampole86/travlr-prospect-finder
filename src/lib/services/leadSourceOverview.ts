import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { ConfigItem, CoverageItem, Health, IngestionMethod, LeadSourceOverview, ScheduleInfo, SourceItem, SourceStats } from '@/lib/leadSourceTypes';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

const WEEK_MS = 7 * 86_400_000;
const CACHE_MS = 60_000;
const PAGE = 1000;
const LEAD_COLUMNS = 'source,state,is_synthetic,fully_verified,phone_available,verified_owner,verified_number,verified_address,luxury,prospect_score,possible_duplicate,created_at,source_config_id';

/** "Rent.com" and "rent com" are the same source. */
export const sourceKey = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

let cache: { at: number; value: Omit<LeadSourceOverview, 'canManage'> } | null = null;
export const invalidateLeadSourceOverview = () => { cache = null; };

async function fetchAll(db: Db, table: string, columns: string, order: string): Promise<Row[]> {
  const { count, error: ce } = await db.from(table).select('id', { count: 'exact', head: true });
  if (ce) throw ce;
  const pages = Math.ceil((count ?? 0) / PAGE);
  const rows: Row[] = [];
  const queue = Array.from({ length: pages }, (_, i) => i);
  await Promise.all(Array.from({ length: Math.min(5, pages) }, async () => {
    while (queue.length) {
      const p = queue.shift()!;
      const { data, error } = await db.from(table).select(columns).order(order).range(p * PAGE, p * PAGE + PAGE - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as unknown as Row[]));
    }
  }));
  return rows;
}

const maxIso = (...v: Array<string | null | undefined>) => v.filter((x): x is string => !!x).sort().pop() ?? null;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

interface Acc { name: string; total: number; synthetic: number; phone: number; owner: number; address: number; vphone: number; full: number; luxury: number; dup: number; scoreSum: number; scoreN: number; a7: number; a30: number; newest: string | null; weekly: number[]; states: Map<string, number> }
const blank = (name: string): Acc => ({ name, total: 0, synthetic: 0, phone: 0, owner: 0, address: 0, vphone: 0, full: 0, luxury: 0, dup: 0, scoreSum: 0, scoreN: 0, a7: 0, a30: 0, newest: null, weekly: Array(8).fill(0), states: new Map() });

function statsFrom(a: Acc | undefined): SourceStats {
  if (!a) return { total: 0, real: 0, synthetic: 0, phone: 0, verifiedOwner: 0, verifiedAddress: 0, verifiedPhone: 0, fullyVerified: 0, luxury: 0, duplicates: 0, avgScore: null, added7d: 0, added30d: 0, newestAt: null, weekly: Array(8).fill(0), byState: [], quality: null };
  const real = a.total - a.synthetic;
  const parts = real > 0 ? 0.4 * (a.phone / real) + 0.3 * (a.owner / real) + 0.3 * (a.address / real) : null;
  return {
    total: a.total, real, synthetic: a.synthetic, phone: a.phone, verifiedOwner: a.owner, verifiedAddress: a.address, verifiedPhone: a.vphone, fullyVerified: a.full, luxury: a.luxury, duplicates: a.dup,
    avgScore: a.scoreN ? Math.round(a.scoreSum / a.scoreN) : null, added7d: a.a7, added30d: a.a30, newestAt: a.newest, weekly: a.weekly,
    byState: [...a.states.entries()].map(([state, count]) => ({ state, count })).sort((x, y) => y.count - x.count).slice(0, 12),
    quality: parts === null ? null : Math.round(parts * 100),
  };
}

function healthOf(c: Row): Health {
  if (c.is_active === false) return 'paused';
  if (c.error_message || c.sync_status === 'error') return 'attention';
  if (c.sync_status === 'pending' && !c.last_successful_sync) return 'pending';
  return 'healthy';
}

/** Everything the Lead Sources Manager shows: each source's market configs, sync schedule, coverage and the measured quality of the leads it produced. */
export async function getLeadSourceOverview(db: Db, opts: { fresh?: boolean } = {}): Promise<Omit<LeadSourceOverview, 'canManage'>> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const [configs, schedules, coverage, leads] = await Promise.all([
    db.from('lead_source_configs').select('*').order('source_name').order('market').then(r => { if (r.error) throw r.error; return (r.data ?? []) as Row[]; }),
    db.from('sync_schedules').select('*').then(r => (r.error ? [] : ((r.data ?? []) as Row[]))),
    db.from('sync_source_coverage').select('*').then(r => (r.error ? [] : ((r.data ?? []) as Row[]))),
    fetchAll(db, 'leads', LEAD_COLUMNS, 'id'),
  ]);

  const now = Date.now();
  const acc = new Map<string, Acc>();
  const perConfig = new Map<string, number>();
  const allStates = new Set<string>();
  let realAll = 0; let phoneAll = 0; let ownerAll = 0; let added7All = 0;

  for (const l of leads) {
    const k = sourceKey(l.source) || 'other';
    const a = acc.get(k) ?? blank(String(l.source || 'Other'));
    acc.set(k, a);
    a.total++;
    const syn = l.is_synthetic === true;
    if (syn) a.synthetic++; else { realAll++; if (l.phone_available) { a.phone++; phoneAll++; } if (l.verified_owner) { a.owner++; ownerAll++; } if (l.verified_address) a.address++; }
    if (l.verified_number) a.vphone++;
    if (l.fully_verified) a.full++;
    if (l.luxury) a.luxury++;
    if (l.possible_duplicate) a.dup++;
    if (Number.isFinite(l.prospect_score)) { a.scoreSum += Number(l.prospect_score); a.scoreN++; }
    const st = String(l.state ?? '').trim().toUpperCase();
    if (st) { a.states.set(st, (a.states.get(st) ?? 0) + 1); allStates.add(st); }
    if (l.source_config_id) perConfig.set(l.source_config_id, (perConfig.get(l.source_config_id) ?? 0) + 1);
    const created = l.created_at ? Date.parse(l.created_at) : NaN;
    if (Number.isFinite(created)) {
      const age = now - created;
      if (age <= WEEK_MS) { a.a7++; added7All++; }
      if (age <= 30 * 86_400_000) a.a30++;
      const wk = Math.floor(age / WEEK_MS);
      if (wk >= 0 && wk < 8) a.weekly[7 - wk]++;
      if (!a.newest || l.created_at > a.newest) a.newest = l.created_at;
    }
  }

  const names = new Map<string, string>();
  const note = (raw: unknown) => { const k = sourceKey(raw); if (k && !names.has(k)) names.set(k, String(raw).trim()); return k; };
  const cfgBy = new Map<string, Row[]>();
  for (const c of configs) { const k = note(c.source_name); cfgBy.set(k, [...(cfgBy.get(k) ?? []), c]); }
  const covBy = new Map<string, Row[]>();
  for (const c of coverage) { const k = note(c.source_name); covBy.set(k, [...(covBy.get(k) ?? []), c]); }
  const schedBy = new Map<string, Row>();
  for (const s of schedules) { const k = note(s.source); const cur = schedBy.get(k); if (!cur || String(s.updated_at) > String(cur.updated_at)) schedBy.set(k, s); }
  for (const [k, a] of acc) if (!names.has(k)) names.set(k, a.name);

  const sources: SourceItem[] = [...names.entries()].map(([k, name]) => {
    const cfgs: ConfigItem[] = (cfgBy.get(k) ?? []).map(c => ({
      id: c.id, market: c.market, state: c.state ?? null, city: c.city ?? null, url: c.filter_url ?? null,
      method: (['api', 'scrape', 'manual', 'webhook'].includes(c.ingestion_method) ? c.ingestion_method : 'manual') as IngestionMethod,
      active: c.is_active !== false, health: healthOf(c), lastSuccess: c.last_successful_sync ?? null, lastAttempt: c.last_attempted_sync ?? null,
      error: c.error_message ?? null, notes: c.notes ?? null, leadCount: perConfig.get(c.id) ?? 0,
      filters: Array.isArray(c.property_type_filters) ? c.property_type_filters : [], furnishedRequired: c.furnished_required === true,
    }));
    const covRows = covBy.get(k) ?? [];
    const cov: CoverageItem[] = covRows.map(c => ({ id: c.id, portfolio: c.portfolio, zone: c.zone, url: c.sync_url ?? null, status: c.status, note: c.feasibility_note ?? null, lastSyncedAt: c.last_synced_at ?? null, lastStatus: c.last_sync_status ?? null, lastError: c.last_sync_error ?? null, imported: Number(c.leads_imported) || 0 }));
    const sRow = schedBy.get(k);
    const schedule: ScheduleInfo | null = sRow ? { intervalMs: Number(sRow.sync_interval_ms) || null, lastSyncAt: sRow.last_sync_at ?? null, nextSyncAt: sRow.next_sync_at ?? null, status: String(sRow.status ?? 'idle'), failures: Number(sRow.failure_count) || 0, lastError: sRow.last_error ?? null, leadsAdded: Number(sRow.leads_added) || 0 } : null;

    const attention = cfgs.filter(c => c.health === 'attention').length + (schedule && schedule.failures > 0 ? 1 : 0);
    let status: SourceItem['status'] = 'unmanaged';
    if (cfgs.length) {
      if (attention > 0) status = 'attention';
      else if (cfgs.every(c => c.health === 'paused')) status = 'paused';
      else if (cfgs.every(c => c.health === 'pending' || c.health === 'paused')) status = 'pending';
      else status = 'healthy';
    }
    const states = [...new Set([...cfgs.map(c => (c.state ?? '').toUpperCase()), ...(acc.get(k)?.states.keys() ?? [])].filter(Boolean))].sort();
    return {
      key: k, name, status, configs: cfgs, states, stats: statsFrom(acc.get(k)), schedule, attentionCount: attention,
      coverage: { total: cov.length, active: cov.filter(c => c.status === 'active').length, unconfirmed: cov.filter(c => c.status !== 'active').length, imported: cov.reduce((s, c) => s + c.imported, 0), lastSyncedAt: maxIso(...cov.map(c => c.lastSyncedAt)), items: cov.slice(0, 60) },
      lastSuccess: maxIso(...cfgs.map(c => c.lastSuccess), ...cov.map(c => c.lastSyncedAt), schedule?.lastSyncAt),
    };
  }).sort((a, b) => b.stats.total - a.stats.total || a.name.localeCompare(b.name));

  for (const c of configs) if (c.state) allStates.add(String(c.state).toUpperCase());
  const flat = sources.flatMap(s => s.configs);
  const value = {
    generatedAt: new Date().toISOString(),
    totals: {
      sources: sources.length, configs: flat.length, activeConfigs: flat.filter(c => c.active).length, pausedConfigs: flat.filter(c => c.health === 'paused').length,
      attentionConfigs: flat.filter(c => c.health === 'attention').length, pendingConfigs: flat.filter(c => c.health === 'pending').length,
      leads: leads.length, added7d: added7All, phonePct: pct(phoneAll, realAll), verifiedOwnerPct: pct(ownerAll, realAll),
    },
    states: [...allStates].sort(),
    sources,
  };
  cache = { at: Date.now(), value };
  return value;
}
