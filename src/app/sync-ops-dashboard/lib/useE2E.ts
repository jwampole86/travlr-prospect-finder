import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { E2ERow } from './types';

interface PortfolioRef { label: string; stateCode: string }

const OUTREACH_READY_SCORE = 60;
const BATCH = 6;

/** End-to-end check per portfolio: leads exist, are scored, enriched, outreach-ready and still arriving. */
export function useE2E(portfolios: PortfolioRef[], log: (level: 'info' | 'ok' | 'warn' | 'error', text: string) => void) {
  const supabase = createClient();
  const [rows, setRows] = useState<E2ERow[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setRows([]);
    log('info', `Starting E2E validation across ${portfolios.length} portfolios`);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const out: E2ERow[] = [];

    const check = async (p: PortfolioRef): Promise<E2ERow> => {
      const count = (build: (q: ReturnType<typeof base>) => PromiseLike<{ count: number | null }>) => build(base()).then((r) => r.count || 0);
      const base = () => supabase.from('leads').select('*', { count: 'exact', head: true }).eq('state', p.stateCode);
      const row: E2ERow = { portfolio: p.label, stateCode: p.stateCode, leads: 0, scoredPct: 0, enrichedPct: 0, outreachReady: 0, fresh: false, status: 'fail', issues: [] };
      try {
        const [leads, scored, enriched, ready, recent] = await Promise.all([
          count((q) => q),
          count((q) => q.gt('prospect_score', 0)),
          count((q) => q.eq('enrichment_status', 'COMPLETE')),
          count((q) => q.gte('prospect_score', OUTREACH_READY_SCORE)),
          count((q) => q.gte('created_at', since)),
        ]);
        const pct = (n: number) => (leads > 0 ? Math.round((n / leads) * 100) : 0);
        Object.assign(row, { leads, scoredPct: pct(scored), enrichedPct: pct(enriched), outreachReady: ready, fresh: recent > 0 });

        if (leads === 0) row.issues.push('No leads yet. Run a sync for this portfolio');
        else {
          if (scored === 0) row.issues.push('No leads have been scored');
          if (ready === 0) row.issues.push(`No outreach-ready leads (score ≥ ${OUTREACH_READY_SCORE})`);
          if (recent === 0) row.issues.push('No new leads in the last 24h');
        }
        row.status = leads === 0 || scored === 0 ? 'fail' : row.issues.length > 0 ? 'warn' : 'pass';
      } catch (err) {
        row.issues.push(err instanceof Error ? err.message : 'Query error');
        row.status = 'fail';
      }
      return row;
    };

    for (let i = 0; i < portfolios.length; i += BATCH) {
      const batch = await Promise.all(portfolios.slice(i, i + BATCH).map(check));
      for (const r of batch) {
        log(r.status === 'pass' ? 'ok' : r.status === 'warn' ? 'warn' : 'error',
          `${r.portfolio}: ${r.leads} leads · scored ${r.scoredPct}% · enriched ${r.enrichedPct}% · ready ${r.outreachReady}`);
      }
      out.push(...batch);
      setRows([...out]);
    }

    const passed = out.filter((r) => r.status === 'pass').length;
    log('info', `E2E complete: ${passed}/${out.length} passed, ${out.filter((r) => r.status === 'fail').length} failed`);
    setRunning(false);
  }, [supabase, portfolios, log]);

  return { rows, running, run };
}
