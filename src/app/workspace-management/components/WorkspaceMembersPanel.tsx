import { Edit2, Loader2, MoreHorizontal, RefreshCcw, Shield, Trash2, UserPlus } from 'lucide-react';
import { EmptyState, Panel, StatusPill, buttonSecondary, inputClass } from '@/components/ops';
import type { GranularRole, WorkspaceMember, WorkspaceStatus } from '../types';
import {
  accessLabel,
  filterMembers,
  formatDateTime,
  formatRelativeTime,
  GRANULAR_ROLE_CONFIG,
  getMemberTone,
  getStatusLabel,
  getStatusTone,
  memberActionLabel,
  permissionSummary,
} from '../utils';
import WorkspaceAvatar from './WorkspaceAvatar';

export default function WorkspaceMembersPanel({
  members,
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
  editingMemberId,
  editingRole,
  onStartEdit,
  onCancelEdit,
  onEditingRoleChange,
  onSaveRole,
  onToggleActive,
  onResendInvite,
  onRevokeInvite,
  onOpenInvite,
  busyMemberIds,
}: {
  members: WorkspaceMember[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  roleFilter: GranularRole | 'all';
  onRoleFilterChange: (value: GranularRole | 'all') => void;
  statusFilter: WorkspaceStatus | 'all';
  onStatusFilterChange: (value: WorkspaceStatus | 'all') => void;
  editingMemberId: string | null;
  editingRole: GranularRole | null;
  onStartEdit: (member: WorkspaceMember) => void;
  onCancelEdit: () => void;
  onEditingRoleChange: (value: GranularRole) => void;
  onSaveRole: (member: WorkspaceMember) => void;
  onToggleActive: (member: WorkspaceMember, active: boolean) => void;
  onResendInvite: (member: WorkspaceMember) => void;
  onRevokeInvite: (member: WorkspaceMember) => void;
  onOpenInvite: () => void;
  busyMemberIds: Set<string>;
}) {
  const filteredMembers = filterMembers(members, searchQuery, roleFilter, statusFilter);

  return (
    <Panel
      title="Members"
      icon={Shield}
      actions={
        <button type="button" onClick={onOpenInvite} className={buttonSecondary}>
          <UserPlus size={14} /> Invite member
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className={inputClass}
            placeholder="Search by name or email"
          />
          <select value={roleFilter} onChange={(event) => onRoleFilterChange(event.target.value as GranularRole | 'all')} className={inputClass}>
            <option value="all">All roles</option>
            {(Object.keys(GRANULAR_ROLE_CONFIG) as GranularRole[]).map((role) => (
              <option key={role} value={role}>{GRANULAR_ROLE_CONFIG[role].label}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as WorkspaceStatus | 'all')} className={inputClass}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {filteredMembers.length === 0 ? (
          <EmptyState icon={MoreHorizontal} title="No matching members" hint="Try a different role, status, or search term." action={<button type="button" onClick={onOpenInvite} className={buttonSecondary}><UserPlus size={14} /> Invite someone</button>} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="hidden grid-cols-[minmax(0,2fr)_180px_180px_170px_200px] gap-3 border-b border-border bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
              <div>Member</div>
              <div>Role</div>
              <div>Access</div>
              <div>Last active</div>
              <div className="text-right">Actions</div>
            </div>
            <div className="divide-y divide-border">
              {filteredMembers.map((member) => {
                const roleConfig = GRANULAR_ROLE_CONFIG[member.granularRole];
                const RoleIcon = roleConfig.icon;
                const busy = busyMemberIds.has(member.memberId);
                const editing = editingMemberId === member.memberId;
                const permissions = permissionSummary(member);
                return (
                  <div key={`${member.source}:${member.memberId}`} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,2fr)_180px_180px_170px_200px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <WorkspaceAvatar name={member.fullName} tone={member.hasGlobalAccess ? 'warning' : 'primary'} />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{member.fullName}</p>
                            <StatusPill tone={getStatusTone(member.status)}>{getStatusLabel(member.status)}</StatusPill>
                            {member.hasGlobalAccess && <StatusPill tone="warning">Global access</StatusPill>}
                          </div>
                          <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground lg:hidden">
                            <span>{accessLabel(member)}</span>
                            <span>•</span>
                            <span>Joined {formatDateTime(member.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {editing ? (
                        <select value={editingRole ?? member.granularRole} onChange={(event) => onEditingRoleChange(event.target.value as GranularRole)} className={inputClass}>
                          {(Object.keys(GRANULAR_ROLE_CONFIG) as GranularRole[]).map((role) => (
                            <option key={role} value={role}>{GRANULAR_ROLE_CONFIG[role].label}</option>
                          ))}
                        </select>
                      ) : (
                        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${roleConfig.badgeClass}`}>
                          <RoleIcon size={12} />
                          {roleConfig.label}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{roleConfig.description}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">{accessLabel(member)}</p>
                      <div className="flex flex-wrap gap-1">
                        {permissions.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No enabled workspace permissions</span>
                        ) : (
                          permissions.map((permission) => <StatusPill key={permission} tone={getMemberTone(member)}>{permission}</StatusPill>)
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 text-sm text-foreground">
                      <div>{formatRelativeTime(member.lastActiveAt)}</div>
                      <div className="text-xs text-muted-foreground">Created {formatDateTime(member.createdAt)}</div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {editing ? (
                        <>
                          <button type="button" disabled={busy} onClick={() => onSaveRole(member)} className={buttonSecondary}>
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                            Save
                          </button>
                          <button type="button" disabled={busy} onClick={onCancelEdit} className={buttonSecondary}>Cancel</button>
                        </>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => onStartEdit(member)} className={buttonSecondary}>
                          <Edit2 size={14} /> Edit
                        </button>
                      )}

                      {member.source === 'invite' ? (
                        <>
                          <button type="button" disabled={busy} onClick={() => onResendInvite(member)} className={buttonSecondary}>
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                            Resend
                          </button>
                          <button type="button" disabled={busy} onClick={() => onRevokeInvite(member)} className={buttonSecondary}>
                            <Trash2 size={14} /> Revoke
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onToggleActive(member, member.status === 'inactive')}
                          className={buttonSecondary}
                          aria-label={memberActionLabel(member)}
                        >
                          {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          {member.status === 'inactive' ? 'Reactivate' : 'Deactivate'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
