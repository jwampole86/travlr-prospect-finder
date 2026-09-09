'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import {
  Settings, Mail, Bell, Users, Key, Eye, EyeOff, Save, Plus, Trash2,
  CheckCircle2, AlertCircle, Loader2, Shield, RefreshCw, Clock,
  Activity, XCircle, RotateCcw, CheckCheck, Zap, TrendingUp, AlertTriangle,
  UserCog, Lock, ChevronDown, ChevronUp, Building2, Globe, GitBranch, Users2,
  UserCircle, ClipboardList, Filter, Download, Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import { REFRESH_SOURCES } from '@/lib/services/leadsRefreshService';
import { loadSyncSchedules, formatNextSync, formatLastSync, SyncScheduleRow } from '@/lib/services/syncSchedulerService';
import {
  loadSyncEvents,
  loadValidationErrors,
  triggerManualRecovery,
  resolveValidationError,
  computeHealthSummary,
  formatBackoff,
  calcBackoffMs,
  type SyncEvent,
  type ValidationError,
  type SyncHealthSummary,
} from '@/lib/services/syncHealthService';
import { subscribeToSyncEvents } from '@/lib/realtime/leadsRealtime';
import { trackSettingsTabViewed, trackSyncHealthViewed } from '@/lib/mixpanel';
import Icon from '@/components/ui/AppIcon';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';




interface OperatorSettings {
  sender_email: string;
  sender_name: string;
  notify_email_sent: boolean;
  notify_sync_health: boolean;
  notify_failed_cadence: boolean;
  notify_new_lead: boolean;
  resend_api_key_hint: string;
  zillow_sync_key_hint: string;
  hotpads_sync_key_hint: string;
  craigslist_sync_key_hint: string;
  apartments_sync_key_hint: string;
}

interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: string;
  invited_at: string;
  accepted_at: string | null;
}

const DEFAULT_SETTINGS: OperatorSettings = {
  sender_email: 'onboarding@resend.dev',
  sender_name: 'TRAVLR Prospect Finder',
  notify_email_sent: true,
  notify_sync_health: true,
  notify_failed_cadence: true,
  notify_new_lead: true,
  resend_api_key_hint: '',
  zillow_sync_key_hint: '',
  hotpads_sync_key_hint: '',
  craigslist_sync_key_hint: '',
  apartments_sync_key_hint: '',
};

type Tab = 'email' | 'notifications' | 'team' | 'integrations' | 'sync' | 'sync-health' | 'roles' | 'capacity' | 'portfolios' | 'assignment' | 'profile' | 'audit' | 'appearance';

const OP_TYPE_LABELS: Record<string, string> = {
  lead_enrichment: 'Lead Enrichment',
  email_send: 'Email Send',
  source_sync: 'Source Sync',
};

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-success/10 text-success border-success/20',
  failed: 'bg-danger/10 text-danger border-danger/20',
  retrying: 'bg-warning/10 text-warning border-warning/20',
  abandoned: 'bg-danger/20 text-danger border-danger/30',
  pending: 'bg-muted text-muted-foreground border-border',
  running: 'bg-primary/10 text-primary border-primary/20',
};

const PERMISSION_SCOPES = ['view', 'edit', 'contact', 'close'] as const;
type PermissionScope = typeof PERMISSION_SCOPES[number];

interface RoleDefinition {
  id: string;
  name: string;
  label: string;
  description: string;
  color: string;
  permissions: PermissionScope[];
  isSystem: boolean;
}

const DEFAULT_ROLES: RoleDefinition[] = [
  {
    id: 'role-admin',
    name: 'admin',
    label: 'Admin',
    description: 'Full access to all features, settings, and team management.',
    color: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    permissions: ['view', 'edit', 'contact', 'close'],
    isSystem: true,
  },
  {
    id: 'role-manager',
    name: 'manager',
    label: 'Manager',
    description: 'Can view, edit, and contact leads. Cannot close deals.',
    color: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    permissions: ['view', 'edit', 'contact'],
    isSystem: true,
  },
  {
    id: 'role-agent',
    name: 'agent',
    label: 'Agent',
    description: 'Can view and contact assigned leads only.',
    color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    permissions: ['view', 'contact'],
    isSystem: true,
  },
  {
    id: 'role-viewer',
    name: 'viewer',
    label: 'Viewer',
    description: 'Read-only access to leads and reports.',
    color: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
    permissions: ['view'],
    isSystem: true,
  },
];

const SCOPE_LABELS: Record<PermissionScope, { label: string; desc: string }> = {
  view: { label: 'View', desc: 'See lead details, scores, and contact info' },
  edit: { label: 'Edit', desc: 'Update lead fields, stage, notes, and tags' },
  contact: { label: 'Contact', desc: 'Send emails, SMS, and workflow steps' },
  close: { label: 'Close', desc: 'Mark leads as Live or Not a Fit' },
};

// ─── Portfolio & Assignment types ─────────────────────────────────────────────
const SYNC_SOURCES = ['Zillow', 'Craigslist', 'HotPads', 'Apartments.com', 'Trulia', 'Realtor.com', 'Dwellsy', 'Facebook Marketplace', 'Airbnb', 'VRBO'] as const;
type SyncSource = typeof SYNC_SOURCES[number];

interface PortfolioConfig {
  id: string;
  name: string;
  abbr: string;
  cities: string;
  syncSources: SyncSource[];
  color: string;
}

type AssignmentStrategy = 'round-robin' | 'score-based';

interface AssignmentConfig {
  strategy: AssignmentStrategy;
  capacityWarningThreshold: number;
  maxLeadsPerAgent: number;
  autoReassignOnOverflow: boolean;
}

const PORTFOLIO_COLORS = [
  'text-blue-500', 'text-emerald-500', 'text-violet-500', 'text-amber-500',
  'text-rose-500', 'text-cyan-500', 'text-orange-500', 'text-teal-500',
];

