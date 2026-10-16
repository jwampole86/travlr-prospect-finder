'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Activity, BarChart2, Database, RefreshCw, Shield, Zap } from 'lucide-react';
import type { Stat } from '@/components/ops';
import {
  buttonSecondary,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  SegmentedTabs,
  StatGrid,
} from '@/components/ops';
import { createClient } from '@/lib/supabase/client';
import RecentValidationEventsPanel from './components/RecentValidationEventsPanel';
import SourceBreakdownPanels from './components/SourceBreakdownPanels';
import type {
  AnomalyEntry,
  FieldConfidenceDist,
  RecentEvent,
  SourceBreakdown,
  Timeframe,
  TrendPoint,
  ValidationSummary,
} from './components/types';
import ValidationCharts from './components/ValidationCharts';

const PAGE_SIZE = 1000;
const EVENT_COLUMNS =
  'id,lead_id,source,passed,overall_confidence,ownership_confidence,market_comp_confidence,recommendation,cache_hit,field_confidence_scores,anomalies,created_at';

function getSince(timeframe: Timeframe) {
  const now = Date.now();
  if (timeframe === '24h') return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  if (timeframe === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
}

export default function EnrichmentValidationAnalyticsPage() {
  const supabase = createClient();
  const [timeframe, setTimeframe] = useState<Timeframe>('7d');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [sourceBreakdown, setSourceBreakdown] = useState<SourceBreakdown[]>([]);
  const [fieldDist, setFieldDist] = useState<FieldConfidenceDist[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyEntry[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);

  const fetchAllEvents = useCallback(
    async (since: string, totalCount: number) => {
      const rows: RecentEvent[] = [];
      for (let from = 0; from < totalCount; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('enrichment_validation_events')
          .select(EVENT_COLUMNS)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        rows.push(...(((data as RecentEvent[] | null) || []) as RecentEvent[]));
        if (!data || data.length < PAGE_SIZE) break;
      }
      return rows;
    },
    [supabase]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const since = getSince(timeframe);
      const [totalResult, passedResult, cacheHitsResult] = await Promise.all([
        supabase
          .from('enrichment_validation_events')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', since),
        supabase
          .from('enrichment_validation_events')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', since)
          .eq('passed', true),
        supabase
          .from('enrichment_validation_events')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', since)
          .eq('cache_hit', true),
      ]);

      for (const result of [totalResult, passedResult, cacheHitsResult]) {
        if (result.error) throw result.error;
      }

      const total = totalResult.count || 0;
      const passed = passedResult.count || 0;
      const cacheHits = cacheHitsResult.count || 0;

      if (total === 0) {
        setSummary({
          total: 0,
          passed: 0,
          failed: 0,
          cacheHits: 0,
          passRate: 0,
          avgOverallConfidence: 0,
          avgOwnershipConfidence: 0,
          avgMarketCompConfidence: 0,
        });
        setSourceBreakdown([]);
        setFieldDist([]);
        setAnomalies([]);
        setTrends([]);
        setRecentEvents([]);
        return;
      }

      const rows = await fetchAllEvents(since, total);
      const failed = Math.max(0, total - passed);
      const avgOverallConfidence = Math.round(
        rows.reduce((sum, row) => sum + (row.overall_confidence ?? 0), 0) / Math.max(rows.length, 1)
      );
      const ownershipRows = rows.filter((row) => row.ownership_confidence !== null);
      const marketRows = rows.filter((row) => row.market_comp_confidence !== null);

      setSummary({
        total,
        passed,
        failed,
        cacheHits,
        passRate: Math.round((passed / total) * 100),
        avgOverallConfidence,
        avgOwnershipConfidence: ownershipRows.length
          ? Math.round(
              ownershipRows.reduce((sum, row) => sum + (row.ownership_confidence ?? 0), 0) /
                ownershipRows.length
            )
          : 0,
        avgMarketCompConfidence: marketRows.length
          ? Math.round(
              marketRows.reduce((sum, row) => sum + (row.market_comp_confidence ?? 0), 0) /
                marketRows.length
            )
          : 0,
      });

      const groupedBySource = new Map<string, RecentEvent[]>();
      const fieldMap = new Map<
        string,
        { total: number; sumConfidence: number; low: number; medium: number; high: number }
      >();
      const anomalyMap = new Map<string, number>();
      const trendMap = new Map<
        string,
        { passed: number; failed: number; total: number; sum: number }
      >();

      for (const row of rows) {
        const source = row.source || 'Unknown';
        groupedBySource.set(source, [...(groupedBySource.get(source) || []), row]);

        for (const fieldScore of (row.field_confidence_scores || []) as Array<{
          field?: string;
          confidence?: number;
        }>) {
          if (!fieldScore.field) continue;
          const existing = fieldMap.get(fieldScore.field) || {
            total: 0,
            sumConfidence: 0,
            low: 0,
            medium: 0,
            high: 0,
          };
          const confidence = fieldScore.confidence ?? 0;
          existing.total += 1;
          existing.sumConfidence += confidence;
          if (confidence < 60) existing.low += 1;
          else if (confidence < 80) existing.medium += 1;
          else existing.high += 1;
          fieldMap.set(fieldScore.field, existing);
        }

        for (const anomaly of row.anomalies || []) {
          anomalyMap.set(anomaly, (anomalyMap.get(anomaly) || 0) + 1);
        }

        const day = row.created_at.slice(0, 10);
        const trend = trendMap.get(day) || { passed: 0, failed: 0, total: 0, sum: 0 };
        if (row.passed) trend.passed += 1;
        else trend.failed += 1;
        trend.total += 1;
        trend.sum += row.overall_confidence ?? 0;
        trendMap.set(day, trend);
      }

      setSourceBreakdown(
        Array.from(groupedBySource.entries())
          .map(([source, events]) => {
            const sourcePassed = events.filter((event) => event.passed).length;
            return {
              source,
              total: events.length,
              passed: sourcePassed,
              failed: events.length - sourcePassed,
              passRate: Math.round((sourcePassed / events.length) * 100),
              avgConfidence: Math.round(
                events.reduce((sum, event) => sum + (event.overall_confidence ?? 0), 0) /
                  events.length
              ),
              cacheHits: events.filter((event) => event.cache_hit).length,
              lastValidated: events[0]?.created_at || null,
            };
          })
          .sort((left, right) => right.total - left.total)
      );

      setFieldDist(
        Array.from(fieldMap.entries())
          .map(([field, values]) => ({
            field,
            avgConfidence: Math.round(values.sumConfidence / Math.max(values.total, 1)),
            low: values.low,
            medium: values.medium,
            high: values.high,
            total: values.total,
          }))
          .sort((left, right) => right.total - left.total)
          .slice(0, 12)
      );

      setAnomalies(
        Array.from(anomalyMap.entries())
          .map(([anomaly, count]) => ({ anomaly, count }))
          .sort((left, right) => right.count - left.count)
          .slice(0, 10)
      );

      setTrends(
        Array.from(trendMap.entries())
          .map(([date, values]) => ({
            date,
            passed: values.passed,
            failed: values.failed,
            passRate: Math.round((values.passed / values.total) * 100),
            avgConfidence: Math.round(values.sum / values.total),
          }))
          .sort((left, right) => left.date.localeCompare(right.date))
      );

      setRecentEvents(rows.slice(0, 50));
    } catch (error) {
      console.error('[enrichment-validation-analytics]', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to load validation analytics.'
      );
      setSummary(null);
      setSourceBreakdown([]);
      setFieldDist([]);
      setAnomalies([]);
      setTrends([]);
      setRecentEvents([]);
    } finally {
      setLoading(false);
    }
  }, [fetchAllEvents, supabase, timeframe]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo<Stat[]>(() => {
    if (!summary) return [];
    return [
      {
        label: 'Logged validations',
        value: summary.total.toLocaleString(),
        hint: 'Counted from the live enrichment_validation_events table',
        icon: Activity,
        tone: 'primary',
      },
      {
        label: 'Pass rate',
        value: `${summary.passRate}%`,
        hint: `${summary.passed.toLocaleString()} passed / ${summary.failed.toLocaleString()} failed`,
        icon: Shield,
        tone: summary.passRate >= 80 ? 'success' : summary.passRate >= 60 ? 'warning' : 'danger',
      },
      {
        label: 'Average confidence',
        value: summary.avgOverallConfidence.toLocaleString(),
        hint: `Owner ${summary.avgOwnershipConfidence} · Comps ${summary.avgMarketCompConfidence}`,
        icon: BarChart2,
        tone: 'default',
      },
      {
        label: 'Cache hits',
        value: summary.cacheHits.toLocaleString(),
        hint: 'Real cache-hit events, not an estimated savings model',
        icon: Zap,
        tone: 'warning',
      },
      {
        label: 'Sources active',
        value: sourceBreakdown.length.toLocaleString(),
        hint: 'Distinct sources represented in the selected window',
        icon: Database,
        tone: 'default',
      },
    ];
  }, [sourceBreakdown.length, summary]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-screen-2xl space-y-6 p-6">
        <PageHeader
          icon={Shield}
          title="Enrichment Validation Analytics"
          description="Real pass/fail outcomes, field confidence distributions, cache hits, and anomaly strings captured by validation events."
          actions={
            <button type="button" onClick={loadData} className={buttonSecondary} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          }
        />

        <SegmentedTabs<Timeframe>
          value={timeframe}
          onChange={setTimeframe}
          tabs={[
            { key: '24h', label: '24 hours' },
            { key: '7d', label: '7 days' },
            { key: '30d', label: '30 days' },
          ]}
        />

        {errorMessage && <ErrorBanner message={errorMessage} onRetry={loadData} />}

        {loading && !summary ? (
          <LoadingState label="Loading validation analytics from Supabase…" />
        ) : summary ? (
          <>
            <StatGrid stats={stats} columns={5} />

            {summary.total === 0 ? (
              <EmptyState
                icon={Shield}
                title="No validation events in this timeframe"
                hint="The live database currently has zero rows in enrichment_validation_events for this window, so this page intentionally shows an honest empty state instead of fabricated charts."
              />
            ) : (
              <>
                <ValidationCharts summary={summary} trends={trends} fieldDist={fieldDist} />
                <SourceBreakdownPanels sourceBreakdown={sourceBreakdown} anomalies={anomalies} />
                <RecentValidationEventsPanel events={recentEvents} />
              </>
            )}
          </>
        ) : (
          <EmptyState
            icon={Shield}
            title="Validation analytics unavailable"
            hint="We could not load enrichment_validation_events for the selected timeframe."
          />
        )}
      </div>
    </AppLayout>
  );
}
