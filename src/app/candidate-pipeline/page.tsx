'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardList, LayoutGrid, RefreshCw, Search, Table2, Users } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  buttonSecondary,
  inputClass,
} from '@/components/ops';
import { createClient } from '@/lib/supabase/client';
import type { PipelineCandidate, PipelineCounts, PipelineResponse, PipelineStatus } from '@/app/candidate-tracker/types';
import { PIPELINE_STAGES } from './config';
import { lastActivityAt } from './helpers';
import { PipelineBoard } from './components/PipelineBoard';
import { PipelineTable } from './components/PipelineTable';

type ViewMode = 'board' | 'table';
type SortMode = 'rank' | 'score' | 'recent' | 'name';

function setupGuidance(message?: string) {
  const text = message?.toLowerCase() || '';
  if (!text.includes('relation') && !text.includes('column')) return null;
  return [
    '20260908210000_candidates_resume_interview_upgrade.sql',
    '20260909000000_interview_phase2_pipeline_consistency_qa.sql',
  ];
}

const EMPTY_COUNTS: PipelineCounts = {
  total: 0,
  READY_TO_INTERVIEW: 0,
  INTERVIEWED: 0,
  FOLLOW_UP: 0,
  HOLD: 0,
  MOVE_FORWARD: 0,
  HIRED: 0,
  NOT_MOVING_FORWARD: 0,
};

