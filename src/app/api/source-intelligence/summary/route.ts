import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const PAGE_SIZE = 1000;
const QUALITY_SCORE_THRESHOLD = 70;
const CONVERSION_STAGES = ['human_outreach', 'Interested', 'Qualified', 'Appointment Scheduled', 'Proposal Sent', 'Under Contract', 'Live'];
const LIVE_STAGES = ['Under Contract', 'Live'];

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

function withRealLeads(query: any) {
  return query.or('is_synthetic.is.null,is_synthetic.eq.false');
}

async function countBySource(
  source: string,
  configure?: (query: any) => any,
): Promise<number> {
  const db = getSupabaseAdmin();
  let query = withRealLeads(db.from('leads').select('id', { count: 'exact', head: true })).eq('source', source);
  if (configure) {
    query = configure(query);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function fetchDistinctSources(): Promise<string[]> {
  const db = getSupabaseAdmin();
  const sources = new Set<string>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await withRealLeads(
      db.from('leads')
        .select('source')
        .order('source', { ascending: true })
        .range(from, from + PAGE_SIZE - 1),
    );

    if (error) throw error;

    for (const row of data || []) {
      const source = String(row.source || '').trim();
      if (source) sources.add(source);
    }

    if (!data || data.length < PAGE_SIZE) break;
  }

  return [...sources].sort((a, b) => a.localeCompare(b));
}

export async function GET() {
  try {
    const sources = await fetchDistinctSources();

    const rows = await Promise.all(sources.map(async (source) => {
      const [totalLeads, qualityLeads, convertedLeads, fullyVerifiedLeads, liveLeads] = await Promise.all([
        countBySource(source),
        countBySource(source, (query) => query.gte('prospect_score', QUALITY_SCORE_THRESHOLD)),
        countBySource(source, (query) => query.in('stage', CONVERSION_STAGES)),
        countBySource(source, (query) => query.eq('fully_verified', true)),
        countBySource(source, (query) => query.in('stage', LIVE_STAGES)),
      ]);

      return {
        source,
        totalLeads,
        qualityLeads,
        qualityPct: pct(qualityLeads, totalLeads),
        convertedLeads,
        conversionPct: pct(convertedLeads, totalLeads),
        fullyVerifiedLeads,
        verifiedPct: pct(fullyVerifiedLeads, totalLeads),
        liveLeads,
        livePct: pct(liveLeads, totalLeads),
      };
    }));

    const ordered = rows.sort((a, b) => b.totalLeads - a.totalLeads || a.source.localeCompare(b.source));
    const totalLeads = ordered.reduce((sum, row) => sum + row.totalLeads, 0);
    const totalQualityLeads = ordered.reduce((sum, row) => sum + row.qualityLeads, 0);
    const totalConvertedLeads = ordered.reduce((sum, row) => sum + row.convertedLeads, 0);
    const totalVerifiedLeads = ordered.reduce((sum, row) => sum + row.fullyVerifiedLeads, 0);
    const totalLiveLeads = ordered.reduce((sum, row) => sum + row.liveLeads, 0);

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      definitions: {
        qualityThreshold: QUALITY_SCORE_THRESHOLD,
        conversionStages: CONVERSION_STAGES,
        liveStages: LIVE_STAGES,
      },
      totals: {
        totalLeads,
        activeSources: ordered.filter((row) => row.totalLeads > 0).length,
        qualityLeads: totalQualityLeads,
        qualityPct: pct(totalQualityLeads, totalLeads),
        convertedLeads: totalConvertedLeads,
        conversionPct: pct(totalConvertedLeads, totalLeads),
        verifiedLeads: totalVerifiedLeads,
        verifiedPct: pct(totalVerifiedLeads, totalLeads),
        liveLeads: totalLiveLeads,
        livePct: pct(totalLiveLeads, totalLeads),
      },
      sources: ordered.map((row) => ({
        ...row,
        sharePct: pct(row.totalLeads, totalLeads),
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to load source intelligence',
    }, { status: 500 });
  }
}
