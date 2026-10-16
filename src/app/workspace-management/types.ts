export type GranularRole = 'owner' | 'team_lead' | 'agent' | 'analyst';
export type WorkspaceStatus = 'active' | 'inactive' | 'pending' | 'expired';
export type WorkspaceMemberSource = 'user' | 'invite';
export type WorkspaceTab = 'members' | 'portfolios' | 'activity';

export interface WorkspacePermissions {
  leadAccess: boolean;
  export: boolean;
  pipeline: boolean;
  analytics: boolean;
  settings: boolean;
}

export interface WorkspaceMember {
  memberId: string;
  source: WorkspaceMemberSource;
  userId: string | null;
  inviteId: string | null;
  email: string;
  fullName: string;
  appRole: string;
  granularRole: GranularRole;
  status: WorkspaceStatus;
  createdAt: string;
  lastActiveAt: string | null;
  assignedPortfolios: string[];
  permissions: WorkspacePermissions;
  hasGlobalAccess: boolean;
}

export interface WorkspaceActivityItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  actorName: string;
  actorEmail: string | null;
  source: string;
  timestamp: string;
  stateCode: string | null;
}

export interface WorkspaceSnapshot {
  members: WorkspaceMember[];
  activity: WorkspaceActivityItem[];
  leadCountByState: Record<string, number>;
}

export interface InviteFormState {
  fullName: string;
  email: string;
  role: GranularRole;
  assignedPortfolios: string[];
}
