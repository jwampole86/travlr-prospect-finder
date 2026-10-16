import { ChevronDown, ChevronUp, Loader2, MapPin } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { Portfolio } from '@/contexts/PortfolioContext';
import type { WorkspaceMember } from '../types';
import { GRANULAR_ROLE_CONFIG, memberCanBeAssigned } from '../utils';
import WorkspaceAvatar from './WorkspaceAvatar';

export default function WorkspacePortfoliosPanel({
  portfolios,
  members,
  leadCountByState,
  expandedPortfolio,
  onToggleExpanded,
  onToggleAssignment,
  busyAssignments,
}: {
  portfolios: Portfolio[];
  members: WorkspaceMember[];
  leadCountByState: Record<string, number>;
  expandedPortfolio: string | null;
  onToggleExpanded: (key: string) => void;
  onToggleAssignment: (member: WorkspaceMember, portfolioKey: string) => void;
  busyAssignments: Set<string>;
}) {
  if (portfolios.length === 0) {
    return <EmptyState icon={MapPin} title="No configured portfolios" hint="PortfolioContext did not return any active portfolio records." />;
  }

  const assignableMembers = members.filter((member) => memberCanBeAssigned(member));
  const owners = members.filter((member) => member.hasGlobalAccess && member.status !== 'inactive');

  return (
    <div className="space-y-3">
      {portfolios.map((portfolio) => {
        const explicitMembers = assignableMembers.filter((member) => member.assignedPortfolios.includes(portfolio.key));
        const expanded = expandedPortfolio === portfolio.key;
        return (
          <Panel key={portfolio.key} padded={false} className="overflow-hidden">
            <button type="button" onClick={() => onToggleExpanded(portfolio.key)} className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-muted/30">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 font-semibold text-primary">
                  {portfolio.stateCode}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{portfolio.label}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{leadCountByState[portfolio.stateCode] ?? 0} leads</span>
                    <span>•</span>
                    <span>{explicitMembers.length} explicit assignees</span>
                    {owners.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{owners.length} global admins</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {explicitMembers.slice(0, 3).map((member) => (
                  <WorkspaceAvatar key={member.memberId} name={member.fullName} size="sm" />
                ))}
                {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
              </div>
            </button>

            {expanded && (
              <div className="border-t border-border px-4 py-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StatusPill tone="primary">Click a member to save access instantly</StatusPill>
                  {owners.length > 0 && <StatusPill tone="warning">Owners already have global access</StatusPill>}
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {members.map((member) => {
                    const checked = member.hasGlobalAccess || member.assignedPortfolios.includes(portfolio.key);
                    const disabled = member.hasGlobalAccess || member.status === 'inactive';
                    const busy = busyAssignments.has(`${member.memberId}:${portfolio.key}`);
                    const roleConfig = GRANULAR_ROLE_CONFIG[member.granularRole];
                    const RoleIcon = roleConfig.icon;
                    return (
                      <button
                        key={`${member.source}:${member.memberId}`}
                        type="button"
                        disabled={disabled || busy}
                        onClick={() => onToggleAssignment(member, portfolio.key)}
                        className={`rounded-2xl border p-3 text-left transition-colors ${checked ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'} ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
                        aria-label={`${checked ? 'Remove' : 'Grant'} ${portfolio.label} access for ${member.fullName}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <WorkspaceAvatar name={member.fullName} size="sm" tone={member.hasGlobalAccess ? 'warning' : 'primary'} />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-foreground">{member.fullName}</div>
                              <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                              <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <RoleIcon size={12} /> {roleConfig.label}
                              </div>
                            </div>
                          </div>
                          {busy ? <Loader2 size={14} className="animate-spin text-primary" /> : checked ? <StatusPill tone={member.hasGlobalAccess ? 'warning' : 'primary'}>{member.hasGlobalAccess ? 'Global' : 'Assigned'}</StatusPill> : <StatusPill>Not assigned</StatusPill>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