export default function CandidatePipelinePage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PipelineStatus>('ALL');
  const [view, setView] = useState<ViewMode>('board');
  const [sortBy, setSortBy] = useState<SortMode>('rank');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/candidates/pipeline${params.toString() ? `?${params.toString()}` : ''}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.details?.message || payload?.error || 'Failed to load candidate pipeline');
      setData(payload as PipelineResponse);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Failed to load candidate pipeline');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel('candidate-pipeline-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, () => {
        void loadData();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  const sortedCandidates = useMemo(() => {
    const candidates = [...(data?.candidates || [])];
    candidates.sort((left, right) => {
      if (sortBy === 'name') return left.full_name.localeCompare(right.full_name);
      if (sortBy === 'score') return (right.latest_scorecard_average || -1) - (left.latest_scorecard_average || -1);
      if (sortBy === 'recent') return new Date(lastActivityAt(right) || 0).getTime() - new Date(lastActivityAt(left) || 0).getTime();
      return (left.candidate_rank ?? Number.MAX_SAFE_INTEGER) - (right.candidate_rank ?? Number.MAX_SAFE_INTEGER);
    });
    return candidates;
  }, [data?.candidates, sortBy]);

  const handleStatusChange = useCallback(async (candidateId: string, newStatus: PipelineStatus) => {
    if (!data) return;
    const candidate = data.candidates.find((item) => item.id === candidateId);
    if (!candidate || candidate.pipeline_status === newStatus) return;

    const previousData = data;
    const nextCounts: PipelineCounts = {
      ...data.counts,
      [candidate.pipeline_status]: Math.max(0, data.counts[candidate.pipeline_status] - 1),
      [newStatus]: data.counts[newStatus] + 1,
    };

    setSavingId(candidateId);
    setError(null);
    setData({
      candidates: data.candidates.map((item) => item.id === candidateId ? { ...item, pipeline_status: newStatus } : item),
      counts: nextCounts,
    });

    try {
      const res = await fetch('/api/candidates/pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, newStatus }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.details?.message || payload?.error || 'Failed to update pipeline stage');
      if (newStatus === 'HIRED' && payload?.offerDraftUrl) {
        window.location.href = payload.offerDraftUrl;
        return;
      }
      await loadData();
    } catch (err) {
      setData(previousData);
      setError(err instanceof Error ? err.message : 'Failed to update pipeline stage');
    } finally {
      setSavingId(null);
    }
  }, [data, loadData]);

  const setupMigrations = useMemo(() => setupGuidance(error || undefined), [error]);
  const counts = data?.counts ?? EMPTY_COUNTS;

  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          icon={Users}
          title="Candidate Pipeline"
          description="Live hiring pipeline from candidates.pipeline_status. This page now uses the same server route and stage names as Candidate Tracker instead of the empty legacy candidate_profiles table."
          actions={(
            <>
              <button onClick={() => void loadData()} className={buttonSecondary} disabled={loading || !!savingId}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh
              </button>
              <Link href="/candidate-tracker" className={buttonSecondary}><ClipboardList size={16} />Tracker</Link>
              <Link href="/teleprompter/interview" className={buttonSecondary}><CheckCircle2 size={16} />Start interview</Link>
            </>
          )}
        />

        {error ? <ErrorBanner message={error} onRetry={() => void loadData()} /> : null}

        <StatGrid
          columns={5}
          stats={[
            { label: 'Total candidates', value: counts.total, icon: Users, tone: 'default', hint: 'Live candidates table rows' },
            { label: 'Ready to interview', value: counts.READY_TO_INTERVIEW, icon: Users, tone: 'primary' },
            { label: 'Interviewed', value: counts.INTERVIEWED, icon: CheckCircle2, tone: 'warning' },
            { label: 'Move forward', value: counts.MOVE_FORWARD, icon: CheckCircle2, tone: 'success' },
            { label: 'Hired', value: counts.HIRED, icon: CheckCircle2, tone: 'success' },
          ]}
        />

        <Panel title="Filters" icon={Search}>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={inputClass}
              placeholder="Search by candidate name"
              aria-label="Search candidates"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | PipelineStatus)} className={inputClass}>
              <option value="ALL">All stages</option>
              {PIPELINE_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
            </select>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortMode)} className={inputClass}>
              <option value="rank">Sort by rank</option>
              <option value="score">Sort by score</option>
              <option value="recent">Sort by recent activity</option>
              <option value="name">Sort by name</option>
            </select>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SegmentedTabs
              tabs={PIPELINE_STAGES.map((stage) => ({ key: stage.id, label: stage.label, badge: counts[stage.id] }))}
              value={statusFilter === 'ALL' ? 'READY_TO_INTERVIEW' : statusFilter}
              onChange={(stage) => setStatusFilter((current) => current === stage ? 'ALL' : stage)}
            />
            <SegmentedTabs
              tabs={[
                { key: 'board', label: 'Board', icon: LayoutGrid },
                { key: 'table', label: 'Table', icon: Table2 },
              ]}
              value={view}
              onChange={(mode) => setView(mode)}
            />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Showing {sortedCandidates.length} candidate{sortedCandidates.length === 1 ? '' : 's'} · filter {statusFilter === 'ALL' ? 'All stages' : PIPELINE_STAGES.find((stage) => stage.id === statusFilter)?.label}
          </p>
        </Panel>

        {loading && !data ? <LoadingState label="Loading live candidate pipeline…" /> : null}

        {!loading && data && sortedCandidates.length === 0 ? (
          <EmptyState
            icon={Users}
            title={data.candidates.length === 0 ? 'No candidates in the live pipeline' : 'No candidates match these filters'}
            hint={data.candidates.length === 0 ? 'The candidates table exists, but it has no rows yet.' : 'Try a different name, sort, or pipeline stage.'}
          />
        ) : null}

        {!loading && data && sortedCandidates.length > 0 ? (
          view === 'board'
            ? <PipelineBoard candidates={sortedCandidates} savingId={savingId} onStatusChange={handleStatusChange} />
            : <PipelineTable candidates={sortedCandidates} savingId={savingId} onStatusChange={handleStatusChange} />
        ) : null}

        {setupMigrations ? (
          <Panel title="Schema setup required" icon={Search}>
            <p className="text-sm text-muted-foreground">The live database is missing the hiring pipeline tables or columns this page needs.</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {setupMigrations.map((migration) => <li key={migration}>• {migration}</li>)}
            </ul>
          </Panel>
        ) : null}
      </div>
    </AppLayout>
  );
}
