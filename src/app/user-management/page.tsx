'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';

import { useAuth } from '@/contexts/AuthContext';
import { Users, UserPlus, Shield, Search, Loader2, Edit2, X, Save, Check, Eye, EyeOff, UserCheck, UserX, Settings, ChevronDown, Crown, Star, BarChart2, Lock, Unlock, Info, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type GranularRole = 'owner' | 'team_lead' | 'agent' | 'analyst';
type AppRole = 'admin' | 'agent' | 'homeowner';

interface FeaturePermission {
  key: string;
  label: string;
  description: string;
  group: string;
}

interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  app_role: AppRole;
  granular_role: GranularRole;
  status: 'active' | 'inactive' | 'pending';
  created_at: string;
  // Feature-level permissions
  perm_dashboard_view: boolean;
  perm_lead_access: boolean;
  perm_bulk_actions: boolean;
  perm_integrations: boolean;
  perm_billing: boolean;
  perm_reports: boolean;
  perm_admin: boolean;
  perm_export: boolean;
  perm_sync: boolean;
  perm_pipeline: boolean;
  perm_analytics: boolean;
  perm_settings: boolean;
  // dashboard visibility
  dash_leads: boolean;
  dash_pipeline: boolean;
  dash_analytics: boolean;
  dash_calls: boolean;
  dash_outreach: boolean;
  // agent-specific
  assigned_lead_count?: number;
  agent_territory?: string | null;
}

// ─── Feature Permission Definitions ──────────────────────────────────────────

const FEATURE_PERMISSIONS: FeaturePermission[] = [
  { key: 'perm_dashboard_view', label: 'Dashboard View',  description: 'Access to main dashboard and KPI overview', group: 'Core' },
  { key: 'perm_lead_access',    label: 'Lead Access',     description: 'View and manage lead records', group: 'Core' },
  { key: 'perm_pipeline',       label: 'Pipeline Board',  description: 'View and update pipeline stages', group: 'Core' },
  { key: 'perm_bulk_actions',   label: 'Bulk Actions',    description: 'Perform bulk reassign, SMS, and stage updates', group: 'Operations' },
  { key: 'perm_export',         label: 'Data Export',     description: 'Export leads and reports to CSV/PDF', group: 'Operations' },
  { key: 'perm_sync',           label: 'Data Sync',       description: 'Trigger and manage data source syncs', group: 'Operations' },
  { key: 'perm_reports',        label: 'Reports',         description: 'Access advanced reports and analytics', group: 'Analytics' },
  { key: 'perm_analytics',      label: 'Analytics',       description: 'View campaign and performance analytics', group: 'Analytics' },
  { key: 'perm_integrations',   label: 'Integrations',    description: 'Connect/disconnect third-party integrations', group: 'Admin' },
  { key: 'perm_billing',        label: 'Billing',         description: 'View invoices and manage subscription', group: 'Admin' },
  { key: 'perm_settings',       label: 'Settings',        description: 'Modify operator and system settings', group: 'Admin' },
  { key: 'perm_admin',          label: 'Admin Panel',     description: 'Access user management and audit logs', group: 'Admin' },
];

const PERM_GROUPS = ['Core', 'Operations', 'Analytics', 'Admin'];

// ─── Role Definitions ─────────────────────────────────────────────────────────

