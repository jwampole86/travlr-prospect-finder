'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Building2, CheckCircle2, Clock3, MapPin, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { ErrorBanner, LoadingState, PageHeader, SegmentedTabs, StatGrid } from '@/components/ops';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import WorkspaceActivityPanel from './components/WorkspaceActivityPanel';
import WorkspaceInviteModal from './components/WorkspaceInviteModal';
import WorkspaceMembersPanel from './components/WorkspaceMembersPanel';
import WorkspacePortfoliosPanel from './components/WorkspacePortfoliosPanel';
import type { GranularRole, InviteFormState, WorkspaceMember, WorkspaceSnapshot, WorkspaceStatus, WorkspaceTab } from './types';

const EMPTY_INVITE_FORM: InviteFormState = {
  fullName: '',
  email: '',
  role: 'agent',
  assignedPortfolios: [],
};

export default function WorkspaceManagementPage() {
  const { role, loading: authLoading } = useAuth();
  const { configuredPortfolios, portfoliosLoading } = usePortfolio();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('members');
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteFormState>(EMPTY_INVITE_FORM);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<GranularRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<WorkspaceStatus | 'all'>('all');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<GranularRole | null>(null);
  const [expandedPortfolio, setExpandedPortfolio] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState('all');
  const [busyMemberIds, setBusyMemberIds] = useState<Set<string>>(new Set());
  const [busyAssignments, setBusyAssignments] = useState<Set<string>>(new Set());

  const canManageWorkspace = role === 'admin' || role === 'owner';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/workspace-management', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load workspace management data.');
      }
      setSnapshot(payload as WorkspaceSnapshot);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load workspace management data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !canManageWorkspace) return;
    loadData();
  }, [authLoading, canManageWorkspace, loadData]);

  const members = snapshot?.members ?? [];
  const activity = snapshot?.activity ?? [];
  const leadCountByState = snapshot?.leadCountByState ?? {};

  const stats = useMemo(() => {
    const activeMembers = members.filter((member) => member.status === 'active').length;
    const pendingInvites = members.filter((member) => member.status === 'pending' || member.status === 'expired').length;
    const explicitAssignments = members.reduce((sum, member) => sum + member.assignedPortfolios.length, 0);
    return [
      { label: 'Workspace members', value: members.length, hint: 'Active + invited teammates', icon: Users, tone: 'primary' as const },
      { label: 'Active members', value: activeMembers, hint: 'Accounts currently enabled', icon: CheckCircle2, tone: 'success' as const },
      { label: 'Pending invites', value: pendingInvites, hint: 'Invited or expired', icon: Clock3, tone: 'warning' as const },
      { label: 'Configured portfolios', value: configuredPortfolios.length, hint: `${explicitAssignments} explicit assignments`, icon: MapPin, tone: 'default' as const },
    ];
  }, [configuredPortfolios.length, members]);

  const runWorkspaceMutation = useCallback(async (body: Record<string, unknown>, successMessage: string, setBusy?: (busy: boolean) => void) => {
    setBusy?.(true);
    try {
      const response = await fetch('/api/workspace-management', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save workspace changes.');
      }
      toast.success(successMessage);
      await loadData();
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Unable to save workspace changes.');
    } finally {
      setBusy?.(false);
    }
  }, [loadData]);

  const withBusyMember = useCallback(async (memberId: string, task: () => Promise<void>) => {
    setBusyMemberIds((previous) => new Set(previous).add(memberId));
    try {
      await task();
    } finally {
      setBusyMemberIds((previous) => {
        const next = new Set(previous);
        next.delete(memberId);
        return next;
      });
    }
  }, []);

  const handleSaveRole = useCallback(async (member: WorkspaceMember) => {
    if (!editingRole) return;
    await withBusyMember(member.memberId, async () => {
      await runWorkspaceMutation({
        action: 'updateRole',
        source: member.source,
        memberId: member.memberId,
        granularRole: editingRole,
      }, 'Workspace role updated');
      setEditingMemberId(null);
      setEditingRole(null);
    });
  }, [editingRole, runWorkspaceMutation, withBusyMember]);

  const handleToggleActive = useCallback(async (member: WorkspaceMember, active: boolean) => {
    await withBusyMember(member.memberId, () => runWorkspaceMutation({
      action: 'setActive',
      source: member.source,
      memberId: member.memberId,
      active,
    }, active ? 'Member reactivated' : 'Member deactivated'));
  }, [runWorkspaceMutation, withBusyMember]);

  const handleToggleAssignment = useCallback(async (member: WorkspaceMember, portfolioKey: string) => {
    const busyKey = `${member.memberId}:${portfolioKey}`;
    setBusyAssignments((previous) => new Set(previous).add(busyKey));
    const assignedPortfolios = member.assignedPortfolios.includes(portfolioKey)
      ? member.assignedPortfolios.filter((key) => key !== portfolioKey)
      : [...member.assignedPortfolios, portfolioKey].sort();

    try {
      const response = await fetch('/api/workspace-management', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setAssignments',
          source: member.source,
          memberId: member.memberId,
          assignedPortfolios,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save portfolio access.');
      }
      toast.success(`${member.fullName} ${assignedPortfolios.includes(portfolioKey) ? 'granted' : 'removed from'} ${portfolioKey.toUpperCase()} access`);
      await loadData();
    } catch (assignmentError) {
      toast.error(assignmentError instanceof Error ? assignmentError.message : 'Unable to save portfolio access.');
    } finally {
      setBusyAssignments((previous) => {
        const next = new Set(previous);
        next.delete(busyKey);
        return next;
      });
    }
  }, [loadData]);

  const handleResendInvite = useCallback(async (member: WorkspaceMember) => {
    if (!member.inviteId) return;
    try {
      await withBusyMember(member.memberId, async () => {
        const response = await fetch('/api/agent-invite/resend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteId: member.inviteId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to resend invite.');
        }
        toast.success(`Invite resent to ${member.email}`);
        await loadData();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resend invite.');
    }
  }, [loadData, withBusyMember]);

  const handleRevokeInvite = useCallback(async (member: WorkspaceMember) => {
    if (!member.inviteId) return;
    try {
      await withBusyMember(member.memberId, async () => {
        const response = await fetch('/api/agent-invite/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteId: member.inviteId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to revoke invite.');
        }
        toast.success(`Invite revoked for ${member.email}`);
        await loadData();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke invite.');
    }
  }, [loadData, withBusyMember]);

  const handleInvite = useCallback(async () => {
    if (!inviteForm.fullName.trim() || !inviteForm.email.trim()) {
      toast.error('Name and email are required.');
      return;
    }
    setInviteSubmitting(true);
    try {
      const response = await fetch('/api/agent-invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to send invite.');
      }
      toast.success(`Invite sent to ${inviteForm.email}`);
      setShowInviteModal(false);
      setInviteForm(EMPTY_INVITE_FORM);
      await loadData();
    } catch (inviteError) {
      toast.error(inviteError instanceof Error ? inviteError.message : 'Failed to send invite.');
    } finally {
      setInviteSubmitting(false);
    }
  }, [inviteForm, loadData]);

  const toggleInvitePortfolio = useCallback((portfolioKey: string) => {
    setInviteForm((current) => ({
      ...current,
      assignedPortfolios: current.assignedPortfolios.includes(portfolioKey)
        ? current.assignedPortfolios.filter((key) => key !== portfolioKey)
        : [...current.assignedPortfolios, portfolioKey].sort(),
    }));
  }, []);

  if (authLoading || portfoliosLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-7xl p-6">
          <LoadingState label="Loading workspace management…" />
        </div>
      </AppLayout>
    );
  }

  if (!canManageWorkspace) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-4xl p-6">
          <PageHeader icon={Shield} title="Workspace Management" description="This page is restricted to workspace administrators." />
          <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            You must be signed in with an admin-level account to manage invites, roles, and portfolio access.
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader
          icon={Building2}
          title="Workspace Management"
          description="Modernized member administration backed by real user, invite, activity, and portfolio data."
        />

        {error && <ErrorBanner message={error} onRetry={loadData} />}

        {loading ? (
          <LoadingState label="Loading workspace data…" />
        ) : (
          <>
            <StatGrid stats={stats} columns={4} />

            <SegmentedTabs
              tabs={[
                { key: 'members', label: 'Members', icon: Users },
                { key: 'portfolios', label: 'Portfolios', icon: MapPin },
                { key: 'activity', label: 'Activity', icon: Activity },
              ]}
              value={activeTab}
              onChange={setActiveTab}
            />

            {activeTab === 'members' && (
              <WorkspaceMembersPanel
                members={members}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                roleFilter={roleFilter}
                onRoleFilterChange={setRoleFilter}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                editingMemberId={editingMemberId}
                editingRole={editingRole}
                onStartEdit={(member) => {
                  setEditingMemberId(member.memberId);
                  setEditingRole(member.granularRole);
                }}
                onCancelEdit={() => {
                  setEditingMemberId(null);
                  setEditingRole(null);
                }}
                onEditingRoleChange={setEditingRole}
                onSaveRole={handleSaveRole}
                onToggleActive={handleToggleActive}
                onResendInvite={handleResendInvite}
                onRevokeInvite={handleRevokeInvite}
                onOpenInvite={() => setShowInviteModal(true)}
                busyMemberIds={busyMemberIds}
              />
            )}

            {activeTab === 'portfolios' && (
              <WorkspacePortfoliosPanel
                portfolios={configuredPortfolios}
                members={members}
                leadCountByState={leadCountByState}
                expandedPortfolio={expandedPortfolio}
                onToggleExpanded={(key) => setExpandedPortfolio((current) => current === key ? null : key)}
                onToggleAssignment={handleToggleAssignment}
                busyAssignments={busyAssignments}
              />
            )}

            {activeTab === 'activity' && (
              <WorkspaceActivityPanel activity={activity} filter={activityFilter} onFilterChange={setActivityFilter} />
            )}
          </>
        )}
      </div>

      {showInviteModal && (
        <WorkspaceInviteModal
          form={inviteForm}
          onChange={(patch) => setInviteForm((current) => ({ ...current, ...patch, assignedPortfolios: patch.role === 'owner' ? [] : patch.assignedPortfolios ?? current.assignedPortfolios }))}
          onTogglePortfolio={toggleInvitePortfolio}
          onClose={() => {
            if (!inviteSubmitting) {
              setShowInviteModal(false);
              setInviteForm(EMPTY_INVITE_FORM);
            }
          }}
          onSubmit={handleInvite}
          portfolios={configuredPortfolios}
          submitting={inviteSubmitting}
        />
      )}
    </AppLayout>
  );
}
