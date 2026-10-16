import type { AgentLeaderboardRow, LeaderboardMetric } from './types';

export const METRIC_LABELS: Record<LeaderboardMetric, string> = {
  assignedLeads: 'Assigned leads',
  replyRate: 'Reply rate',
  callsLogged: 'Calls logged',
  dealsClosed: 'Deals closed',
};

export function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

export function formatDays(value: number | null) {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}d`;
}

export function formatMetricValue(agent: AgentLeaderboardRow, metric: LeaderboardMetric) {
  if (metric === 'replyRate') return formatPercent(agent.replyRate);
  return Intl.NumberFormat('en-US').format(agent[metric]);
}

export function pickDefaultMetric(rows: AgentLeaderboardRow[]): LeaderboardMetric {
  if (rows.some((row) => row.dealsClosed > 0)) return 'dealsClosed';
  if (rows.some((row) => (row.replyRate ?? 0) > 0)) return 'replyRate';
  if (rows.some((row) => row.callsLogged > 0)) return 'callsLogged';
  return 'assignedLeads';
}

export function sortAgents(rows: AgentLeaderboardRow[], metric: LeaderboardMetric) {
  return [...rows].sort((left, right) => {
    const leftValue = metric === 'replyRate' ? left.replyRate ?? -1 : left[metric];
    const rightValue = metric === 'replyRate' ? right.replyRate ?? -1 : right[metric];
    if (rightValue !== leftValue) return rightValue - leftValue;
    if (right.dealsClosed !== left.dealsClosed) return right.dealsClosed - left.dealsClosed;
    if ((right.replyRate ?? -1) !== (left.replyRate ?? -1)) return (right.replyRate ?? -1) - (left.replyRate ?? -1);
    if (right.callsLogged !== left.callsLogged) return right.callsLogged - left.callsLogged;
    return right.assignedLeads - left.assignedLeads;
  });
}

export function metricBarWidth(value: number, maxValue: number) {
  if (maxValue <= 0) return 0;
  return Math.max(6, Math.round((value / maxValue) * 100));
}