const GRANULAR_ROLE_CONFIG: Record<GranularRole, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  badgeColor: string;
  defaultPerms: Partial<Record<string, boolean>>;
}> = {
  owner: {
    label: 'Owner',
    description: 'Full access to all features including billing, integrations, and user management',
    icon: Crown,
    color: 'text-amber-700',
    badgeColor: 'bg-amber-500/10 text-amber-700 border-amber-200',
    defaultPerms: {
      perm_dashboard_view: true, perm_lead_access: true, perm_bulk_actions: true,
      perm_integrations: true, perm_billing: true, perm_reports: true,
      perm_admin: true, perm_export: true, perm_sync: true,
      perm_pipeline: true, perm_analytics: true, perm_settings: true,
      dash_leads: true, dash_pipeline: true, dash_analytics: true, dash_calls: true, dash_outreach: true,
    },
  },
  team_lead: {
    label: 'Team Lead',
    description: 'Manages agents, bulk operations, and reports. No billing or integration access',
    icon: Star,
    color: 'text-blue-700',
    badgeColor: 'bg-blue-500/10 text-blue-700 border-blue-200',
    defaultPerms: {
      perm_dashboard_view: true, perm_lead_access: true, perm_bulk_actions: true,
      perm_integrations: false, perm_billing: false, perm_reports: true,
      perm_admin: false, perm_export: true, perm_sync: false,
      perm_pipeline: true, perm_analytics: true, perm_settings: false,
      dash_leads: true, dash_pipeline: true, dash_analytics: true, dash_calls: true, dash_outreach: true,
    },
  },
  agent: {
    label: 'Agent',
    description: 'Works assigned leads, sends outreach, and updates pipeline stages',
    icon: UserCheck,
    color: 'text-emerald-700',
    badgeColor: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
    defaultPerms: {
      perm_dashboard_view: true, perm_lead_access: true, perm_bulk_actions: false,
      perm_integrations: false, perm_billing: false, perm_reports: false,
      perm_admin: false, perm_export: false, perm_sync: false,
      perm_pipeline: true, perm_analytics: false, perm_settings: false,
      dash_leads: true, dash_pipeline: true, dash_analytics: false, dash_calls: true, dash_outreach: true,
    },
  },
  analyst: {
    label: 'Analyst',
    description: 'Read-only access to reports, analytics, and dashboards. Cannot modify leads',
    icon: BarChart2,
    color: 'text-violet-700',
    badgeColor: 'bg-violet-500/10 text-violet-700 border-violet-200',
    defaultPerms: {
      perm_dashboard_view: true, perm_lead_access: false, perm_bulk_actions: false,
      perm_integrations: false, perm_billing: false, perm_reports: true,
      perm_admin: false, perm_export: true, perm_sync: false,
      perm_pipeline: false, perm_analytics: true, perm_settings: false,
      dash_leads: false, dash_pipeline: false, dash_analytics: true, dash_calls: false, dash_outreach: false,
    },
  },
};

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_USERS: UserRecord[] = [
  {
    id: 'u1', email: 'admin@travlr.com', full_name: 'Admin User', app_role: 'admin', granular_role: 'owner',
    status: 'active', created_at: new Date(Date.now() - 86400000 * 180).toISOString(),
    perm_dashboard_view: true, perm_lead_access: true, perm_bulk_actions: true, perm_integrations: true,
    perm_billing: true, perm_reports: true, perm_admin: true, perm_export: true, perm_sync: true,
    perm_pipeline: true, perm_analytics: true, perm_settings: true,
    dash_leads: true, dash_pipeline: true, dash_analytics: true, dash_calls: true, dash_outreach: true,
    assigned_lead_count: 0, agent_territory: null,
  },
  {
    id: 'u2', email: 'james@travlr.com', full_name: 'James Torres', app_role: 'agent', granular_role: 'team_lead',
    status: 'active', created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
    perm_dashboard_view: true, perm_lead_access: true, perm_bulk_actions: true, perm_integrations: false,
    perm_billing: false, perm_reports: true, perm_admin: false, perm_export: true, perm_sync: false,
    perm_pipeline: true, perm_analytics: true, perm_settings: false,
    dash_leads: true, dash_pipeline: true, dash_analytics: true, dash_calls: true, dash_outreach: true,
    assigned_lead_count: 31, agent_territory: 'Denver, CO',
  },
  {
    id: 'u3', email: 'sarah@travlr.com', full_name: 'Sarah Mitchell', app_role: 'agent', granular_role: 'agent',
    status: 'active', created_at: new Date(Date.now() - 86400000 * 90).toISOString(),
    perm_dashboard_view: true, perm_lead_access: true, perm_bulk_actions: false, perm_integrations: false,
    perm_billing: false, perm_reports: false, perm_admin: false, perm_export: false, perm_sync: false,
    perm_pipeline: true, perm_analytics: false, perm_settings: false,
    dash_leads: true, dash_pipeline: true, dash_analytics: false, dash_calls: true, dash_outreach: true,
    assigned_lead_count: 47, agent_territory: 'Austin, TX',
  },
  {
    id: 'u4', email: 'priya@travlr.com', full_name: 'Priya Nair', app_role: 'agent', granular_role: 'analyst',
    status: 'active', created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
    perm_dashboard_view: true, perm_lead_access: false, perm_bulk_actions: false, perm_integrations: false,
    perm_billing: false, perm_reports: true, perm_admin: false, perm_export: true, perm_sync: false,
    perm_pipeline: false, perm_analytics: true, perm_settings: false,
    dash_leads: false, dash_pipeline: false, dash_analytics: true, dash_calls: false, dash_outreach: false,
    assigned_lead_count: 0, agent_territory: 'Nashville, TN',
  },
  {
    id: 'u5', email: 'owner@example.com', full_name: 'Robert Tanaka', app_role: 'homeowner', granular_role: 'analyst',
    status: 'inactive', created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    perm_dashboard_view: false, perm_lead_access: false, perm_bulk_actions: false, perm_integrations: false,
    perm_billing: false, perm_reports: false, perm_admin: false, perm_export: false, perm_sync: false,
    perm_pipeline: false, perm_analytics: false, perm_settings: false,
    dash_leads: false, dash_pipeline: false, dash_analytics: false, dash_calls: false, dash_outreach: false,
    assigned_lead_count: 0, agent_territory: null,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  inactive: 'bg-red-500/10 text-red-700 border-red-200',
  pending:  'bg-amber-500/10 text-amber-700 border-amber-200',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Role Matrix Component ────────────────────────────────────────────────────

function RoleMatrixView() {
  const roles: GranularRole[] = ['owner', 'team_lead', 'agent', 'analyst'];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-muted-foreground font-semibold w-48">Feature</th>
            {roles.map(role => {
              const cfg = GRANULAR_ROLE_CONFIG[role];
              const RoleIcon = cfg.icon;
              return (
                <th key={role} className="py-3 px-4 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cfg.badgeColor}`}>
                      <RoleIcon size={13} />
                    </div>
                    <span className={`font-semibold ${cfg.color}`}>{cfg.label}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {PERM_GROUPS.map(group => (
            <React.Fragment key={group}>
              <tr>
                <td colSpan={5} className="py-2 px-4 bg-muted/30">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{group}</span>
                </td>
              </tr>
              {FEATURE_PERMISSIONS.filter(p => p.group === group).map(perm => (
                <tr key={perm.key} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                  <td className="py-2.5 px-4">
                    <div>
                      <p className="font-medium text-foreground">{perm.label}</p>
                      <p className="text-[10px] text-muted-foreground">{perm.description}</p>
                    </div>
                  </td>
                  {roles.map(role => {
                    const hasAccess = GRANULAR_ROLE_CONFIG[role].defaultPerms[perm.key] ?? false;
                    return (
                      <td key={role} className="py-2.5 px-4 text-center">
                        {hasAccess ? (
                          <div className="flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
                              <Check size={11} className="text-emerald-600" />
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                              <X size={10} className="text-muted-foreground/40" />
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

interface EditUserModalProps {
  user: UserRecord;
  onClose: () => void;
  onSaved: (updated: UserRecord) => void;
}

function EditUserModal({ user: editUser, onClose, onSaved }: EditUserModalProps) {
  const [form, setForm] = useState<UserRecord>({ ...editUser });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'role' | 'permissions' | 'dashboard'>('role');

  function applyRolePreset(role: GranularRole) {
    const preset = GRANULAR_ROLE_CONFIG[role].defaultPerms;
    setForm(f => ({ ...f, granular_role: role, ...preset }));
  }

  function togglePerm(key: string) {
    setForm(f => ({ ...f, [key]: !(f as Record<string, unknown>)[key] }));
  }

  function handleSave() {
    setSaving(true);
    setTimeout(() => {
      onSaved(form);
      toast.success(`${form.full_name} updated successfully`);
      setSaving(false);
      onClose();
    }, 600);
  }

  const roleCfg = GRANULAR_ROLE_CONFIG[form.granular_role];
  const RoleIcon = roleCfg.icon;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Edit2 size={15} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">Edit User — {editUser.full_name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={15} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(['role', 'permissions', 'dashboard'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-medium capitalize transition-all border-b-2 ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {tab === 'role' ? 'Role & Identity' : tab === 'permissions' ? 'Feature Permissions' : 'Dashboard Visibility'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'role' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Full Name</label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Email</label>
                  <input type="email" value={form.email} disabled className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg text-muted-foreground cursor-not-allowed" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-2">Granular Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(GRANULAR_ROLE_CONFIG) as [GranularRole, typeof GRANULAR_ROLE_CONFIG[GranularRole]][]).map(([role, cfg]) => {
                    const Icon = cfg.icon;
                    const isSelected = form.granular_role === role;
                    return (
                      <button
                        key={role}
                        onClick={() => applyRolePreset(role)}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${isSelected ? `${cfg.badgeColor} border-current` : 'border-border hover:bg-muted'}`}
                      >
                        <Icon size={14} className={isSelected ? cfg.color : 'text-muted-foreground'} />
                        <div>
                          <p className={`text-xs font-semibold ${isSelected ? cfg.color : 'text-foreground'}`}>{cfg.label}</p>
                          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{cfg.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                  <Info size={10} />Selecting a role applies its default permission preset. You can fine-tune in the Permissions tab.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Status</label>
                <div className="flex items-center gap-2">
                  {(['active', 'inactive', 'pending'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={`px-3 py-1.5 text-xs rounded-lg border capitalize transition-all ${form.status === s ? STATUS_COLORS[s] : 'border-border text-muted-foreground hover:bg-muted'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                <Info size={12} className="text-blue-600 shrink-0" />
                <p className="text-[11px] text-blue-700">
                  Current role: <span className="font-semibold">{roleCfg.label}</span>. Permissions below override the role defaults for this user.
                </p>
              </div>
              {PERM_GROUPS.map(group => (
                <div key={group}>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{group}</p>
                  <div className="space-y-1.5">
                    {FEATURE_PERMISSIONS.filter(p => p.group === group).map(perm => {
                      const val = (form as Record<string, unknown>)[perm.key] as boolean;
                      return (
                        <button
                          key={perm.key}
                          onClick={() => togglePerm(perm.key)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${val ? 'bg-primary/5 border-primary/30' : 'border-border hover:bg-muted/30'}`}
                        >
                          <div className={`w-8 h-5 rounded-full flex items-center transition-all ${val ? 'bg-primary justify-end' : 'bg-muted justify-start'}`}>
                            <div className="w-4 h-4 rounded-full bg-white shadow-sm mx-0.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium ${val ? 'text-foreground' : 'text-muted-foreground'}`}>{perm.label}</p>
                            <p className="text-[10px] text-muted-foreground">{perm.description}</p>
                          </div>
                          {val ? <Unlock size={11} className="text-primary shrink-0" /> : <Lock size={11} className="text-muted-foreground/40 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Control which dashboard panels are visible to this user.</p>
              {[
                { key: 'dash_leads', label: 'Leads Panel', desc: 'Shows assigned leads and lead stats' },
                { key: 'dash_pipeline', label: 'Pipeline Panel', desc: 'Shows pipeline stage distribution' },
                { key: 'dash_analytics', label: 'Analytics Panel', desc: 'Shows performance charts and KPIs' },
                { key: 'dash_calls', label: 'Calls Panel', desc: 'Shows call activity and recordings' },
                { key: 'dash_outreach', label: 'Outreach Panel', desc: 'Shows SMS/email delivery stats' },
              ].map(item => {
                const val = (form as Record<string, unknown>)[item.key] as boolean;
                return (
                  <button
                    key={item.key}
                    onClick={() => togglePerm(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${val ? 'bg-emerald-500/5 border-emerald-200' : 'border-border hover:bg-muted/30'}`}
                  >
                    {val ? <Eye size={13} className="text-emerald-600 shrink-0" /> : <EyeOff size={13} className="text-muted-foreground/40 shrink-0" />}
                    <div className="flex-1">
                      <p className={`text-xs font-medium ${val ? 'text-foreground' : 'text-muted-foreground'}`}>{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${val ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                      {val ? 'Visible' : 'Hidden'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-xs border border-border rounded-lg hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invite User Modal ────────────────────────────────────────────────────────

function InviteUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: (u: UserRecord) => void }) {
  const [form, setForm] = useState({ email: '', full_name: '', granular_role: 'agent' as GranularRole });
  const [saving, setSaving] = useState(false);

  function handleInvite() {
    if (!form.email || !form.full_name) { toast.error('Email and name are required'); return; }
    setSaving(true);
    setTimeout(() => {
      const preset = GRANULAR_ROLE_CONFIG[form.granular_role].defaultPerms;
      const newUser: UserRecord = {
        id: `u-${Date.now()}`,
        email: form.email,
        full_name: form.full_name,
        app_role: form.granular_role === 'owner' ? 'admin' : 'agent',
        granular_role: form.granular_role,
        status: 'pending',
        created_at: new Date().toISOString(),
        perm_dashboard_view: preset.perm_dashboard_view ?? false,
        perm_lead_access: preset.perm_lead_access ?? false,
        perm_bulk_actions: preset.perm_bulk_actions ?? false,
        perm_integrations: preset.perm_integrations ?? false,
        perm_billing: preset.perm_billing ?? false,
        perm_reports: preset.perm_reports ?? false,
        perm_admin: preset.perm_admin ?? false,
        perm_export: preset.perm_export ?? false,
        perm_sync: preset.perm_sync ?? false,
        perm_pipeline: preset.perm_pipeline ?? false,
        perm_analytics: preset.perm_analytics ?? false,
        perm_settings: preset.perm_settings ?? false,
        dash_leads: preset.dash_leads ?? false,
        dash_pipeline: preset.dash_pipeline ?? false,
        dash_analytics: preset.dash_analytics ?? false,
        dash_calls: preset.dash_calls ?? false,
        dash_outreach: preset.dash_outreach ?? false,
        assigned_lead_count: 0,
        agent_territory: null,
      };
      onSaved(newUser);
      toast.success(`Invitation sent to ${form.email}`);
      setSaving(false);
      onClose();
    }, 700);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <UserPlus size={15} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">Invite Team Member</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Full Name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Jane Smith"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Email Address</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jane@company.com"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-2">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(GRANULAR_ROLE_CONFIG) as [GranularRole, typeof GRANULAR_ROLE_CONFIG[GranularRole]][]).map(([role, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button
                    key={role}
                    onClick={() => setForm(f => ({ ...f, granular_role: role }))}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${form.granular_role === role ? `${cfg.badgeColor} border-current` : 'border-border hover:bg-muted'}`}
                  >
                    <Icon size={13} className={form.granular_role === role ? cfg.color : 'text-muted-foreground'} />
                    <span className={`text-xs font-medium ${form.granular_role === role ? cfg.color : 'text-foreground'}`}>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-xs border border-border rounded-lg hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={handleInvite}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
            Send Invitation
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>(MOCK_USERS);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<GranularRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeView, setActiveView] = useState<'users' | 'matrix'>('users');
  const [editTarget, setEditTarget] = useState<UserRecord | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.granular_role !== roleFilter) return false;
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  function handleSaveEdit(updated: UserRecord) {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
  }

  function handleInvited(newUser: UserRecord) {
    setUsers(prev => [newUser, ...prev]);
  }

  function toggleStatus(id: string) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u));
    toast.success('User status updated');
  }

  const roleStats = (Object.keys(GRANULAR_ROLE_CONFIG) as GranularRole[]).map(role => ({
    role,
    count: users.filter(u => u.granular_role === role).length,
    cfg: GRANULAR_ROLE_CONFIG[role],
  }));

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">User Management</h1>
              <p className="text-xs text-muted-foreground">Manage team members with granular role-based permissions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-all"
            >
              <UserPlus size={12} />Invite Member
            </button>
          </div>
        </div>

        {/* Role Stats Strip */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/20 shrink-0 flex-wrap">
          {roleStats.map(({ role, count, cfg }) => {
            const Icon = cfg.icon;
            return (
              <button
                key={role}
                onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${roleFilter === role ? `${cfg.badgeColor} border-current` : 'border-border bg-background hover:bg-muted'}`}
              >
                <Icon size={12} className={roleFilter === role ? cfg.color : 'text-muted-foreground'} />
                <span className={`font-medium ${roleFilter === role ? cfg.color : 'text-foreground'}`}>{cfg.label}</span>
                <span className={`font-bold ${roleFilter === role ? cfg.color : 'text-muted-foreground'}`}>{count}</span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setActiveView('users')}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${activeView === 'users' ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
            >
              User List
            </button>
            <button
              onClick={() => setActiveView('matrix')}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${activeView === 'matrix' ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
            >
              Role Matrix
            </button>
          </div>
        </div>

        {activeView === 'matrix' ? (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="max-w-4xl">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-foreground mb-1">Feature-Level Permission Matrix</h2>
                <p className="text-xs text-muted-foreground">Default permissions for each role. Individual users can have permissions overridden in their profile.</p>
              </div>
              <div className="border border-border rounded-xl overflow-hidden bg-card">
                <RoleMatrixView />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card/50 shrink-0 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {(['all', 'active', 'inactive', 'pending'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 text-xs rounded-lg border capitalize transition-all ${statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
                  >
                    {s === 'all' ? 'All Status' : s}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground ml-auto">{filtered.length} users</span>
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="max-w-4xl space-y-2">
                {filtered.map(u => {
                  const roleCfg = GRANULAR_ROLE_CONFIG[u.granular_role];
                  const RoleIcon = roleCfg.icon;
                  const isExpanded = expandedId === u.id;
                  const permCount = FEATURE_PERMISSIONS.filter(p => (u as Record<string, unknown>)[p.key]).length;

                  return (
                    <div key={u.id} className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-primary/30 shadow-sm' : 'border-border'}`}>
                      {/* User Row */}
                      <div
                        className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => setExpandedId(isExpanded ? null : u.id)}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${roleCfg.badgeColor}`}>
                          {u.full_name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{u.full_name}</p>
                            <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${roleCfg.badgeColor}`}>
                              <RoleIcon size={9} />{roleCfg.label}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${STATUS_COLORS[u.status]}`}>
                              {u.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                            {u.email === 'owner@example.com' && (
                              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-200 font-medium">
                                <AlertTriangle size={9} />
                                Placeholder email — update before use
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Shield size={10} />
                            {permCount}/{FEATURE_PERMISSIONS.length} perms
                          </span>
                          {u.agent_territory && (
                            <span className="hidden sm:block">{u.agent_territory}</span>
                          )}
                          <span>{formatDate(u.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setEditTarget(u)}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => toggleStatus(u.id)}
                            className={`p-1.5 rounded-lg transition-colors ${u.status === 'active' ? 'hover:bg-red-500/10 text-muted-foreground hover:text-red-600' : 'hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600'}`}
                          >
                            {u.status === 'active' ? <UserX size={13} /> : <UserCheck size={13} />}
                          </button>
                        </div>
                        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>

                      {/* Expanded Permission Detail */}
                      {isExpanded && (
                        <div className="border-t border-border bg-muted/10 px-4 py-3">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Feature Permissions</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {FEATURE_PERMISSIONS.map(perm => {
                              const hasAccess = (u as Record<string, unknown>)[perm.key] as boolean;
                              return (
                                <div
                                  key={perm.key}
                                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] ${hasAccess ? 'bg-emerald-500/5 border-emerald-100 text-emerald-700' : 'bg-muted/30 border-border text-muted-foreground'}`}
                                >
                                  {hasAccess ? <Check size={10} className="text-emerald-600 shrink-0" /> : <X size={10} className="text-muted-foreground/40 shrink-0" />}
                                  {perm.label}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-end mt-3">
                            <button
                              onClick={() => setEditTarget(u)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 transition-colors"
                            >
                              <Edit2 size={11} />Edit Permissions
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {filtered.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-60 gap-3 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Users size={20} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">No users match your filters</p>
                    <p className="text-xs text-muted-foreground">Try adjusting your search or filter criteria.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {editTarget && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaveEdit}
        />
      )}

      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onSaved={handleInvited}
        />
      )}
    </AppLayout>
  );
}
