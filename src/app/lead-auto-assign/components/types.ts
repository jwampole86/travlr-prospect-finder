export interface AssignmentRuleRecord {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  min_ai_score: number;
  max_ai_score: number;
  regions: string[];
  expertise_tags: string[];
  lead_stages: string[];
  portfolios: string[];
  score_threshold: number;
  availability_start: string | null;
  availability_end: string | null;
  availability_days: string[];
  auto_assign_enabled: boolean;
  target_agent_id: string | null;
  target_agent_name: string;
  max_workload: number;
  total_assigned: number;
  last_run_at: string | null;
}

export interface AgentOption {
  profileId: string;
  userId: string;
  fullName: string;
  email?: string | null;
  status: string;
  assignedLeadCount: number;
  portfolioKeys: string[];
}

export interface AssignmentLogRecord {
  id: string;
  lead_id: string;
  lead_address: string | null;
  assigned_to_agent_id: string | null;
  assigned_to_agent_name: string | null;
  rule_id: string | null;
  rule_name: string | null;
  ai_score: number | null;
  region: string | null;
  reason: string | null;
  assigned_at: string;
  stage: string | null;
  score: number | null;
  portfolio: string | null;
  execution_id?: string | null;
}

export interface AssignmentPreviewRecord {
  leadId: string;
  leadAddress: string;
  leadName?: string;
  agentName: string;
  agentId: string;
  ruleName: string;
  ruleId: string;
  aiScore: number;
  region: string;
  stage: string;
  reason: string;
}
