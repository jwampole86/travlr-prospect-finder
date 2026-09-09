'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';

import { toast } from 'sonner';
import { Building2, Users, Search, ChevronDown, ChevronUp, Crown, Star, UserCheck, BarChart2, Mail, Trash2, Edit2, Save, X, Activity, Clock, MapPin, Lock, Unlock, UserPlus, CheckCircle2, Circle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type GranularRole = 'owner' | 'team_lead' | 'agent' | 'analyst';

interface WorkspaceMember {
  id: string;
  email: string;
  full_name: string;
  app_role: string;
  granular_role: GranularRole;
  status: 'active' | 'inactive' | 'pending';
  created_at: string;
  last_active?: string;
  assigned_portfolios?: string[];
  perm_lead_access: boolean;
  perm_bulk_actions: boolean;
  perm_export: boolean;
  perm_reports: boolean;
  perm_admin: boolean;
}

interface Portfolio {
  key: string;
  label: string;
  stateCode: string;
  memberCount: number;
  leadCount: number;
}

interface ActivityEvent {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  resource: string;
  timestamp: string;
  details?: string;
}

interface InviteForm {
  email: string;
  full_name: string;
  role: GranularRole;
  portfolios: string[];
}

// ─── Role Config ──────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<GranularRole, {
  label: string;
  icon: React.ElementType;
  color: string;
  badge: string;
  description: string;
}> = {
  owner: {
    label: 'Owner',
    icon: Crown,
    color: 'text-amber-600',
    badge: 'bg-amber-500/10 text-amber-700 border border-amber-200',
    description: 'Full access including billing and integrations',
  },
  team_lead: {
    label: 'Team Lead',
    icon: Star,
    color: 'text-blue-600',
    badge: 'bg-blue-500/10 text-blue-700 border border-blue-200',
    description: 'Manages agents, bulk ops, and reports',
  },
  agent: {
    label: 'Agent',
    icon: UserCheck,
    color: 'text-emerald-600',
    badge: 'bg-emerald-500/10 text-emerald-700 border border-emerald-200',
    description: 'Works assigned leads and updates pipeline',
  },
  analyst: {
    label: 'Analyst',
    icon: BarChart2,
    color: 'text-violet-600',
    badge: 'bg-violet-500/10 text-violet-700 border border-violet-200',
    description: 'Read-only access to reports and analytics',
  },
};

const PORTFOLIOS: Portfolio[] = [
  { key: 'co', label: 'Colorado', stateCode: 'CO', memberCount: 3, leadCount: 142 },
  { key: 'ca', label: 'California', stateCode: 'CA', memberCount: 5, leadCount: 289 },
  { key: 'tx', label: 'Texas', stateCode: 'TX', memberCount: 4, leadCount: 198 },
  { key: 'fl', label: 'Florida', stateCode: 'FL', memberCount: 2, leadCount: 87 },
  { key: 'wa', label: 'Washington', stateCode: 'WA', memberCount: 2, leadCount: 64 },
  { key: 'nv', label: 'Nevada', stateCode: 'NV', memberCount: 1, leadCount: 43 },
  { key: 'md', label: 'Maryland', stateCode: 'MD', memberCount: 3, leadCount: 156 },
  { key: 'ma', label: 'Massachusetts', stateCode: 'MA', memberCount: 2, leadCount: 71 },
];

const MOCK_ACTIVITY: ActivityEvent[] = [
  { id: '1', user_id: 'u1', user_name: 'Admin User', action: 'bulk_archive', resource: '47 leads', timestamp: new Date(Date.now() - 3600000).toISOString(), details: 'Archived stale leads from CO portfolio' },
  { id: '2', user_id: 'u2', user_name: 'James Torres', action: 'lead_assign', resource: 'Lead #4821', timestamp: new Date(Date.now() - 7200000).toISOString(), details: 'Assigned to Sarah Mitchell' },
  { id: '3', user_id: 'u3', user_name: 'Sarah Mitchell', action: 'stage_change', resource: 'Lead #3901', timestamp: new Date(Date.now() - 10800000).toISOString(), details: 'New Lead → Qualified' },
  { id: '4', user_id: 'u1', user_name: 'Admin User', action: 'member_invite', resource: 'priya@travlr.com', timestamp: new Date(Date.now() - 86400000).toISOString(), details: 'Invited as Analyst' },
  { id: '5', user_id: 'u2', user_name: 'James Torres', action: 'export', resource: 'TX leads batch', timestamp: new Date(Date.now() - 172800000).toISOString(), details: 'Exported 89 leads as CSV' },
  { id: '6', user_id: 'u4', user_name: 'Priya Nair', action: 'report_view', resource: 'Conversion Analytics', timestamp: new Date(Date.now() - 259200000).toISOString() },
];

