'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, ClipboardCheck, MessageSquare, RefreshCw, Search, Sparkles, Users } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  inputClass,
  buttonSecondary,
} from '@/components/ops';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import AgentSummaryTable from './components/AgentSummaryTable';
import CoachingNotesPanel from './components/CoachingNotesPanel';
import CoachingQueuePanel from './components/CoachingQueuePanel';
import ScoreBreakdownPanel from './components/ScoreBreakdownPanel';
import { buildScoreAverages, loadAgentCoachingData, type AgentCoachingData, type CoachingSession, type DateRange } from './data';

export default function AgentCoachingPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: authLoading } = useAuth();
  const [range, setRange] = useState<DateRange>('90d');
  const [search, setSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [data, setData] = useState<AgentCoachingData | null>(null);
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
      const next = await loadAgentCoachingData(supabase, range);
      setData(next);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load coaching data');
    } finally {
      setLoading(false);
    }
  }, [range, supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const agentOptions = data?.agentRows ?? [];
  const term = search.trim().toLowerCase();

  const filteredAgentRows = useMemo(() => {
    return (data?.agentRows ?? []).filter((row) => {
      const agentMatches = selectedAgent === 'all' || row.agentId === selectedAgent;
      const searchMatches = !term || row.agentName.toLowerCase().includes(term);
      return agentMatches && searchMatches;
    });
  }, [data, selectedAgent, term]);

  const filteredQueue = useMemo(() => {
    return (data?.queue ?? []).filter((item) => {
      const agentMatches = selectedAgent === 'all' || (item.agentId ?? item.agentName) === selectedAgent;
      const searchMatches = !term || item.agentName.toLowerCase().includes(term);
      return agentMatches && searchMatches;
    });
  }, [data, selectedAgent, term]);

  const filteredNotes = useMemo(() => {
    return (data?.notes ?? []).filter((note) => {
      const agentMatches = selectedAgent === 'all' || (note.agentId ?? note.agentName) === selectedAgent;
      const searchMatches = !term || note.agentName.toLowerCase().includes(term) || note.note.toLowerCase().includes(term);
      return agentMatches && searchMatches;
    });
  }, [data, selectedAgent, term]);

  const selectedScoredSessions = useMemo(() => {
    return (data?.scoredSessions ?? []).filter((session: CoachingSession) => {
      const agentKey = session.agentId ?? session.agentName;
      const agentMatches = selectedAgent === 'all' || agentKey === selectedAgent;
      const searchMatches = !term || session.agentName.toLowerCase().includes(term);
      return agentMatches && searchMatches;
    });
  }, [data, selectedAgent, term]);

  const scoreBreakdown = useMemo(() => buildScoreAverages(selectedScoredSessions), [selectedScoredSessions]);

  if (authLoading || loading) {
    return (
      <AppLayout>
        <LoadingState label="Loading coaching insights…" />
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="p-6">
          <EmptyState icon={Award} title="Sign in to review agent coaching" hint="This page reads live call session and call_quality_scores records for the current operator." />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <PageHeader
          icon={Award}
          title="Agent Coaching & Call Quality"
          description="Manual QA flags from call_sessions plus any real call_quality_scores rows. No synthetic score generation."
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
            { label: 'Agents active', value: data?.agentRows.length ?? 0, hint: 'With sessions in range', icon: Users, tone: 'primary' },
            { label: 'Call sessions', value: data?.sessionCount ?? 0, hint: 'From call_sessions', icon: ClipboardCheck, tone: 'default' },
            { label: 'Reviewed sessions', value: data?.reviewedCount ?? 0, hint: `${data?.flaggedCount ?? 0} still need attention`, icon: MessageSquare, tone: 'warning' },
            { label: 'Scored calls', value: data?.scoredCount ?? 0, hint: 'From call_quality_scores', icon: Sparkles, tone: 'success' },
          ]}
        />

        <Panel title="Filters" padded={false}>
          <div className="grid gap-3 p-4 lg:grid-cols-[1fr,240px]">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${inputClass} pl-10`}
                placeholder="Search agents or note text"
              />
            </div>
            <select
              value={selectedAgent}
              onChange={(event) => setSelectedAgent(event.target.value)}
              className={inputClass}
            >
              <option value="all">All agents</option>
              {agentOptions.map((row) => (
                <option key={row.agentId} value={row.agentId}>{row.agentName}</option>
              ))}
            </select>
          </div>
        </Panel>

        <div className="grid gap-6 xl:grid-cols-2">
          <AgentSummaryTable rows={filteredAgentRows} />
          <CoachingQueuePanel items={filteredQueue} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <ScoreBreakdownPanel
            points={scoreBreakdown}
            title={selectedAgent === 'all' ? 'Team score breakdown' : 'Selected agent score breakdown'}
          />
          <CoachingNotesPanel notes={filteredNotes} />
        </div>
      </div>
    </AppLayout>
  );
}