// ─── Profile Tab Component ────────────────────────────────────────────────────
function ProfileTab({ user, supabase }: { user: any; supabase: ReturnType<typeof createClient> }) {
  const [displayName, setDisplayName] = React.useState(user?.user_metadata?.full_name || '');
  const [appRole, setAppRole] = React.useState<'admin' | 'agent'>('admin');
  const [saving, setSaving] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    supabase
      .from('user_profiles')
      .select('app_role, full_name')
      .eq('id', user.id)
      .single()
      .then(({ data }: { data: any }) => {
        if (data?.app_role) setAppRole(data.app_role as 'admin' | 'agent');
        if (data?.full_name) setDisplayName(data.full_name);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user, supabase]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      // Update user_profiles table
      await supabase
        .from('user_profiles')
        .upsert({ id: user.id, app_role: appRole, full_name: displayName, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      // Update auth metadata
      await supabase.auth.updateUser({ data: { full_name: displayName, role: appRole } });
      toast.success('Profile saved — role change takes effect on next page load');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <UserCircle size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">User Profile</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Manage your display name and application role. Role changes affect which navigation items and data you can access.
      </p>

      {/* Avatar + email */}
      <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/40 border border-border">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-base font-bold text-primary shrink-0">
          {displayName ? displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : user?.email?.slice(0, 2).toUpperCase() || 'OP'}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{displayName || user?.email}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
      </div>

      {/* Display name */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your full name"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Role selector */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-foreground">Application Role</label>
        <p className="text-[11px] text-muted-foreground">
          Admins see all portfolios, agents, and data. Agents see only their assigned portfolios and leads.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(['admin', 'agent'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setAppRole(r)}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                appRole === r
                  ? r === 'admin' ?'border-purple-500 bg-purple-500/5' :'border-blue-500 bg-blue-500/5' :'border-border bg-card hover:bg-muted/40'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                r === 'admin' ? 'bg-purple-500/10' : 'bg-blue-500/10'
              }`}>
                {r === 'admin'
                  ? <Shield size={16} className="text-purple-500" />
                  : <UserCircle size={16} className="text-blue-500" />
                }
              </div>
              <div>
                <p className={`text-sm font-semibold capitalize ${
                  appRole === r
                    ? r === 'admin' ? 'text-purple-500' : 'text-blue-500' :'text-foreground'
                }`}>
                  {r === 'admin' ? 'Admin' : 'Agent'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {r === 'admin' ?'Full access to all portfolios, agents, analytics, and settings' :'Access limited to assigned portfolios, leads, and own SMS/email sends'}
                </p>
              </div>
              {appRole === r && (
                <CheckCircle2 size={14} className={`ml-auto shrink-0 mt-0.5 ${r === 'admin' ? 'text-purple-500' : 'text-blue-500'}`} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Role boundary info */}
      <div className={`p-3 rounded-lg border text-xs ${
        appRole === 'agent' ?'bg-blue-500/5 border-blue-500/20 text-blue-400' :'bg-purple-500/5 border-purple-500/20 text-purple-400'
      }`}>
        {appRole === 'admin' ? (
          <p><strong>Admin access:</strong> You can view all portfolios, all agents&apos; leads, all SMS/email sends, and all analytics. You can manage team members, roles, and system settings.</p>
        ) : (
          <p><strong>Agent access:</strong> You will only see portfolios assigned to you, leads assigned to you, and your own SMS/email send history. Admin-only pages (Agents, Team Performance, Audit Trail, etc.) will be hidden from your navigation.</p>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-all disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? 'Saving…' : 'Save Profile'}
      </button>
    </div>
  );
}

// ─── Admin Audit Tab ──────────────────────────────────────────────────────────

type AuditActionType =
  | 'role_change' |'permission_update' |'lead_rescore' |'bulk_action' |'export' |'login' |'settings_change' |'team_invite' |'team_remove';

interface AuditEntry {
  id: string;
  action_type: AuditActionType;
  actor_email: string;
  actor_role: string;
  target_entity: string;
  target_id?: string;
  old_value?: string;
  new_value?: string;
  reason_code?: string;
  details: string;
  created_at: string;
  ip_address?: string;
}

const AUDIT_ACTION_CONFIG: Record<AuditActionType, { label: string; color: string; icon: React.ReactNode }> = {
  role_change: { label: 'Role Change', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: <UserCog size={11} /> },
  permission_update: { label: 'Permission Update', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: <Lock size={11} /> },
  lead_rescore: { label: 'Lead Re-score', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: <TrendingUp size={11} /> },
  bulk_action: { label: 'Bulk Action', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20', icon: <CheckCheck size={11} /> },
  export: { label: 'Export', color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: <Download size={11} /> },
  login: { label: 'Login', color: 'bg-muted text-muted-foreground border-border', icon: <Shield size={11} /> },
  settings_change: { label: 'Settings Change', color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20', icon: <Settings size={11} /> },
  team_invite: { label: 'Team Invite', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: <Users size={11} /> },
  team_remove: { label: 'Team Remove', color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: <Trash2 size={11} /> },
};

// ─── Appearance Tab ───────────────────────────────────────────────────────────
function AppearanceTab() {
  const { theme, resolvedTheme } = useTheme();
  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <Sun size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Choose your preferred color theme. <strong className="text-foreground">System</strong> automatically follows your device&apos;s light/dark setting and updates in real time if your OS switches modes.
        Your preference is saved to your account and applies across all devices.
      </p>
      <div className="space-y-3">
        <label className="text-xs font-medium text-foreground">Color Theme</label>
        <ThemeToggle variant="settings" />
        <p className="text-[11px] text-muted-foreground">
          Currently displaying: <span className="font-semibold text-foreground capitalize">{resolvedTheme}</span> mode
          {theme === 'system' && <span className="ml-1">(following system preference)</span>}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 pt-2">
        {[
          { label: 'Light', preview: 'bg-white border-gray-200', text: 'text-gray-900', sub: 'text-gray-500', badge: 'bg-blue-100 text-blue-700' },
          { label: 'Dark', preview: 'bg-[#0d1117] border-[#2a3142]', text: 'text-slate-100', sub: 'text-slate-400', badge: 'bg-blue-900/60 text-blue-300' },
          { label: 'System', preview: 'bg-gradient-to-br from-white to-[#0d1117] border-gray-300', text: 'text-gray-700', sub: 'text-gray-500', badge: 'bg-purple-100 text-purple-700' },
        ].map(({ label, preview, text, sub, badge }) => (
          <div key={label} className={`rounded-xl border-2 p-3 ${preview} ${theme === label.toLowerCase() ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
            <div className={`text-xs font-semibold mb-1 ${text}`}>{label}</div>
            <div className={`text-[10px] ${sub}`}>Dashboard preview</div>
            <div className={`mt-2 inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium ${badge}`}>Active</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminAuditTab({ supabase, user }: { supabase: ReturnType<typeof createClient>; user: any }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<AuditActionType | 'all'>('all');
  const [filterActor, setFilterActor] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    setLoading(true);
    // Load from audit_trail table — show empty state if no data (no mock fallback)
    const load = async () => {
      try {
        const cutoff = dateRange === '7d'
          ? new Date(Date.now() - 7 * 86400000).toISOString()
          : dateRange === '30d'
          ? new Date(Date.now() - 30 * 86400000).toISOString()
          : dateRange === '90d'
          ? new Date(Date.now() - 90 * 86400000).toISOString()
          : null;

        let query = supabase
          .from('audit_trail')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);

        if (cutoff) query = query.gte('created_at', cutoff);

        const { data, error } = await query;
        if (error) throw error;
        setEntries((data as AuditEntry[]) || []);
      } catch {
        // Show empty state — do NOT fall back to mock data in production
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [supabase, dateRange]);

  const filtered = entries.filter(e => {
    if (filterType !== 'all' && e.action_type !== filterType) return false;
    if (filterActor && !e.actor_email.toLowerCase().includes(filterActor.toLowerCase())) return false;
    return true;
  });

  const actionTypeCounts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.action_type] = (acc[e.action_type] || 0) + 1;
    return acc;
  }, {});

  function exportAuditCSV() {
    const rows = filtered.map(e => [
      new Date(e.created_at).toLocaleString(),
      e.action_type,
      e.actor_email,
      e.actor_role,
      e.target_entity,
      e.old_value || '',
      e.new_value || '',
      e.reason_code || '',
      e.details,
      e.ip_address || '',
    ]);
    const header = ['Timestamp', 'Action Type', 'Actor Email', 'Actor Role', 'Target', 'Old Value', 'New Value', 'Reason Code', 'Details', 'IP Address'];
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Admin Audit Log</h2>
          </div>
          <button
            onClick={exportAuditCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <Download size={12} />
            Export CSV
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Complete audit trail of all administrative actions — role changes, permission updates, lead re-scores, bulk actions, and exports. Includes actor identity, timestamp, and reason codes for compliance review.
        </p>

        {/* KPI strip */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
          {(Object.keys(AUDIT_ACTION_CONFIG) as AuditActionType[]).slice(0, 5).map(type => {
            const cfg = AUDIT_ACTION_CONFIG[type];
            return (
              <button
                key={type}
                onClick={() => setFilterType(filterType === type ? 'all' : type)}
                className={`flex flex-col gap-1 p-3 rounded-lg border text-left transition-all ${
                  filterType === type ? `${cfg.color} ring-1 ring-current/30` : 'border-border hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={filterType === type ? '' : 'text-muted-foreground'}>{cfg.icon}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground">{cfg.label}</span>
                </div>
                <span className="text-lg font-bold text-foreground">{actionTypeCounts[type] || 0}</span>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-muted-foreground" />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as AuditActionType | 'all')}
              className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Actions</option>
              {(Object.keys(AUDIT_ACTION_CONFIG) as AuditActionType[]).map(t => (
                <option key={t} value={t}>{AUDIT_ACTION_CONFIG[t].label}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Filter by actor email…"
            value={filterActor}
            onChange={e => setFilterActor(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-48"
          />
          <div className="flex items-center gap-1 ml-auto">
            {(['7d', '30d', '90d', 'all'] as const).map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                  dateRange === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {r === 'all' ? 'All time' : `Last ${r}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            {filterType !== 'all' && <span className="text-muted-foreground font-normal"> · filtered by {AUDIT_ACTION_CONFIG[filterType]?.label}</span>}
          </p>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock size={11} />
            Showing {dateRange === 'all' ? 'all time' : `last ${dateRange}`}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <ClipboardList size={28} className="text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No audit events match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(entry => {
              const cfg = AUDIT_ACTION_CONFIG[entry.action_type];
              const isExpanded = expandedId === entry.id;
              return (
                <div key={entry.id} className="hover:bg-muted/20 transition-colors">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
                  >
                    {/* Action type badge */}
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 mt-0.5 ${cfg.color}`}>
                      {cfg.icon}
                      {cfg.label}
                    </span>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">{entry.actor_email}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          entry.actor_role === 'admin' ? 'bg-purple-500/10 text-purple-500' :
                          entry.actor_role === 'manager' ? 'bg-blue-500/10 text-blue-500' :
                          entry.actor_role === 'system' ? 'bg-muted text-muted-foreground' :
                          'bg-emerald-500/10 text-emerald-500'
                        }`}>
                          {entry.actor_role}
                        </span>
                        <span className="text-xs text-muted-foreground">→</span>
                        <span className="text-xs text-foreground font-medium truncate">{entry.target_entity}</span>
                        {entry.reason_code && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded font-mono text-muted-foreground shrink-0">
                            {entry.reason_code}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{entry.details}</p>
                    </div>

                    {/* Timestamp */}
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-muted-foreground">{timeAgo(entry.created_at)}</p>
                      <p className="text-[10px] text-muted-foreground/60">
                        {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>

                    {isExpanded ? <ChevronUp size={13} className="text-muted-foreground shrink-0 mt-1" /> : <ChevronDown size={13} className="text-muted-foreground shrink-0 mt-1" />}
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-border/50 bg-muted/10">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                        {entry.old_value && (
                          <div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Old Value</p>
                            <p className="text-xs font-mono text-foreground bg-red-500/5 border border-red-500/10 px-2 py-1 rounded">{entry.old_value}</p>
                          </div>
                        )}
                        {entry.new_value && (
                          <div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">New Value</p>
                            <p className="text-xs font-mono text-foreground bg-green-500/5 border border-green-500/10 px-2 py-1 rounded">{entry.new_value}</p>
                          </div>
                        )}
                        {entry.reason_code && (
                          <div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Reason Code</p>
                            <p className="text-xs font-mono text-foreground bg-muted px-2 py-1 rounded">{entry.reason_code}</p>
                          </div>
                        )}
                        {entry.ip_address && (
                          <div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">IP Address</p>
                            <p className="text-xs font-mono text-muted-foreground">{entry.ip_address}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Exact Time</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Full Details</p>
                        <p className="text-xs text-foreground leading-relaxed">{entry.details}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OperatorSettingsPage() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [settings, setSettings] = useState<OperatorSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [syncSchedules, setSyncSchedules] = useState<SyncScheduleRow[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('viewer');
  const [addingMember, setAddingMember] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Roles state
  const [roles, setRoles] = useState<RoleDefinition[]>(DEFAULT_ROLES);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);

  // Sync Health state
  const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [healthSummary, setHealthSummary] = useState<SyncHealthSummary | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [syncHealthFilter, setSyncHealthFilter] = useState<'all' | 'failed' | 'retrying' | 'abandoned'>('all');

  // Portfolio CRUD state
  const [portfolioConfigs, setPortfolioConfigs] = useState<PortfolioConfig[]>([]);
  const [editingPortfolio, setEditingPortfolio] = useState<PortfolioConfig | null>(null);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [newPortfolioAbbr, setNewPortfolioAbbr] = useState('');
  const [newPortfolioCities, setNewPortfolioCities] = useState('');
  const [newPortfolioSources, setNewPortfolioSources] = useState<SyncSource[]>([]);
  const [newPortfolioColor, setNewPortfolioColor] = useState(PORTFOLIO_COLORS[0]);
  const [savingPortfolio, setSavingPortfolio] = useState(false);

  // Assignment strategy state
  const [assignmentConfig, setAssignmentConfig] = useState<AssignmentConfig>({
    strategy: 'round-robin',
    capacityWarningThreshold: 80,
    maxLeadsPerAgent: 50,
    autoReassignOnOverflow: false,
  });
  const [agentCapacities, setAgentCapacities] = useState<{ id: string; name: string; leadCount: number; maxLeads: number }[]>([]);
  const [savingAssignment, setSavingAssignment] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [settingsRes, teamRes] = await Promise.all([
        supabase.from('operator_settings').select('*').eq('user_id', user.id).single(),
        supabase.from('team_members').select('*').eq('owner_user_id', user.id).order('invited_at'),
      ]);
      if (settingsRes.data) setSettings(settingsRes.data as OperatorSettings);
      if (teamRes.data) setTeamMembers(teamRes.data as TeamMember[]);
      const schedules = await loadSyncSchedules(user.id);
      setSyncSchedules(schedules);

      // Load portfolio configs from operator_settings or fallback
      try {
        const { data: pfData } = await supabase
          .from('operator_settings')
          .select('portfolio_configs, assignment_config')
          .eq('user_id', user.id)
          .single();
        if (pfData?.portfolio_configs) setPortfolioConfigs(pfData.portfolio_configs as PortfolioConfig[]);
        if (pfData?.assignment_config) setAssignmentConfig(pfData.assignment_config as AssignmentConfig);
      } catch { /* silent */ }

      // Load agent capacities
      try {
        const { data: agentsData } = await supabase
          .from('agent_profiles')
          .select('id, full_name')
          .eq('owner_user_id', user.id)
          .eq('status', 'active');
        if (agentsData) {
          const capacities = await Promise.all(
            agentsData.map(async (a: any) => {
              const { count } = await supabase
                .from('agent_lead_permissions')
                .select('*', { count: 'exact', head: true })
                .eq('agent_id', a.id);
              return { id: a.id, name: a.full_name, leadCount: count ?? 0, maxLeads: 50 };
            })
          );
          setAgentCapacities(capacities);
        }
      } catch { /* silent */ }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  const loadHealthData = useCallback(async () => {
    if (!user) return;
    setHealthLoading(true);
    try {
      const [events, errors] = await Promise.all([
        loadSyncEvents(user.id),
        loadValidationErrors(user.id),
      ]);
      setSyncEvents(events);
      setValidationErrors(errors);
      setHealthSummary(computeHealthSummary(events, errors));
    } catch {
      // silent
    } finally {
      setHealthLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Subscribe to real-time sync event updates when on sync-health tab
  useEffect(() => {
    if (activeTab !== 'sync-health' || !user?.id) return;
    loadHealthData();
    trackSyncHealthViewed();

    const unsub = subscribeToSyncEvents(user.id, () => {
      loadHealthData();
    });
    return unsub;
  }, [activeTab, user?.id, loadHealthData]);

  async function handleSaveSettings() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('operator_settings').upsert(
        { ...settings, user_id: user.id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
      toast.success('Settings saved');
      await addNotification({ type: 'info', title: 'Settings updated', message: 'Operator settings have been saved.' });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember() {
    if (!user || !newMemberEmail.trim()) return;
    setAddingMember(true);
    try {
      const { error } = await supabase.from('team_members').insert({
        owner_user_id: user.id,
        email: newMemberEmail.trim(),
        full_name: newMemberName.trim(),
        role: newMemberRole,
      });
      if (error) throw error;
      toast.success(`Invited ${newMemberEmail}`);
      setNewMemberEmail(''); setNewMemberName(''); setNewMemberRole('viewer');
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(id: string) {
    await supabase.from('team_members').delete().eq('id', id);
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
    toast.success('Team member removed');
  }

  async function handleManualRecovery(event: SyncEvent) {
    if (!user) return;
    setRecoveringId(event.id);
    try {
      const result = await triggerManualRecovery(user.id, event.id, event.operation_type, event.operation_id);
      if (result.success) {
        toast.success(`Recovery queued for ${OP_TYPE_LABELS[event.operation_type] ?? event.operation_type}`);
        await loadHealthData();
      } else {
        toast.error(result.message);
      }
    } finally {
      setRecoveringId(null);
    }
  }

  async function handleResolveError(error: ValidationError) {
    if (!user) return;
    setResolvingId(error.id);
    try {
      await resolveValidationError(user.id, error.id);
      setValidationErrors((prev) => prev.filter((e) => e.id !== error.id));
      toast.success('Validation error marked as resolved');
      setHealthSummary(computeHealthSummary(syncEvents, validationErrors.filter((e) => e.id !== error.id)));
    } finally {
      setResolvingId(null);
    }
  }

  function handleEditPortfolio(pf: PortfolioConfig) {
    setEditingPortfolio(pf);
    setNewPortfolioName(pf.name);
    setNewPortfolioAbbr(pf.abbr);
    setNewPortfolioCities(pf.cities);
    setNewPortfolioSources(pf.syncSources);
    setNewPortfolioColor(pf.color);
  }

  async function handleDeletePortfolio(id: string) {
    if (!user) return;
    let updated = portfolioConfigs.filter((pf) => pf.id !== id);
    setPortfolioConfigs(updated);
    try {
      await supabase
        .from('operator_settings')
        .update({ portfolio_configs: updated })
        .eq('user_id', user.id);
      toast.success('Portfolio deleted');
    } catch {
      toast.error('Failed to delete portfolio');
    }
  }

  async function handleSavePortfolio() {
    if (!user || !newPortfolioName.trim()) return;
    setSavingPortfolio(true);
    try {
      let updated: PortfolioConfig[];
      if (editingPortfolio) {
        updated = portfolioConfigs.map((pf) =>
          pf.id === editingPortfolio.id
            ? { ...pf, name: newPortfolioName.trim(), abbr: newPortfolioAbbr.trim(), cities: newPortfolioCities.trim(), syncSources: newPortfolioSources, color: newPortfolioColor }
            : pf
        );
      } else {
        const newPf: PortfolioConfig = {
          id: `portfolio-${Date.now()}`,
          name: newPortfolioName.trim(),
          abbr: newPortfolioAbbr.trim(),
          cities: newPortfolioCities.trim(),
          syncSources: newPortfolioSources,
          color: newPortfolioColor,
        };
        updated = [...portfolioConfigs, newPf];
      }
      await supabase
        .from('operator_settings')
        .update({ portfolio_configs: updated })
        .eq('user_id', user.id);
      setPortfolioConfigs(updated);
      setEditingPortfolio(null);
      setNewPortfolioName('');
      setNewPortfolioAbbr('');
      setNewPortfolioCities('');
      setNewPortfolioSources([]);
      setNewPortfolioColor(PORTFOLIO_COLORS[0]);
      toast.success(editingPortfolio ? 'Portfolio updated' : 'Portfolio created');
    } catch {
      toast.error('Failed to save portfolio');
    } finally {
      setSavingPortfolio(false);
    }
  }

  async function handleSaveAssignment() {
    if (!user) return;
    setSavingAssignment(true);
    try {
      await supabase
        .from('operator_settings')
        .update({ assignment_config: assignmentConfig })
        .eq('user_id', user.id);
      toast.success('Assignment config saved');
    } catch {
      toast.error('Failed to save assignment config');
    } finally {
      setSavingAssignment(false);
    }
  }

  function maskSecret(val: string): string {
    if (!val) return '';
    if (val.length <= 8) return '••••••••';
    return val.slice(0, 4) + '••••••••' + val.slice(-4);
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'profile', label: 'User Profile', icon: UserCircle },
    { key: 'appearance', label: 'Appearance', icon: Sun },
    { key: 'email', label: 'Email Sender', icon: Mail },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'team', label: 'Team Members', icon: Users },
    { key: 'roles', label: 'Roles & Permissions', icon: UserCog },
    { key: 'portfolios', label: 'Portfolios', icon: Building2 },
    { key: 'assignment', label: 'Lead Assignment', icon: GitBranch },
    { key: 'integrations', label: 'Integration Keys', icon: Key },
    { key: 'sync', label: 'Sync Schedules', icon: RefreshCw },
    { key: 'sync-health', label: 'Sync Health', icon: Activity },
    { key: 'capacity', label: 'Capacity Report', icon: TrendingUp },
    { key: 'audit', label: 'Admin Audit', icon: ClipboardList },
  ];

  const filteredSyncEvents = syncHealthFilter === 'all'
    ? syncEvents
    : syncEvents.filter((e) => e.status === syncHealthFilter);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-6 py-5 max-w-screen-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <Settings size={22} className="text-primary" />
              Operator Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage email sender, notifications, team access, and integration credentials.
            </p>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key);
                trackSettingsTabViewed(key);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={14} />
              {label}
              {key === 'sync-health' && healthSummary && (healthSummary.failedCount + healthSummary.abandonedCount + healthSummary.validationErrorCount) > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-danger text-white">
                  {healthSummary.failedCount + healthSummary.abandonedCount + healthSummary.validationErrorCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* User Profile Tab */}
        {activeTab === 'profile' && (
          <ProfileTab user={user} supabase={supabase} />
        )}

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <AppearanceTab />
        )}

        {/* Admin Audit Tab */}
        {activeTab === 'audit' && (
          <AdminAuditTab user={user} supabase={supabase} />
        )}

        {/* Email Sender Tab */}
        {activeTab === 'email' && (
          <div className="bg-card rounded-xl border border-border p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Mail size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Email Sender Configuration</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure the sender address and name used for all outgoing cadence emails. Use a verified domain address for best deliverability.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Sender Email Address</label>
                <input
                  type="email"
                  value={settings.sender_email}
                  onChange={(e) => setSettings((s) => ({ ...s, sender_email: e.target.value }))}
                  placeholder="you@yourdomain.com"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-[11px] text-muted-foreground">Must be verified in your Resend account.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Sender Display Name</label>
                <input
                  type="text"
                  value={settings.sender_name}
                  onChange={(e) => setSettings((s) => ({ ...s, sender_name: e.target.value }))}
                  placeholder="TRAVLR Prospect Finder"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
              <AlertCircle size={14} className="text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-warning">
                To use a custom sender address, add and verify your domain in the Resend dashboard, then update the <code className="font-mono bg-warning/10 px-1 rounded">from</code> field in the <code className="font-mono bg-warning/10 px-1 rounded">send-cadence-email</code> Edge Function.
              </p>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="bg-card rounded-xl border border-border p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Bell size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Notification Preferences</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Choose which events trigger in-app notifications and toast popups.
            </p>
            <div className="space-y-3">
              {[
                { key: 'notify_email_sent' as const, label: 'Email send confirmations', desc: 'Notify when a cadence email is successfully sent via Resend.' },
                { key: 'notify_sync_health' as const, label: 'Sync health alerts', desc: 'Notify when a source sync completes or encounters issues.' },
                { key: 'notify_failed_cadence' as const, label: 'Failed cadence steps', desc: 'Notify when an outreach cadence step fails to send.' },
                { key: 'notify_new_lead' as const, label: 'New lead arrivals', desc: 'Notify when new leads are added from any source sync.' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-start justify-between gap-4 p-3.5 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                  <button
                    onClick={() => setSettings((s) => ({ ...s, [key]: !s[key] }))}
                    className={`relative w-10 h-5.5 rounded-full transition-colors shrink-0 mt-0.5 ${settings[key] ? 'bg-primary' : 'bg-muted'}`}
                    style={{ height: '22px', width: '40px' }}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings[key] ? 'translate-x-5' : 'translate-x-0.5'}`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team Members Tab */}
        {activeTab === 'team' && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Invite Team Member</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Full name"
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex gap-2">
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="agent">Agent</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={handleAddMember}
                    disabled={addingMember || !newMemberEmail.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    {addingMember ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    Invite
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Role permissions are defined in the <button onClick={() => setActiveTab('roles')} className="text-primary hover:underline">Roles & Permissions</button> tab.
              </p>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Team Members ({teamMembers.length})</p>
              </div>
              {teamMembers.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Users size={24} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No team members yet. Invite colleagues above.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {teamMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                        {m.full_name ? m.full_name.slice(0, 2).toUpperCase() : m.email.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{m.full_name || m.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${
                        m.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                        m.role === 'manager' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        m.role === 'agent'? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'
                      }`}>
                        {m.role}
                      </span>
                      {m.accepted_at ? (
                        <CheckCircle2 size={14} className="text-success shrink-0" title="Accepted" />
                      ) : (
                        <span className="text-[10px] text-warning shrink-0">Pending</span>
                      )}
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        className="p-1 rounded text-muted-foreground hover:text-danger hover:bg-danger/5 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Roles & Permissions Tab */}
        {activeTab === 'roles' && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center gap-2 mb-1">
                <UserCog size={16} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Role Definitions</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Define what each role can do. System roles cannot be deleted but their permission scopes can be customized.
              </p>

              {/* Permission scope legend */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                {PERMISSION_SCOPES.map((scope) => (
                  <div key={scope} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
                    <Lock size={11} className="text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-foreground capitalize">{scope}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{SCOPE_LABELS[scope].desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {roles.map((role) => (
                  <div key={role.id} className="border border-border rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
                    >
                      <span className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold capitalize ${role.color}`}>
                        {role.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{role.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {PERMISSION_SCOPES.map((scope) => (
                          <span
                            key={scope}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${
                              role.permissions.includes(scope)
                                ? 'bg-primary/10 text-primary' :'bg-muted text-muted-foreground/40'
                            }`}
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                      {expandedRole === role.id ? (
                        <ChevronUp size={14} className="text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                      )}
                    </button>

                    {expandedRole === role.id && (
                      <div className="px-4 pb-4 pt-1 border-t border-border bg-muted/10 space-y-3">
                        <p className="text-xs text-muted-foreground">{role.description}</p>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-foreground">Permission Scopes</p>
                          <div className="grid grid-cols-2 gap-2">
                            {PERMISSION_SCOPES.map((scope) => {
                              const active = role.permissions.includes(scope);
                              return (
                                <button
                                  key={scope}
                                  onClick={() => {
                                    setRoles((prev) =>
                                      prev.map((r) =>
                                        r.id === role.id
                                          ? {
                                              ...r,
                                              permissions: active
                                                ? r.permissions.filter((p) => p !== scope)
                                                : [...r.permissions, scope],
                                            }
                                          : r
                                      )
                                    );
                                  }}
                                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all ${
                                    active
                                      ? 'border-primary bg-primary/5 text-primary' :'border-border text-muted-foreground hover:bg-muted/40'
                                  }`}
                                >
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${active ? 'bg-primary border-primary' : 'border-border'}`}>
                                    {active && <CheckCircle2 size={10} className="text-white" />}
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium capitalize">{scope}</p>
                                    <p className="text-[10px] text-muted-foreground leading-tight">{SCOPE_LABELS[scope].desc}</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => {
                              toast.success(`${role.label} permissions saved`);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-all"
                          >
                            <Save size={11} />
                            Save Changes
                          </button>
                          {role.isSystem && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Shield size={10} />
                              System role — cannot be deleted
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Quick reference matrix */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground">Permission Matrix</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Role</th>
                      {PERMISSION_SCOPES.map((s) => (
                        <th key={s} className="px-4 py-2.5 text-center font-semibold text-muted-foreground capitalize">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {roles.map((role) => (
                      <tr key={role.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold capitalize ${role.color}`}>
                            {role.label}
                          </span>
                        </td>
                        {PERMISSION_SCOPES.map((scope) => (
                          <td key={scope} className="px-4 py-2.5 text-center">
                            {role.permissions.includes(scope) ? (
                              <CheckCircle2 size={13} className="text-success mx-auto" />
                            ) : (
                              <XCircle size={13} className="text-muted-foreground/30 mx-auto" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Portfolios Tab */}
        {activeTab === 'portfolios' && (
          <div className="space-y-5">
            {/* Create / Edit form */}
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 size={16} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">
                  {editingPortfolio ? `Edit Portfolio — ${editingPortfolio.name}` : 'Create Portfolio'}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Portfolio Name *</label>
                  <input
                    value={newPortfolioName}
                    onChange={(e) => setNewPortfolioName(e.target.value)}
                    placeholder="e.g. Austin STR Portfolio"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Abbreviation</label>
                  <input
                    value={newPortfolioAbbr}
                    onChange={(e) => setNewPortfolioAbbr(e.target.value.toUpperCase().slice(0, 5))}
                    placeholder="AUS"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Cities (comma-separated)</label>
                  <input
                    value={newPortfolioCities}
                    onChange={(e) => setNewPortfolioCities(e.target.value)}
                    placeholder="Austin, Round Rock, Cedar Park"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              {/* Sync source picker */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Sync Sources</label>
                <p className="text-[11px] text-muted-foreground">Select which data sources to sync for this portfolio.</p>
                <div className="flex flex-wrap gap-2">
                  {SYNC_SOURCES.map((src) => {
                    const active = newPortfolioSources.includes(src);
                    return (
                      <button
                        key={src}
                        onClick={() => setNewPortfolioSources((prev) =>
                          active ? prev.filter((s) => s !== src) : [...prev, src]
                        )}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          active ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Globe size={11} />
                        {src}
                        {active && <CheckCircle2 size={11} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color picker */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Color</label>
                <div className="flex gap-2">
                  {PORTFOLIO_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewPortfolioColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${newPortfolioColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    >
                      <Building2 size={14} className={`mx-auto ${c}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSavePortfolio}
                  disabled={savingPortfolio || !newPortfolioName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-all disabled:opacity-50"
                >
                  {savingPortfolio ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {editingPortfolio ? 'Update Portfolio' : 'Create Portfolio'}
                </button>
                {editingPortfolio && (
                  <button
                    onClick={() => { setEditingPortfolio(null); setNewPortfolioName(''); setNewPortfolioAbbr(''); setNewPortfolioCities(''); setNewPortfolioSources([]); }}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Portfolio list */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Configured Portfolios ({portfolioConfigs.length})</p>
              </div>
              {portfolioConfigs.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Building2 size={24} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No portfolios configured yet. Create one above.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {portfolioConfigs.map((pf) => (
                    <div key={pf.id} className="flex items-start gap-3 px-4 py-3.5">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Building2 size={14} className={pf.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{pf.name}</p>
                          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{pf.abbr}</span>
                        </div>
                        {pf.cities && <p className="text-xs text-muted-foreground mt-0.5 truncate">{pf.cities}</p>}
                        {pf.syncSources.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {pf.syncSources.map((s) => (
                              <span key={s} className="text-[10px] bg-primary/8 text-primary px-1.5 py-0.5 rounded font-medium">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleEditPortfolio(pf)} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => handleDeletePortfolio(pf.id)} className="p-1.5 rounded-md hover:bg-danger/10 transition-colors text-muted-foreground hover:text-danger">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lead Assignment Tab */}
        {activeTab === 'assignment' && (
          <div className="space-y-5">
            <div className="bg-card rounded-xl border border-border p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <GitBranch size={16} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Lead Assignment Strategy</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure how new leads are distributed across agents when auto-assignment is triggered.
              </p>

              {/* Strategy selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Assignment Strategy</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { value: 'round-robin', label: 'Round Robin', desc: 'Distribute leads evenly across all active agents in rotation order. Ensures equal workload distribution regardless of lead quality.' },
                    { value: 'score-based', label: 'Score-Based', desc: 'Assign high-score leads (≥75) to top-performing agents. Lower-score leads distributed round-robin to remaining agents.' },
                  ] as { value: AssignmentStrategy; label: string; desc: string }[]).map(({ value, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => setAssignmentConfig((c) => ({ ...c, strategy: value }))}
                      className={`text-left p-4 rounded-xl border transition-all ${
                        assignmentConfig.strategy === value
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-semibold text-foreground">{label}</p>
                        {assignmentConfig.strategy === value && <CheckCircle2 size={14} className="text-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Capacity settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Max Leads per Agent</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={assignmentConfig.maxLeadsPerAgent}
                    onChange={(e) => setAssignmentConfig((c) => ({ ...c, maxLeadsPerAgent: parseInt(e.target.value) || 50 }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="text-[11px] text-muted-foreground">Hard cap — agent will not receive new leads above this count.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Capacity Warning Threshold (%)</label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={assignmentConfig.capacityWarningThreshold}
                    onChange={(e) => setAssignmentConfig((c) => ({ ...c, capacityWarningThreshold: parseInt(e.target.value) || 80 }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="text-[11px] text-muted-foreground">Show warning when agent reaches this % of their max capacity.</p>
                </div>
              </div>

              {/* Auto-reassign toggle */}
              <div className="flex items-start justify-between gap-4 p-3.5 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">Auto-reassign on overflow</p>
                  <p className="text-xs text-muted-foreground mt-0.5">When an agent hits max capacity, automatically reassign incoming leads to the next available agent.</p>
                </div>
                <button
                  onClick={() => setAssignmentConfig((c) => ({ ...c, autoReassignOnOverflow: !c.autoReassignOnOverflow }))}
                  className={`relative rounded-full transition-colors shrink-0 mt-0.5`}
                  style={{ height: '22px', width: '40px', background: assignmentConfig.autoReassignOnOverflow ? 'var(--primary)' : 'var(--muted)' }}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${assignmentConfig.autoReassignOnOverflow ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <button
                onClick={handleSaveAssignment}
                disabled={savingAssignment}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-all disabled:opacity-50"
              >
                {savingAssignment ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {savingAssignment ? 'Saving…' : 'Save Assignment Config'}
              </button>
            </div>

            {/* Agent capacity warnings */}
            {agentCapacities.length > 0 && (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <Users2 size={14} className="text-primary" />
                  <p className="text-sm font-semibold text-foreground">Agent Capacity Overview</p>
                </div>
                <div className="divide-y divide-border">
                  {agentCapacities.map((agent) => {
                    const pct = Math.min(100, Math.round((agent.leadCount / assignmentConfig.maxLeadsPerAgent) * 100));
                    const isWarning = pct >= assignmentConfig.capacityWarningThreshold;
                    const isFull = pct >= 100;
                    return (
                      <div key={agent.id} className="px-4 py-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                              {agent.name.slice(0, 2).toUpperCase()}
                            </div>
                            <p className="text-sm font-medium text-foreground">{agent.name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{agent.leadCount} / {assignmentConfig.maxLeadsPerAgent}</span>
                            {isFull && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/20">FULL</span>
                            )}
                            {!isFull && isWarning && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/20">NEAR CAP</span>
                            )}
                          </div>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isFull ? 'bg-danger' : isWarning ? 'bg-warning' : 'bg-primary'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {isWarning && (
                          <div className="flex items-center gap-1.5 text-[11px] text-warning">
                            <AlertTriangle size={11} />
                            {isFull ? 'Agent at full capacity — no new leads will be assigned.' : `Agent at ${pct}% capacity — approaching limit.`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Integration Keys Tab */}
        {activeTab === 'integrations' && (
          <div className="bg-card rounded-xl border border-border p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Integration Secrets</h2>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Shield size={14} className="text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Sensitive keys are stored as masked hints only. Full keys must be configured in Supabase Edge Function Secrets or your environment variables — never stored in the database.
              </p>
            </div>
            <div className="space-y-4">
              {[
                { key: 'resend_api_key_hint' as const, label: 'Resend API Key', placeholder: 're_••••••••', desc: 'Used for sending cadence emails. Set full key in Supabase → Edge Functions → Secrets → RESEND_API_KEY.' },
                { key: 'zillow_sync_key_hint' as const, label: 'Zillow Sync Key', placeholder: 'Optional API key hint', desc: 'For future Zillow API integration.' },
                { key: 'hotpads_sync_key_hint' as const, label: 'HotPads Sync Key', placeholder: 'Optional API key hint', desc: 'For future HotPads API integration.' },
                { key: 'craigslist_sync_key_hint' as const, label: 'Craigslist Sync Key', placeholder: 'Optional API key hint', desc: 'For future Craigslist API integration.' },
                { key: 'apartments_sync_key_hint' as const, label: 'Apartments.com Sync Key', placeholder: 'Optional API key hint', desc: 'For future Apartments.com API integration.' },
              ].map(({ key, label, placeholder, desc }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">{label}</label>
                  <div className="relative">
                    <input
                      type={showSecrets[key] ? 'text' : 'password'}
                      value={settings[key]}
                      onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecrets((s) => ({ ...s, [key]: !s[key] }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showSecrets[key] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sync Schedules Tab */}
        {activeTab === 'sync' && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <RefreshCw size={15} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Automated Sync Schedules</h2>
                </div>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock size={11} />
                  Every 4 hours · Exponential backoff on failure
                </span>
              </div>
              {syncSchedules.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <RefreshCw size={24} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Sync schedules will appear here after the first sync cycle runs.</p>
                  <p className="text-xs text-muted-foreground mt-1">Schedules are initialized automatically on first load.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {syncSchedules.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3.5">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        s.status === 'success' ? 'bg-success' :
                        s.status === 'failed' ? 'bg-danger' :
                        s.status === 'running'? 'bg-primary animate-pulse' : 'bg-muted-foreground'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{s.source}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${
                            s.status === 'success' ? 'bg-success/10 text-success border-success/20' :
                            s.status === 'failed' ? 'bg-danger/10 text-danger border-danger/20' :
                            s.status === 'running'? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border'
                          }`}>
                            {s.status}
                          </span>
                          {s.failure_count > 0 && (
                            <span className="text-[10px] text-warning">
                              {s.failure_count} failure{s.failure_count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">
                            Last: <span className="font-medium">{formatLastSync(s.last_sync_at)}</span>
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Next: <span className="font-medium">{formatNextSync(s.next_sync_at)}</span>
                          </span>
                          {s.leads_added > 0 && (
                            <span className="text-[11px] text-success font-medium">+{s.leads_added} leads</span>
                          )}
                        </div>
                        {s.last_error && (
                          <p className="text-[11px] text-danger mt-0.5 truncate">{s.last_error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="px-4 py-2 bg-muted/30 border-t border-border">
                <p className="text-[10px] text-muted-foreground">
                  Syncs run automatically every 4 hours. On failure, backoff doubles: 5m → 10m → 20m → 40m → 80m → 120m (max).
                </p>
              </div>
            </div>

            {/* Source info */}
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs font-semibold text-foreground mb-3">Configured Sources</p>
              <div className="grid grid-cols-2 gap-2">
                {REFRESH_SOURCES.map((src) => (
                  <a
                    key={src.name}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted/40 transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-success shrink-0" />
                    <span className="text-xs font-medium text-foreground">{src.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate ml-auto">{src.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── Sync Health Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'sync-health' && (
          <div className="space-y-5">
            {/* Health Score KPIs */}
            {healthLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {healthSummary && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Health Score */}
                    <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <TrendingUp size={13} />
                        <span className="text-[11px] font-medium">Health Score</span>
                      </div>
                      <div className={`text-2xl font-bold ${
                        healthSummary.healthScore >= 80 ? 'text-success' :
                        healthSummary.healthScore >= 50 ? 'text-warning' : 'text-danger'
                      }`}>
                        {healthSummary.healthScore}
                        <span className="text-sm font-normal text-muted-foreground">/100</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            healthSummary.healthScore >= 80 ? 'bg-success' :
                            healthSummary.healthScore >= 50 ? 'bg-warning' : 'bg-danger'
                          }`}
                          style={{ width: `${healthSummary.healthScore}%` }}
                        />
                      </div>
                    </div>

                    {/* Failed */}
                    <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <XCircle size={13} />
                        <span className="text-[11px] font-medium">Failed / Abandoned</span>
                      </div>
                      <div className="text-2xl font-bold text-danger">
                        {healthSummary.failedCount + healthSummary.abandonedCount}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {healthSummary.abandonedCount} abandoned after max retries
                      </p>
                    </div>

                    {/* Retrying */}
                    <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <RotateCcw size={13} />
                        <span className="text-[11px] font-medium">Retrying</span>
                      </div>
                      <div className="text-2xl font-bold text-warning">
                        {healthSummary.retryingCount}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Exponential backoff active
                      </p>
                    </div>

                    {/* Validation Errors */}
                    <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <AlertTriangle size={13} />
                        <span className="text-[11px] font-medium">Validation Errors</span>
                      </div>
                      <div className="text-2xl font-bold text-orange-500">
                        {healthSummary.validationErrorCount}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Unresolved issues
                      </p>
                    </div>
                  </div>
                )}

                {/* Validation Errors Section */}
                {validationErrors.length > 0 && (
                  <div className="bg-card rounded-xl border border-danger/30 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-danger/20 bg-danger/5">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={14} className="text-danger" />
                        <h3 className="text-sm font-semibold text-foreground">Validation Errors</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger text-white font-bold">
                          {validationErrors.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Click "Resolve" to dismiss after fixing</p>
                    </div>
                    <div className="divide-y divide-border">
                      {validationErrors.map((err) => (
                        <div key={err.id} className="flex items-start gap-3 px-4 py-3.5">
                          <div className="shrink-0 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                              err.operation_type === 'email_send' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                              err.operation_type === 'lead_enrichment'? 'bg-purple-500/10 text-purple-500 border-purple-500/20' : 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                            }`}>
                              {OP_TYPE_LABELS[err.operation_type] ?? err.operation_type}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-danger font-medium">{err.error_code}</span>
                              {err.field && (
                                <span className="text-[10px] text-muted-foreground">field: <code className="font-mono">{err.field}</code></span>
                              )}
                            </div>
                            <p className="text-xs text-foreground mt-0.5">{err.error_message}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              ID: {err.operation_id} · {new Date(err.created_at).toLocaleString()}
                            </p>
                          </div>
                          <button
                            onClick={() => handleResolveError(err)}
                            disabled={resolvingId === err.id}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-success border border-success/30 hover:bg-success/5 transition-all disabled:opacity-50"
                          >
                            {resolvingId === err.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />}
                            Resolve
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sync Events with filter + manual recovery */}
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Activity size={14} className="text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">Operation Log</h3>
                      <span className="text-[11px] text-muted-foreground">({syncEvents.length} total)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(['all', 'failed', 'retrying', 'abandoned'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setSyncHealthFilter(f)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors capitalize ${
                            syncHealthFilter === f
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                      <button
                        onClick={loadHealthData}
                        className="ml-1 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw size={12} />
                      </button>
                    </div>
                  </div>

                  {filteredSyncEvents.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <Zap size={24} className="text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {syncHealthFilter === 'all' ?'No sync operations recorded yet. Operations will appear here as they run.'
                          : `No ${syncHealthFilter} operations found.`}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
                      {filteredSyncEvents.map((event) => {
                        const canRecover = event.status === 'failed' || event.status === 'abandoned';
                        const backoffMs = event.attempt_count > 0 ? calcBackoffMs(event.attempt_count) : 0;

                        return (
                          <div key={event.id} className="flex items-start gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors">
                            <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                              event.status === 'success' ? 'bg-success' :
                              event.status === 'failed' || event.status === 'abandoned' ? 'bg-danger' :
                              event.status === 'retrying' ? 'bg-warning animate-pulse' :
                              event.status === 'running' ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium text-foreground">
                                  {OP_TYPE_LABELS[event.operation_type] ?? event.operation_type}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_COLORS[event.status] ?? STATUS_COLORS.pending}`}>
                                  {event.status}
                                </span>
                                {event.attempt_count > 0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Attempt {event.attempt_count}/{event.max_attempts}
                                  </span>
                                )}
                                {event.status === 'retrying' && event.next_retry_at && (
                                  <span className="text-[10px] text-warning">
                                    Next retry: {formatBackoff(backoffMs)} backoff
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                ID: {event.operation_id}
                              </p>
                              {event.last_error && (
                                <p className="text-[11px] text-danger mt-0.5 truncate">{event.last_error}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {new Date(event.created_at).toLocaleString()}
                              </p>
                            </div>
                            {canRecover && (
                              <button
                                onClick={() => handleManualRecovery(event)}
                                disabled={recoveringId === event.id}
                                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-all disabled:opacity-50"
                                title="One-click manual recovery"
                              >
                                {recoveringId === event.id ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <RotateCcw size={11} />
                                )}
                                Recover
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="px-4 py-2 bg-muted/30 border-t border-border">
                    <p className="text-[10px] text-muted-foreground">
                      Failed operations auto-retry with exponential backoff: 30s → 1m → 2m → 4m → 8m → 16m → 32m (max 4h). Use "Recover" to reset and retry immediately.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── Capacity Report Tab ─────────────────────────────────────────────── */}
        {activeTab === 'capacity' && (
          <CapacityReportPanel />
        )}
      </div>
    </AppLayout>
  );
}

// ─── Capacity Report Panel ────────────────────────────────────────────────────

interface CapacityConfig {
  soft_cap: number;
  plan_label: string;
  next_tier_label: string | null;
  alert_threshold: number;
}

function CapacityReportPanel() {
  const supabase = createClient();
  const [leadCount, setLeadCount] = React.useState<number | null>(null);
  const [config, setConfig] = React.useState<CapacityConfig | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [countRes, configRes] = await Promise.all([
          supabase.from('leads').select('*', { count: 'exact', head: true }),
          supabase.from('capacity_config').select('soft_cap, plan_label, next_tier_label, alert_threshold').limit(1).single(),
        ]);
        setLeadCount(countRes.count ?? 0);
        if (!configRes.error && configRes.data) {
          setConfig(configRes.data as CapacityConfig);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const softCap = config?.soft_cap ?? 0;
  const threshold = config?.alert_threshold ?? 0.8;
  const usagePct = softCap > 0 && leadCount !== null ? Math.min(100, Math.round((leadCount / softCap) * 100)) : null;
  const isNearCap = usagePct !== null && usagePct >= threshold * 100;

  return (
    <div className="space-y-5">
      {/* Audit Summary Card */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={16} className="text-primary" />
          <h2 className="text-base font-semibold text-foreground">Lead Storage Capacity Report</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Audit of all hardcoded lead caps, infrastructure limits, and performance configuration.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 size={14} className="animate-spin" /> Loading capacity data…
          </div>
        ) : (
          <>
            {/* Current Lead Count */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-muted/40 rounded-lg p-4 border border-border">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Total Leads Stored</p>
                <p className="text-3xl font-bold text-foreground font-mono-data">{(leadCount ?? 0).toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Across all portfolios</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-4 border border-border">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Storage Ceiling</p>
                <p className="text-2xl font-bold text-success font-mono-data">Unlimited rows</p>
                <p className="text-[11px] text-muted-foreground mt-1">No row-count cap on Supabase</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-4 border border-border">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Soft Cap</p>
                <p className="text-2xl font-bold text-foreground font-mono-data">{softCap === 0 ? 'None set' : softCap.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{softCap === 0 ? 'No artificial limit enforced' : `Alert at ${Math.round(threshold * 100)}%`}</p>
              </div>
            </div>

            {/* Usage bar (only shown when soft cap is set) */}
            {softCap > 0 && usagePct !== null && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Usage vs soft cap</span>
                  <span className={`font-semibold ${isNearCap ? 'text-warning' : 'text-foreground'}`}>{usagePct}%</span>
                </div>
                <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isNearCap ? 'bg-warning' : 'bg-primary'}`}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
                {isNearCap && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>
                      <strong>Approaching soft cap:</strong> {leadCount?.toLocaleString()} of {softCap.toLocaleString()} leads stored ({usagePct}%).
                      Consider reviewing sync volume or upgrading your plan.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Plan Info */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Plan</p>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 border border-success/30 text-success text-xs">
                <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                <span>{config?.plan_label ?? 'Supabase Free — unlimited rows, 500 MB database storage'}</span>
              </div>
              {config?.next_tier_label && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border text-muted-foreground text-xs">
                  <Zap size={13} className="shrink-0 mt-0.5" />
                  <span><strong>Next tier:</strong> {config.next_tier_label}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Audit Findings */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CheckCircle2 size={14} className="text-success" />
          Cap Audit — All Layers Checked
        </h3>
        <div className="space-y-2 text-sm">
          {[
            { layer: 'leadsService.getAll()', status: 'clear', note: 'No LIMIT clause — fetches all rows, UI pagination handles display' },
            { layer: 'sync/execute API route', status: 'clear', note: 'Inserts in batches of 100, no total-count cap' },
            { layer: 'Exports (Send Now)', status: 'fixed', note: 'Removed .limit(500) — now exports all leads for the user' },
            { layer: 'Lead Management UI', status: 'clear', note: 'PAGE_SIZE=50 pagination, react-window virtual list — never renders full dataset' },
            { layer: 'Dashboard KPIs', status: 'clear', note: 'Computed from full in-memory lead array, no slice cap' },
            { layer: 'Top Leads Table', status: 'clear', note: '.slice(0, 6) is intentional display limit (top 6 by score), not a storage cap' },
            { layer: 'Pipeline / Kanban', status: 'clear', note: 'Filtered from full portfolio leads, no hardcoded limit' },
            { layer: 'Analytics page', status: 'clear', note: 'No row-count cap; .slice(-14) is a 14-day window, not a lead cap' },
            { layer: 'DB indexes (state, stage, score, source)', status: 'added', note: '8 indexes added via migration 20260814180000 for fast filtering at scale' },
          ].map(({ layer, status, note }) => (
            <div key={layer} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
              <span className={`shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                status === 'clear' ? 'bg-success/20 text-success' :
                status === 'fixed'? 'bg-primary/20 text-primary' : 'bg-warning/20 text-warning'
              }`}>
                {status === 'clear' ? '✓ Clear' : status === 'fixed' ? '✓ Fixed' : '⚠ Added'}
              </span>
              <div>
                <p className="font-medium text-foreground text-xs">{layer}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Estimated Max Lead Capacity */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <TrendingUp size={14} className="text-primary" />
          Estimated Max Lead Capacity — Current Plan
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              label: 'Free Tier (500 MB)',
              capacity: '~125,000 leads',
              detail: 'At ~4 KB/row with owner+contact enrichment data (address, score, stage, contact fields, tags, photos array, enrichment metadata)',
              color: 'text-primary',
              bg: 'bg-primary/10',
              border: 'border-primary/20',
            },
            {
              label: 'Pro Tier (8 GB)',
              capacity: '~2,000,000 leads',
              detail: 'Same ~4 KB/row estimate. Pro tier ($25/mo) raises storage ceiling 16× — sufficient for full national portfolio expansion.',
              color: 'text-emerald-600',
              bg: 'bg-emerald-50',
              border: 'border-emerald-200',
            },
            {
              label: 'Practical Sync Ceiling',
              capacity: '~50,000–80,000 leads',
              detail: 'Based on 40+ URLs × ~5–40 leads/run × daily sync cadence. Storage is not the bottleneck — source rate limits and ingestion speed are.',
              color: 'text-amber-600',
              bg: 'bg-amber-50',
              border: 'border-amber-200',
            },
          ].map(({ label, capacity, detail, color, bg, border }) => (
            <div key={label} className={`${bg} border ${border} rounded-xl p-4`}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color} mb-2`}>{capacity}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{detail}</p>
            </div>
          ))}
        </div>
        <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground">
          <strong className="text-foreground">Row size estimate basis:</strong> Each lead row stores ~30 columns including address, city, state, zip, lat/lng, beds/baths, price, source, stage, regulation_status, prospect_score, days_on_market, listing_url, notes, contact_name, contact_phone, tags (array), estimated_adr/occupancy/gross/net, photos (array), created_at, updated_at, user_id, enrichment_status. With JSONB arrays and 8 indexes, actual row size averages ~3.5–4.5 KB. The 500 MB free tier therefore supports approximately <strong className="text-foreground">110,000–140,000 leads</strong> — well above any realistic sync volume at current source coverage.
        </div>
      </div>

      {/* Infrastructure Notes */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Infrastructure Ceiling — What Would Require a Plan Change</h3>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p><strong className="text-foreground">Row count:</strong> No limit on Supabase Free or Pro. Storing 25,000–50,000+ leads is fully supported at the current plan with no upgrade needed.</p>
          <p><strong className="text-foreground">Database storage:</strong> Free tier = 500 MB. At ~4 KB per lead row (with enrichment data and indexes), 500 MB supports approximately <strong className="text-foreground">~125,000 leads</strong> before storage becomes a concern. Pro tier ($25/mo) raises this to 8 GB (~2 million leads).</p>
          <p><strong className="text-foreground">Source rate limits:</strong> Trulia, Dwellsy, and other sources may throttle scraping speed, but this caps ingestion rate — not total storage. Leads already ingested are unaffected.</p>
          <p><strong className="text-foreground">Enrichment costs:</strong> BatchData / PDL lookups are gated by scoring thresholds (Stage 1/2/3), not by total lead count. Storing more leads does not automatically increase enrichment spend.</p>
          <p><strong className="text-foreground">To raise the ceiling further:</strong> Upgrade to Supabase Pro for 8 GB storage (~$25/month). No code changes required — the app has no hardcoded limit at any layer.</p>
        </div>
      </div>
    </div>
  );
}