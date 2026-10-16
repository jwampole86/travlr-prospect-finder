'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Trophy, Users, Phone, Reply, Target } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { ErrorBanner, LoadingState, PageHeader, SegmentedTabs, StatGrid, buttonSecondary } from '@/components/ops';
import LeaderboardCoveragePanel from './components/LeaderboardCoveragePanel';
import LeaderboardRankingPanel from './components/LeaderboardRankingPanel';
import type { AgentLeaderboardSnapshot, LeaderboardMetric } from './types';
import { METRIC_LABELS, pickDefaultMetric } from './utils';

export default function AgentLeaderboardPage() {
  const [snapshot, setSnapshot] = useState<AgentLeaderboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<LeaderboardMetric>('assignedLeads');
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  async function loadData(showRefreshSpinner = false) {
    if (showRefreshSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetch('/api/agent-leaderboard', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load leaderboard data.');
      }
      const nextSnapshot = payload as AgentLeaderboardSnapshot;
      setSnapshot(nextSnapshot);
      setMetric((current) => (current === 'assignedLeads' && !snapshot ? pickDefaultMetric(nextSnapshot.agents) : current));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load leaderboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const agents = snapshot?.agents ?? [];
  const coverage = snapshot?.coverage;

  const stats = useMemo(() => {
    const totalReplies = agents.reduce((sum, agent) => sum + agent.outreachReplies, 0);
    const replyRatePool = agents.filter((agent) => agent.replyRate !== null).map((agent) => agent.replyRate as number);
    const averageReplyRate = replyRatePool.length > 0 ? replyRatePool.reduce((sum, value) => sum + value, 0) / replyRatePool.length : null;
    return [
      { label: 'Tracked agents', value: agents.length, hint: 'Only agents with real workload or activity', icon: Users, tone: 'primary' as const },
      { label: 'Assigned leads', value: coverage?.totalAssignedLeads ?? 0, hint: 'From leads.primary_agent_id', icon: Target, tone: 'success' as const },
      { label: 'Attributed replies', value: totalReplies, hint: 'Reply-detected outreach only', icon: Reply, tone: 'default' as const },
      { label: 'Calls logged', value: coverage?.totalCalls ?? 0, hint: 'From call_sessions.user_id', icon: Phone, tone: 'default' as const },
      { label: 'Average reply rate', value: averageReplyRate === null ? '—' : `${averageReplyRate.toFixed(1)}%`, hint: 'Agents with attributed outreach', icon: Trophy, tone: 'warning' as const },
    ];
  }, [agents, coverage?.totalAssignedLeads, coverage?.totalCalls]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader
          icon={Trophy}
          title="Agent Leaderboard"
          description="Rankings are generated from real lead ownership, outreach attribution, call records, and closed-deal rows—never fabricated metrics."
          actions={
            <button type="button" onClick={() => void loadData(true)} className={buttonSecondary}>
              {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
          }
        />

        {error && <ErrorBanner message={error} onRetry={() => void loadData()} />}

        {loading ? (
          <LoadingState label="Loading leaderboard…" />
        ) : (
          <>
            <StatGrid stats={stats} columns={5} />

            <SegmentedTabs
              tabs={([
                { key: 'assignedLeads', label: METRIC_LABELS.assignedLeads },
                { key: 'replyRate', label: METRIC_LABELS.replyRate },
                { key: 'callsLogged', label: METRIC_LABELS.callsLogged },
                { key: 'dealsClosed', label: METRIC_LABELS.dealsClosed },
              ] as { key: LeaderboardMetric; label: string }[])}
              value={metric}
              onChange={setMetric}
            />

            <LeaderboardRankingPanel
              agents={agents}
              metric={metric}
              expandedAgentId={expandedAgentId}
              onToggleExpanded={(agentId) => setExpandedAgentId((current) => current === agentId ? null : agentId)}
            />

            {coverage && <LeaderboardCoveragePanel coverage={coverage} />}
          </>
        )}
      </div>
    </AppLayout>
  );
}
