export type QueueFilter = 'all' | 'high' | 'unassigned';

export interface QueueLead {
  id: string;
  contactName: string;
  address: string;
  city: string;
  state: string;
  phone?: string | null;
  priorityTier: number;
  isHighPriority: boolean;
  prospectScore?: number | null;
  estimatedNetMonthly?: number | null;
  luxury?: boolean | null;
  regulationStatus?: string | null;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  createdAt: string;
  stage: string;
  enrichmentStatus?: string | null;
}

export interface AgentSummary {
  profileId: string;
  userId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  avatarInitials: string;
  lastActiveAt?: string | null;
  assignedLeadCount: number;
  portfolioKeys: string[];
}

export interface QueueStats {
  total: number;
  unassigned: number;
  highPriority: number;
  assignableAgents: number;
  oldestLeadCreatedAt: string | null;
}
