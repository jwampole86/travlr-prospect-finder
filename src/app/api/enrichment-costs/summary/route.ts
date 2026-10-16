import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const PAGE_SIZE = 1000;
const RECENT_LOG_LIMIT = 100;

interface LogRow {
  id: string;
  lead_id: string | null;
  provider: string;
  stage: string;
  cost: number | null;
  success: boolean | null;
  error_message: string | null;
  called_at: string;
}

interface SummaryRow {
  provider: string;
  stage: string;
  total_cost: number;
  total_calls: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  last_called_at: string | null;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error: countError } = await supabase
      .from('enrichment_api_logs')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      throw countError;
    }

    const totalRows = count ?? 0;
    const logs: LogRow[] = [];

    for (let from = 0; from < totalRows; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('enrichment_api_logs')
        .select('id, lead_id, provider, stage, cost, success, error_message, called_at')
        .order('called_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw error;
      }
      logs.push(...((data || []) as LogRow[]));
    }

    const grouped = new Map<string, SummaryRow>();
    for (const log of logs) {
      const key = `${log.provider}__${log.stage}`;
      const existing = grouped.get(key) || {
        provider: log.provider,
        stage: log.stage,
        total_cost: 0,
        total_calls: 0,
        success_count: 0,
        failure_count: 0,
        success_rate: 0,
        last_called_at: null,
      };

      existing.total_cost += Number(log.cost || 0);
      existing.total_calls += 1;
      if (log.success) existing.success_count += 1;
      else existing.failure_count += 1;
      if (!existing.last_called_at || log.called_at > existing.last_called_at) {
        existing.last_called_at = log.called_at;
      }
      grouped.set(key, existing);
    }

    const summary = Array.from(grouped.values())
      .map((row) => ({
        ...row,
        total_cost: Math.round(row.total_cost * 100) / 100,
        success_rate: row.total_calls > 0 ? Math.round((row.success_count / row.total_calls) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total_cost - a.total_cost || b.total_calls - a.total_calls || a.provider.localeCompare(b.provider));

    const totals = {
      loggedRows: totalRows,
      providers: new Set(summary.map((row) => row.provider)).size,
      totalSpend: Math.round(summary.reduce((sum, row) => sum + row.total_cost, 0) * 100) / 100,
      totalCalls: summary.reduce((sum, row) => sum + row.total_calls, 0),
      successes: summary.reduce((sum, row) => sum + row.success_count, 0),
      failures: summary.reduce((sum, row) => sum + row.failure_count, 0),
      successRate: totalRows > 0
        ? Math.round((summary.reduce((sum, row) => sum + row.success_count, 0) / totalRows) * 1000) / 10
        : 0,
      lastCalledAt: logs[0]?.called_at || null,
    };

    const stageTotals = Object.fromEntries(
      ['stage1', 'stage2', 'stage3'].map((stage) => {
        const rows = summary.filter((row) => row.stage === stage);
        return [stage, {
          stage,
          total_cost: Math.round(rows.reduce((sum, row) => sum + row.total_cost, 0) * 100) / 100,
          total_calls: rows.reduce((sum, row) => sum + row.total_calls, 0),
          success_count: rows.reduce((sum, row) => sum + row.success_count, 0),
          failure_count: rows.reduce((sum, row) => sum + row.failure_count, 0),
          success_rate: rows.reduce((sum, row) => sum + row.total_calls, 0) > 0
            ? Math.round((rows.reduce((sum, row) => sum + row.success_count, 0) / rows.reduce((sum, row) => sum + row.total_calls, 0)) * 1000) / 10
            : 0,
        }];
      }),
    );

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      totals,
      summary,
      stageTotals,
      recentLogs: logs.slice(0, RECENT_LOG_LIMIT),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Supabase errors are plain objects, not Error instances.
    const message = (error as { message?: string } | null)?.message;
    return NextResponse.json({ error: message || 'Failed to load enrichment cost summary' }, { status: 500 });
  }
}
