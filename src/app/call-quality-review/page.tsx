'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Filter, Mic, RefreshCw, Search, Sparkles } from 'lucide-react';
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
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import ReviewQueueCard from './components/ReviewQueueCard';
import ScoreTrendPanel from './components/ScoreTrendPanel';
import { formatOutcomeLabel, loadReviewData, saveReview, type DateRange, type QaFlag, type ReviewData, type ReviewFilter, type ReviewSession } from './data';

const PAGE_SIZE = 8;

type ActiveTab = 'queue' | 'trends';

export default function CallQualityReviewPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: authLoading } = useAuth();
  const [range, setRange] = useState<DateRange>('90d');
  const [activeTab, setActiveTab] = useState<ActiveTab>('queue');
  const [search, setSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [selectedOutcome, setSelectedOutcome] = useState('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await loadReviewData(supabase, range);
      setData(next);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load call quality review data');
    } finally {
      setLoading(false);
    }
  }, [range, supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedAgent, selectedOutcome, reviewFilter, range]);

  const agentOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const session of data?.sessions ?? []) {
      unique.set(session.agentId ?? session.agentName, session.agentName);
    }
    return Array.from(unique.entries()).map(([value, label]) => ({ value, label }));
  }, [data]);

  const outcomeOptions = useMemo(() => {
    return Array.from(new Set((data?.sessions ?? []).map((session) => session.outcome).filter(Boolean) as string[]));
  }, [data]);

  const filteredSessions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.sessions ?? []).filter((session) => {
      const agentKey = session.agentId ?? session.agentName;
      const agentMatches = selectedAgent === 'all' || agentKey === selectedAgent;
      const outcomeMatches = selectedOutcome === 'all' || session.outcome === selectedOutcome;
      const reviewMatches = (() => {
        if (reviewFilter === 'all') return true;
        if (reviewFilter === 'unreviewed') return !session.qaFlag && !session.coachingNotes && !session.reviewedAt;
        if (reviewFilter === 'reviewed') return !!session.qaFlag || !!session.coachingNotes || !!session.reviewedAt;
        if (reviewFilter === 'needs_coaching') return session.qaFlag === 'needs_coaching';
        if (reviewFilter === 'escalated') return session.qaFlag === 'escalate_for_review';
        if (reviewFilter === 'scored') return session.overallScore !== null;
        return true;
      })();
      const searchMatches = !term
        || session.agentName.toLowerCase().includes(term)
        || (session.coachingNotes ?? '').toLowerCase().includes(term)
        || session.transcriptPreview.some((line) => line.toLowerCase().includes(term));
      return agentMatches && outcomeMatches && reviewMatches && searchMatches;
    });
  }, [data, reviewFilter, search, selectedAgent, selectedOutcome]);

  const pagedSessions = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredSessions.slice(start, start + PAGE_SIZE);
  }, [filteredSessions, page]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));

  const handleSave = useCallback(async (session: ReviewSession, values: { qaFlag: QaFlag; coachingNotes: string }) => {
    await saveReview(supabase, session, values, user?.email ?? 'reviewer');
    await load();
  }, [load, supabase, user?.email]);

  if (authLoading || loading) {
    return (
      <AppLayout>
        <LoadingState label="Loading call quality review…" />
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="p-6">
          <EmptyState icon={Mic} title="Sign in to review calls" hint="This page reads live call_sessions rows and any linked call_quality_scores records." />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <PageHeader
          icon={Mic}
          title="Call Quality Review"
          description="Review real call sessions, save QA flags to call_sessions, and surface any stored score rows without generating new AI scores."
          actions={
            <>
              <SegmentedTabs
                tabs={[
                  { key: '30d', label: '30 days' },
                  { key: '90d', label: '90 days' },
                ]}
                value={range}
                onChange={(value) => setRange(value)}
              />
              <button type="button" className={buttonSecondary} onClick={load}>
                <RefreshCw size={14} /> Refresh
              </button>
            </>
          }
        />

        {error && <ErrorBanner message={error} onRetry={load} />}

        <StatGrid
          columns={4}
          stats={[
            { label: 'Sessions in range', value: data?.sessions.length ?? 0, hint: 'From call_sessions', icon: ClipboardCheck, tone: 'primary' },
            { label: 'Reviewed', value: data?.reviewedCount ?? 0, hint: 'Saved QA flags or notes', icon: Filter, tone: 'success' },
            { label: 'Scored rows', value: data?.scoreCount ?? 0, hint: 'From call_quality_scores', icon: Sparkles, tone: 'warning' },
            { label: 'Escalated', value: data?.escalatedCount ?? 0, hint: `${data?.flaggedCount ?? 0} flagged total`, icon: AlertTriangle, tone: 'danger' },
          ]}
        />

        <SegmentedTabs
          tabs={[
            { key: 'queue', label: 'Review queue' },
            { key: 'trends', label: 'Trends' },
          ]}
          value={activeTab}
          onChange={(value) => setActiveTab(value)}
        />

        <Panel title="Filters" padded={false}>
          <div className="grid gap-3 p-4 xl:grid-cols-[1.4fr,220px,220px,220px]">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${inputClass} pl-10`}
                placeholder="Search agent, transcript preview, or coaching note"
              />
            </div>
            <select value={selectedAgent} onChange={(event) => setSelectedAgent(event.target.value)} className={inputClass}>
              <option value="all">All agents</option>
              {agentOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select value={selectedOutcome} onChange={(event) => setSelectedOutcome(event.target.value)} className={inputClass}>
              <option value="all">All outcomes</option>
              {outcomeOptions.map((outcome) => (
                <option key={outcome} value={outcome}>{formatOutcomeLabel(outcome)}</option>
              ))}
            </select>
            <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)} className={inputClass}>
              <option value="all">All review states</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="reviewed">Reviewed</option>
              <option value="needs_coaching">Needs coaching</option>
              <option value="escalated">Escalated</option>
              <option value="scored">Scored only</option>
            </select>
          </div>
        </Panel>

        {activeTab === 'queue' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{filteredSessions.length} matching sessions</span>
              <span>Page {page} of {totalPages}</span>
            </div>
            {pagedSessions.length === 0 ? (
              <EmptyState icon={Mic} title="No sessions match these filters" hint="Try widening the date range or clearing a review filter." />
            ) : (
              <div className="space-y-4">
                {pagedSessions.map((session) => (
                  <ReviewQueueCard key={session.sessionId} session={session} onSave={handleSave} />
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonSecondary} disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
              <button type="button" className={buttonSecondary} disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</button>
            </div>
          </div>
        ) : (
          <ScoreTrendPanel points={data?.trend ?? []} />
        )}
      </div>
    </AppLayout>
  );
}
