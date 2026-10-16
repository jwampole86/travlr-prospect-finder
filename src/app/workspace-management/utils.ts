import { BarChart2, Crown, Shield, Star, UserCheck } from 'lucide-react';
import type { GranularRole, WorkspaceActivityItem, WorkspaceMember, WorkspacePermissions, WorkspaceStatus } from './types';

export const GRANULAR_ROLE_CONFIG: Record<GranularRole, {
  label: string;
  description: string;
  icon: typeof Crown;
  tone: 'warning' | 'primary' | 'success' | 'default';
  badgeClass: string;
}> = {
  owner: {
    label: 'Owner',
    description: 'Global workspace access and admin controls',
    icon: Crown,
    tone: 'warning',
    badgeClass: 'border-warning/30 bg-warning/10 text-warning',
  },
  team_lead: {
    label: 'Team lead',
    description: 'Lead access, exports, analytics, and pipeline controls',
    icon: Star,
    tone: 'primary',
    badgeClass: 'border-primary/30 bg-primary/10 text-primary',
  },
  agent: {
    label: 'Agent',
    description: 'Assigned lead ownership and pipeline execution',
    icon: UserCheck,
    tone: 'success',
    badgeClass: 'border-success/30 bg-success/10 text-success',
  },
  analyst: {
    label: 'Analyst',
    description: 'Read-only analytics and export access',
    icon: BarChart2,
    tone: 'default',
    badgeClass: 'border-border bg-muted text-muted-foreground',
  },
};

export const EMPTY_PERMISSIONS: WorkspacePermissions = {
  leadAccess: false,
  export: false,
  pipeline: false,
  analytics: false,
  settings: false,
};

export function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '—';
}

export function formatRelativeTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (absMs < hour) return rtf.format(Math.round(diffMs / minute), 'minute');
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
  return rtf.format(Math.round(diffMs / day), 'day');
}

export function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function getStatusTone(status: WorkspaceStatus) {
  if (status === 'active') return 'success' as const;
  if (status === 'pending') return 'warning' as const;
  if (status === 'expired' || status === 'inactive') return 'default' as const;
  return 'default' as const;
}

export function getStatusLabel(status: WorkspaceStatus) {
  if (status === 'expired') return 'Invite expired';
  if (status === 'pending') return 'Invite pending';
  if (status === 'inactive') return 'Inactive';
  return 'Active';
}

export function sortMembers(members: WorkspaceMember[]) {
  return [...members].sort((a, b) => {
    const order = { active: 0, pending: 1, expired: 2, inactive: 3 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return a.fullName.localeCompare(b.fullName);
  });
}

export function filterMembers(members: WorkspaceMember[], query: string, roleFilter: GranularRole | 'all', statusFilter: WorkspaceStatus | 'all') {
  const normalized = query.trim().toLowerCase();
  return sortMembers(members).filter((member) => {
    if (roleFilter !== 'all' && member.granularRole !== roleFilter) return false;
    if (statusFilter !== 'all' && member.status !== statusFilter) return false;
    if (!normalized) return true;
    return member.fullName.toLowerCase().includes(normalized) || member.email.toLowerCase().includes(normalized);
  });
}

export function permissionSummary(member: WorkspaceMember) {
  if (member.hasGlobalAccess) return ['Global access'];
  return [
    member.permissions.leadAccess ? 'Leads' : null,
    member.permissions.pipeline ? 'Pipeline' : null,
    member.permissions.analytics ? 'Analytics' : null,
    member.permissions.export ? 'Export' : null,
    member.permissions.settings ? 'Settings' : null,
  ].filter(Boolean) as string[];
}

export function getActivityTypeLabel(item: WorkspaceActivityItem) {
  const mapped: Record<string, string> = {
    member_invited: 'Member invited',
    invite_completed: 'Invite completed',
    invite_expired: 'Invite expired',
    stage_changed: 'Lead stage changed',
    email_sent: 'Email sent',
    email_replied: 'Email replied',
    call_logged: 'Call logged',
    sync_imported: 'Sync imported',
  };
  return mapped[item.type] ?? item.title;
}

export function accessLabel(member: WorkspaceMember) {
  if (member.hasGlobalAccess) return 'All portfolios';
  if (member.assignedPortfolios.length === 0) return 'No explicit assignments';
  return `${member.assignedPortfolios.length} assigned`;
}

export function memberCanBeAssigned(member: WorkspaceMember) {
  return member.status !== 'inactive' && member.granularRole !== 'owner';
}

export function getMemberTone(member: WorkspaceMember) {
  if (member.status === 'inactive') return 'default';
  if (member.hasGlobalAccess) return 'warning';
  return 'primary';
}

export function memberActionLabel(member: WorkspaceMember) {
  if (member.source === 'invite') return member.status === 'expired' ? 'Resend invite' : 'Pending invite';
  return member.status === 'inactive' ? 'Reactivate member' : 'Manage member';
}

export const managementShieldIcon = Shield;