// ─── Mock Members ─────────────────────────────────────────────────────────────

const MOCK_MEMBERS: WorkspaceMember[] = [
  {
    id: 'u1', email: 'admin@travlr.com', full_name: 'Admin User', app_role: 'admin',
    granular_role: 'owner', status: 'active', created_at: new Date(Date.now() - 86400000 * 180).toISOString(),
    last_active: new Date(Date.now() - 3600000).toISOString(),
    assigned_portfolios: ['co', 'ca', 'tx', 'fl', 'wa', 'nv', 'md', 'ma'],
    perm_lead_access: true, perm_bulk_actions: true, perm_export: true, perm_reports: true, perm_admin: true,
  },
  {
    id: 'u2', email: 'james@travlr.com', full_name: 'James Torres', app_role: 'agent',
    granular_role: 'team_lead', status: 'active', created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
    last_active: new Date(Date.now() - 7200000).toISOString(),
    assigned_portfolios: ['co', 'tx'],
    perm_lead_access: true, perm_bulk_actions: true, perm_export: true, perm_reports: true, perm_admin: false,
  },
  {
    id: 'u3', email: 'sarah@travlr.com', full_name: 'Sarah Mitchell', app_role: 'agent',
    granular_role: 'agent', status: 'active', created_at: new Date(Date.now() - 86400000 * 90).toISOString(),
    last_active: new Date(Date.now() - 10800000).toISOString(),
    assigned_portfolios: ['tx'],
    perm_lead_access: true, perm_bulk_actions: false, perm_export: false, perm_reports: false, perm_admin: false,
  },
  {
    id: 'u4', email: 'priya@travlr.com', full_name: 'Priya Nair', app_role: 'agent',
    granular_role: 'analyst', status: 'active', created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
    last_active: new Date(Date.now() - 259200000).toISOString(),
    assigned_portfolios: ['co', 'ca'],
    perm_lead_access: false, perm_bulk_actions: false, perm_export: true, perm_reports: true, perm_admin: false,
  },
  {
    id: 'u5', email: 'pending@travlr.com', full_name: 'Pending Invite', app_role: 'agent',
    granular_role: 'agent', status: 'pending', created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    assigned_portfolios: ['fl'],
    perm_lead_access: true, perm_bulk_actions: false, perm_export: false, perm_reports: false, perm_admin: false,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    bulk_archive: 'Bulk Archived',
    lead_assign: 'Assigned Lead',
    stage_change: 'Changed Stage',
    member_invite: 'Invited Member',
    export: 'Exported Data',
    report_view: 'Viewed Report',
    login: 'Logged In',
    bulk_sms: 'Sent Bulk SMS',
  };
  return map[action] || action;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkspaceManagementPage() {
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<'members' | 'portfolios' | 'activity'>('members');
  const [members, setMembers] = useState<WorkspaceMember[]>(MOCK_MEMBERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<GranularRole | 'all'>('all');
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<WorkspaceMember>>({});
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: '', full_name: '', role: 'agent', portfolios: [],
  });
  const [inviting, setInviting] = useState(false);
  const [expandedPortfolio, setExpandedPortfolio] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<string>('all');

  const isAdmin = role === 'admin';

  // ── Filtered members ──────────────────────────────────────────────────────
  const filteredMembers = members.filter(m => {
    const matchesSearch = !searchQuery ||
      m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || m.granular_role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // ── Invite member ─────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!inviteForm.email || !inviteForm.full_name) {
      toast.error('Email and name are required');
      return;
    }
    setInviting(true);
    try {
      // In production: POST to /api/agent-invite/create
      await new Promise(r => setTimeout(r, 800));
      const newMember: WorkspaceMember = {
        id: `u${Date.now()}`,
        email: inviteForm.email,
        full_name: inviteForm.full_name,
        app_role: 'agent',
        granular_role: inviteForm.role,
        status: 'pending',
        created_at: new Date().toISOString(),
        assigned_portfolios: inviteForm.portfolios,
        perm_lead_access: inviteForm.role !== 'analyst',
        perm_bulk_actions: inviteForm.role === 'owner' || inviteForm.role === 'team_lead',
        perm_export: inviteForm.role !== 'agent',
        perm_reports: inviteForm.role !== 'agent',
        perm_admin: inviteForm.role === 'owner',
      };
      setMembers(prev => [...prev, newMember]);
      setShowInviteModal(false);
      setInviteForm({ email: '', full_name: '', role: 'agent', portfolios: [] });
      toast.success(`Invitation sent to ${inviteForm.email}`);
    } catch {
      toast.error('Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  // ── Save member edits ─────────────────────────────────────────────────────
  const handleSaveEdit = (memberId: string) => {
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, ...editForm } : m));
    setEditingMember(null);
    setEditForm({});
    toast.success('Member updated');
  };

  // ── Remove member ─────────────────────────────────────────────────────────
  const handleRemoveMember = (memberId: string) => {
    setMembers(prev => prev.filter(m => m.id !== memberId));
    toast.success('Member removed from workspace');
  };

  // ── Toggle portfolio permission ───────────────────────────────────────────
  const togglePortfolioForMember = (memberId: string, portfolioKey: string) => {
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const current = m.assigned_portfolios || [];
      const updated = current.includes(portfolioKey)
        ? current.filter(p => p !== portfolioKey)
        : [...current, portfolioKey];
      return { ...m, assigned_portfolios: updated };
    }));
  };

  const filteredActivity = MOCK_ACTIVITY.filter(e =>
    activityFilter === 'all' || e.action === activityFilter
  );

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 size={24} className="text-primary" />
              Workspace Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage team members, portfolio access, and role-based permissions
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <UserPlus size={16} />
              Invite Member
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Members', value: members.length, icon: Users, color: 'text-blue-500' },
            { label: 'Active', value: members.filter(m => m.status === 'active').length, icon: CheckCircle2, color: 'text-emerald-500' },
            { label: 'Pending Invites', value: members.filter(m => m.status === 'pending').length, icon: Clock, color: 'text-amber-500' },
            { label: 'Portfolios', value: PORTFOLIOS.length, icon: MapPin, color: 'text-violet-500' },
          ].map(stat => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon size={16} className={stat.color} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-muted/50 p-1 rounded-lg w-fit">
          {(['members', 'portfolios', 'activity'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'members' && <Users size={14} className="inline mr-1.5" />}
              {tab === 'portfolios' && <MapPin size={14} className="inline mr-1.5" />}
              {tab === 'activity' && <Activity size={14} className="inline mr-1.5" />}
              {tab}
            </button>
          ))}
        </div>

        {/* ── Members Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'members' && (
          <div>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value as GranularRole | 'all')}
                className="px-3 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none"
              >
                <option value="all">All Roles</option>
                {(Object.keys(ROLE_CONFIG) as GranularRole[]).map(r => (
                  <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                ))}
              </select>
            </div>

            {/* Members Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Member</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Portfolios</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Permissions</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Last Active</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                    {isAdmin && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member, idx) => {
                    const RoleIcon = ROLE_CONFIG[member.granular_role]?.icon || UserCheck;
                    const isEditing = editingMember === member.id;
                    return (
                      <tr key={member.id} className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${idx % 2 === 1 ? 'bg-muted/5' : ''}`}>
                        {/* Member */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {member.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{member.full_name}</p>
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <select
                              value={(editForm.granular_role || member.granular_role) as string}
                              onChange={e => setEditForm(f => ({ ...f, granular_role: e.target.value as GranularRole }))}
                              className="text-xs px-2 py-1 bg-card border border-border rounded focus:outline-none"
                            >
                              {(Object.keys(ROLE_CONFIG) as GranularRole[]).map(r => (
                                <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${ROLE_CONFIG[member.granular_role]?.badge}`}>
                              <RoleIcon size={10} />
                              {ROLE_CONFIG[member.granular_role]?.label}
                            </span>
                          )}
                        </td>

                        {/* Portfolios */}
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {(member.assigned_portfolios || []).slice(0, 3).map(pk => {
                              const p = PORTFOLIOS.find(x => x.key === pk);
                              return p ? (
                                <span key={pk} className="text-[10px] px-1.5 py-0.5 bg-muted rounded font-mono text-muted-foreground">
                                  {p.stateCode}
                                </span>
                              ) : null;
                            })}
                            {(member.assigned_portfolios || []).length > 3 && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                                +{(member.assigned_portfolios || []).length - 3}
                              </span>
                            )}
                            {(member.assigned_portfolios || []).length === 0 && (
                              <span className="text-[10px] text-muted-foreground">None assigned</span>
                            )}
                          </div>
                        </td>

                        {/* Permissions */}
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="flex gap-1">
                            {[
                              { key: 'perm_lead_access', label: 'Leads' },
                              { key: 'perm_bulk_actions', label: 'Bulk' },
                              { key: 'perm_export', label: 'Export' },
                              { key: 'perm_reports', label: 'Reports' },
                            ].map(perm => (
                              <span
                                key={perm.key}
                                className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${
                                  member[perm.key as keyof WorkspaceMember]
                                    ? 'bg-success/10 text-success border-success/20' :'bg-muted text-muted-foreground border-border'
                                }`}
                              >
                                {perm.label}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Last Active */}
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {member.last_active ? formatRelativeTime(member.last_active) : '—'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            member.status === 'active' ? 'bg-emerald-500/10 text-emerald-700' :
                            member.status === 'pending'? 'bg-amber-500/10 text-amber-700' : 'bg-red-500/10 text-red-700'
                          }`}>
                            {member.status === 'active' ? <CheckCircle2 size={10} /> :
                             member.status === 'pending' ? <Clock size={10} /> :
                             <Circle size={10} />}
                            {member.status}
                          </span>
                        </td>

                        {/* Actions */}
                        {isAdmin && (
                          <td className="px-4 py-3 text-right">
                            {isEditing ? (
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => handleSaveEdit(member.id)}
                                  className="p-1.5 rounded bg-success/10 text-success hover:bg-success/20 transition-colors"
                                >
                                  <Save size={12} />
                                </button>
                                <button
                                  onClick={() => { setEditingMember(null); setEditForm({}); }}
                                  className="p-1.5 rounded bg-muted hover:bg-muted/80 transition-colors"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => { setEditingMember(member.id); setEditForm({ granular_role: member.granular_role }); }}
                                  className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                                  title="Edit role"
                                >
                                  <Edit2 size={12} />
                                </button>
                                {member.id !== user?.id && (
                                  <button
                                    onClick={() => handleRemoveMember(member.id)}
                                    className="p-1.5 rounded hover:bg-danger/10 text-muted-foreground hover:text-danger transition-colors"
                                    title="Remove member"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredMembers.length === 0 && (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No members match your filters
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Portfolios Tab ────────────────────────────────────────────────── */}
        {activeTab === 'portfolios' && (
          <div className="space-y-3">
            {PORTFOLIOS.map(portfolio => {
              const assignedMembers = members.filter(m =>
                (m.assigned_portfolios || []).includes(portfolio.key)
              );
              const isExpanded = expandedPortfolio === portfolio.key;

              return (
                <div key={portfolio.key} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedPortfolio(isExpanded ? null : portfolio.key)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">{portfolio.stateCode}</span>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-foreground">{portfolio.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {assignedMembers.length} members · {portfolio.leadCount} leads
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        {assignedMembers.slice(0, 4).map(m => (
                          <div
                            key={m.id}
                            className="w-7 h-7 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center text-[10px] font-bold text-primary"
                            title={m.full_name}
                          >
                            {m.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                        ))}
                        {assignedMembers.length > 4 && (
                          <div className="w-7 h-7 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[10px] text-muted-foreground">
                            +{assignedMembers.length - 4}
                          </div>
                        )}
                      </div>
                      {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-5 py-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                        Member Access
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {members.map(member => {
                          const hasAccess = (member.assigned_portfolios || []).includes(portfolio.key);
                          const RoleIcon = ROLE_CONFIG[member.granular_role]?.icon || UserCheck;
                          return (
                            <div
                              key={member.id}
                              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                                hasAccess ? 'border-success/30 bg-success/5' : 'border-border bg-muted/20'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                  {member.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-foreground">{member.full_name}</p>
                                  <span className={`inline-flex items-center gap-0.5 text-[9px] ${ROLE_CONFIG[member.granular_role]?.color}`}>
                                    <RoleIcon size={8} />
                                    {ROLE_CONFIG[member.granular_role]?.label}
                                  </span>
                                </div>
                              </div>
                              {isAdmin && (
                                <button
                                  onClick={() => togglePortfolioForMember(member.id, portfolio.key)}
                                  className={`p-1.5 rounded transition-colors ${
                                    hasAccess
                                      ? 'bg-success/10 text-success hover:bg-success/20' :'bg-muted text-muted-foreground hover:bg-muted/80'
                                  }`}
                                  title={hasAccess ? 'Remove access' : 'Grant access'}
                                >
                                  {hasAccess ? <Unlock size={12} /> : <Lock size={12} />}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Activity Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <select
                value={activityFilter}
                onChange={e => setActivityFilter(e.target.value)}
                className="px-3 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none"
              >
                <option value="all">All Actions</option>
                <option value="bulk_archive">Bulk Archive</option>
                <option value="lead_assign">Lead Assign</option>
                <option value="stage_change">Stage Change</option>
                <option value="member_invite">Member Invite</option>
                <option value="export">Export</option>
                <option value="report_view">Report View</option>
              </select>
              <span className="text-xs text-muted-foreground">{filteredActivity.length} events</span>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {filteredActivity.map((event, idx) => (
                <div
                  key={event.id}
                  className={`flex items-start gap-4 px-5 py-4 border-b border-border last:border-0 ${idx % 2 === 1 ? 'bg-muted/5' : ''}`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0 mt-0.5">
                    {event.user_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{event.user_name}</span>
                      <span className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">
                        {getActionLabel(event.action)}
                      </span>
                      <span className="text-xs text-muted-foreground">{event.resource}</span>
                    </div>
                    {event.details && (
                      <p className="text-xs text-muted-foreground mt-0.5">{event.details}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </div>
              ))}
              {filteredActivity.length === 0 && (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No activity events found
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Invite Modal ──────────────────────────────────────────────────────── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <UserPlus size={18} className="text-primary" />
                Invite Team Member
              </h2>
              <button onClick={() => setShowInviteModal(false)} className="p-1.5 rounded hover:bg-muted transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={inviteForm.full_name}
                  onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Jane Smith"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@company.com"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(ROLE_CONFIG) as GranularRole[]).map(r => {
                    const RoleIcon = ROLE_CONFIG[r].icon;
                    return (
                      <button
                        key={r}
                        onClick={() => setInviteForm(f => ({ ...f, role: r }))}
                        className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-colors ${
                          inviteForm.role === r
                            ? 'border-primary bg-primary/5' :'border-border hover:border-primary/40'
                        }`}
                      >
                        <RoleIcon size={14} className={ROLE_CONFIG[r].color} />
                        <div>
                          <p className="text-xs font-medium text-foreground">{ROLE_CONFIG[r].label}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">{ROLE_CONFIG[r].description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Portfolio Access</label>
                <div className="flex flex-wrap gap-2">
                  {PORTFOLIOS.map(p => {
                    const selected = inviteForm.portfolios.includes(p.key);
                    return (
                      <button
                        key={p.key}
                        onClick={() => setInviteForm(f => ({
                          ...f,
                          portfolios: selected
                            ? f.portfolios.filter(x => x !== p.key)
                            : [...f.portfolios, p.key],
                        }))}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          selected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
                        }`}
                      >
                        {p.stateCode}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteForm.email || !inviteForm.full_name}
                className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {inviting ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending…</>
                ) : (
                  <><Mail size={14} />Send Invite</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
