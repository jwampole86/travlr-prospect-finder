'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock3, GitPullRequestArrow, RefreshCw, Search, Users, XCircle } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  StatGrid,
  buttonSecondary,
  inputClass,
} from '@/components/ops';
import { TrackerTable } from './components/TrackerTable';
import type { PipelineCandidate, PipelineCounts, PipelineResponse, PipelineStatus } from './types';

function humanize(value?: string | null) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : 'All stages';
}

function setupGuidance(message?: string) {
  const text = message?.toLowerCase() || '';
  if (!text.includes('relation') && !text.includes('column')) return null;
  return [
    '20260908210000_candidates_resume_interview_upgrade.sql',
    '20260909000000_interview_phase2_pipeline_consistency_qa.sql',
  ];
}

export default function CandidateTrackerPage() {
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PipelineStatus>('ALL');
  const [sortBy, setSortBy] = useState<'rank' | 'score' | 'recent' | 'name'>('rank');
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
      if (!res.ok) throw new Error(payload?.details?.message || payload?.error || 'Failed to load candidate tracker');
      setData(payload as PipelineResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load candidate tracker');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleStatusChange = useCallback(async (candidateId: string, newStatus: PipelineStatus) => {
    if (!data) return;
    const candidate = data.candidates.find((item) => item.id === candidateId);
    if (!candidate || candidate.pipeline_status === newStatus) return;

    const previousData = data;
    const nextCandidates = data.candidates.map((item) => item.id === candidateId ? { ...item, pipeline_status: newStatus } : item);
    const nextCounts: PipelineCounts = {
      ...data.counts,
      [candidate.pipeline_status]: Math.max(0, data.counts[candidate.pipeline_status] - 1),
      [newStatus]: data.counts[newStatus] + 1,
    };
    setData({ candidates: nextCandidates, counts: nextCounts });
    setSavingId(candidateId);
    setError(null);

    try {
      const res = await fetch('/api/candidates/pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, newStatus }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.details?.message || payload?.error || 'Failed to update pipeline stage');
      await loadData();
    } catch (err) {
      setData(previousData);
      setError(err instanceof Error ? err.message : 'Failed to update pipeline stage');
    } finally {
      setSavingId(null);
    }
  }, [data, loadData]);

  const filteredCandidates = useMemo(() => {
    const candidates = [...(data?.candidates || [])];
    candidates.sort((a, b) => {
      if (sortBy === 'name') return a.full_name.localeCompare(b.full_name);
      if (sortBy === 'score') return (b.latest_scorecard_average || -1) - (a.latest_scorecard_average || -1);
      if (sortBy === 'recent') return new Date(b.latest_interview_at || b.updated_at || 0).getTime() - new Date(a.latest_interview_at || a.updated_at || 0).getTime();
      return (a.candidate_rank ?? Number.MAX_SAFE_INTEGER) - (b.candidate_rank ?? Number.MAX_SAFE_INTEGER);
    });
    return candidates;
  }, [data?.candidates, sortBy]);

  const setupMigrations = useMemo(() => setupGuidance(error || undefined), [error]);

  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <PageHeader
          icon={Users}
          title="Candidate Tracker"
          description="Tracks the real hiring pipeline from candidates.pipeline_status, candidate scorecards, and consistency-report state. Stage changes persist through the server PATCH route rather than legacy local-only tables."
          actions={(
            <>
              <button onClick={() => void loadData()} className={buttonSecondary} disabled={loading || !!savingId}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh
              </button>
              <Link href="/consistency-report" className={buttonSecondary}><CheckCircle2 size={16} />Consistency</Link>
            </>
          )}
        />

        {error ? <ErrorBanner message={error} onRetry={() => void loadData()} /> : null}

        {data ? (
          <StatGrid
            columns={5}
            stats={[
              { label: 'Total candidates', value: data.counts.total, icon: Users, tone: 'default' },
              { label: 'Ready to interview', value: data.counts.READY_TO_INTERVIEW, icon: Clock3, tone: 'warning' },
              { label: 'Interviewed', value: data.counts.INTERVIEWED, icon: GitPullRequestArrow, tone: 'primary' },
              { label: 'Move forward', value: data.counts.MOVE_FORWARD, icon: CheckCircle2, tone: 'success' },
              { label: 'Closed out', value: data.counts.NOT_MOVING_FORWARD + data.counts.HIRED, icon: XCircle, tone: 'default' },
            ]}
          />
        ) : null}

        <Panel title="Filters" icon={Search}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={inputClass}
              placeholder="Search by candidate name"
              aria-label="Search candidates"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | PipelineStatus)} className={inputClass}>
              <option value="ALL">All stages</option>
              <option value="READY_TO_INTERVIEW">Ready to interview</option>
              <option value="INTERVIEWED">Interviewed</option>
              <option value="FOLLOW_UP">Follow-up</option>
              <option value="HOLD">Hold</option>
              <option value="MOVE_FORWARD">Move forward</option>
              <option value="HIRED">Hired</option>
              <option value="NOT_MOVING_FORWARD">Not moving forward</option>
            </select>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'rank' | 'score' | 'recent' | 'name')} className={inputClass}>
              <option value="rank">Sort by rank</option>
              <option value="score">Sort by score</option>
              <option value="recent">Sort by recent interview</option>
              <option value="name">Sort by name</option>
            </select>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Viewing {filteredCandidates.length} candidate{filteredCandidates.length === 1 ? '' : 's'} · stage filter {humanize(statusFilter)}</p>
        </Panel>

        {loading && !data ? <LoadingState label="Loading real candidate pipeline…" /> : null}

        {!loading && data && filteredCandidates.length === 0 ? (
          <EmptyState
            icon={Users}
            title={data.candidates.length === 0 ? 'No candidates in the live pipeline' : 'No candidates match these filters'}
            hint={data.candidates.length === 0 ? 'The candidates table exists, but it has no rows yet.' : 'Try a different name, sort, or pipeline stage.'}
          />
        ) : null}

        {!loading && data && filteredCandidates.length > 0 ? (
          <TrackerTable candidates={filteredCandidates} savingId={savingId} onStatusChange={handleStatusChange} />
        ) : null}

        {setupMigrations ? (
          <Panel title="Schema setup required" icon={Search}>
            <p className="text-sm text-muted-foreground">The live database is missing the hiring pipeline tables or columns this tracker needs.</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {setupMigrations.map((migration) => <li key={migration}>• {migration}</li>)}
            </ul>
          </Panel>
        ) : null}
      </div>
    </AppLayout>
  );
}
