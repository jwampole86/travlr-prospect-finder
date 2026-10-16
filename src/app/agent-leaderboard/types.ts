export type LeaderboardMetric = 'assignedLeads' | 'replyRate' | 'callsLogged' | 'dealsClosed';

export interface TemplatePerformance {
  id: string | null;
  name: string;
  count: number;
  replies: number;
}

export interface AgentLeaderboardRow {
  id: string;
  name: string;
  email: string;
  appRole: string;
  assignedLeads: number;
  outreachSent: number;
  outreachReplies: number;
  replyRate: number | null;
  callsLogged: number;
  dealsClosed: number;
  avgCloseDays: number | null;
  topTemplates: TemplatePerformance[];
}

export interface LeaderboardCoverage {
  totalAgents: number;
  totalAssignedLeads: number;
  totalOutreachRecords: number;
  attributedOutreachRecords: number;
  totalCalls: number;
  totalDeals: number;
  attributedOutreachPct: number;
}

export interface AgentLeaderboardSnapshot {
  agents: AgentLeaderboardRow[];
  coverage: LeaderboardCoverage;
}
