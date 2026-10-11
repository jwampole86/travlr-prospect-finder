import type { SupabaseClient } from '@supabase/supabase-js';

export interface MarketBenchmark {
  luxury_rent_threshold: number;
  luxury_sale_threshold: number;
}
export type BenchmarkMap = Map<string, MarketBenchmark>;

export interface LuxuryResult {
  luxury: boolean;
  threshold: number | null;
  basis: 'ZIP_BENCHMARK' | 'ZIP3_BENCHMARK' | 'STATE_BENCHMARK' | null;
}

const zip5 = (zip?: string | null) => (zip || '').trim().slice(0, 5);

/** Loads ZIP and state benchmark rows for the given leads in as few requests as possible. */
export async function loadBenchmarks(db: SupabaseClient, zips: string[], states: string[]): Promise<BenchmarkMap> {
  const map: BenchmarkMap = new Map();
  const zipList = [...new Set(zips.map(zip5).filter(z => /^\d{5}$/.test(z)))];
  const stateList = [...new Set(states.map(s => (s || '').toUpperCase()).filter(s => s.length === 2))];
  const cols = 'geo_type,geo_key,luxury_rent_threshold,luxury_sale_threshold';

  const add = (rows: Array<Record<string, unknown>> | null) => {
    for (const r of rows || []) {
      map.set(`${r.geo_type}:${r.geo_key}`, {
        luxury_rent_threshold: Number(r.luxury_rent_threshold),
        luxury_sale_threshold: Number(r.luxury_sale_threshold),
      });
    }
  };
  if (stateList.length > 0) {
    const { data } = await db.from('market_cost_benchmarks').select(cols).eq('geo_type', 'state').in('geo_key', stateList);
    add(data);
  }
  const prefixList = [...new Set(zipList.map(z => z.slice(0, 3)))];
  for (let i = 0; i < prefixList.length; i += 150) {
    const { data } = await db.from('market_cost_benchmarks').select(cols).eq('geo_type', 'zip3').in('geo_key', prefixList.slice(i, i + 150));
    add(data);
  }
  for (let i = 0; i < zipList.length; i += 150) {
    const { data } = await db.from('market_cost_benchmarks').select(cols).eq('geo_type', 'zip').in('geo_key', zipList.slice(i, i + 150));
    add(data);
  }
  return map;
}

/**
 * Rent leads compare monthly rent to the area's luxury rent bar; sale leads compare the asking
 * price to the area's luxury sale-price bar. A lead with no usable price is never luxury.
 */
export function classifyLuxury(input: {
  state?: string | null;
  zip?: string | null;
  priceType: 'rent' | 'sale';
  price: number | null | undefined;
  benchmarks: BenchmarkMap;
}): LuxuryResult {
  const price = Number(input.price);
  if (!price || price <= 0) return { luxury: false, threshold: null, basis: null };

  const state = (input.state || '').toUpperCase();
  const zipRow = input.benchmarks.get(`zip:${zip5(input.zip)}`);
  const zip3Row = input.benchmarks.get(`zip3:${zip5(input.zip).slice(0, 3)}`);
  const stateRow = input.benchmarks.get(`state:${state}`);
  const row = zipRow ?? zip3Row ?? stateRow;
  if (!row) return { luxury: false, threshold: null, basis: null };

  const basis = zipRow ? 'ZIP_BENCHMARK' : zip3Row ? 'ZIP3_BENCHMARK' : 'STATE_BENCHMARK';
  const threshold = input.priceType === 'sale' ? row.luxury_sale_threshold : row.luxury_rent_threshold;
  return { luxury: price >= threshold, threshold, basis };
}
