'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, Users, Key, Lock, RefreshCw, Loader2, AlertCircle, CheckCircle2, Search, Eye, Download, RotateCcw, BarChart2, Settings2, History, Monitor, Wifi, WifiOff, Edit2, Save, X,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  app_role: string;
  perm_lead_access: boolean;
  perm_export: boolean;
  perm_sync: boolean;
  perm_pipeline: boolean;
  perm_analytics: boolean;
  perm_settings: boolean;
  last_active_at: string | null;
  session_count: number;
  created_at: string;
}

interface AuditEntry {
  id: string;
  target_user_id: string;
  changed_by: string | null;
  change_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  notes: string;
  created_at: string;
  target_email?: string;
  changer_email?: string;
}

interface ActiveSession {
  id: string;
  user_id: string;
  ip_address: string;
  user_agent: string;
  started_at: string;
  last_seen_at: string;
  is_active: boolean;
  user_email?: string;
}

interface RoleTemplate {
  id: string;
  name: string;
  label: string;
  description: string;
  perm_lead_access: boolean;
  perm_export: boolean;
  perm_sync: boolean;
  perm_pipeline: boolean;
  perm_analytics: boolean;
  perm_settings: boolean;
}

type Tab = 'members' | 'sessions' | 'audit';

const PERMISSION_LABELS: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  perm_lead_access: { label: 'Lead Access', icon: <Users size={12} />, description: 'View and manage leads' },
  perm_export: { label: 'Export', icon: <Download size={12} />, description: 'Export leads to CSV' },
  perm_sync: { label: 'Sync', icon: <RotateCcw size={12} />, description: 'Run data source syncs' },
  perm_pipeline: { label: 'Pipeline', icon: <BarChart2 size={12} />, description: 'Manage pipeline stages' },
  perm_analytics: { label: 'Analytics', icon: <Eye size={12} />, description: 'View analytics & reports' },
  perm_settings: { label: 'Settings', icon: <Settings2 size={12} />, description: 'Modify system settings' },
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  agent: 'bg-blue-100 text-blue-700 border-blue-200',
  homeowner: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const CHANGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  role_change: { label: 'Role Changed', color: 'text-purple-600 bg-purple-50' },
  permission_change: { label: 'Permission Changed', color: 'text-blue-600 bg-blue-50' },
  invite: { label: 'Invited', color: 'text-emerald-600 bg-emerald-50' },
  deactivate: { label: 'Deactivated', color: 'text-red-600 bg-red-50' },
  reactivate: { label: 'Reactivated', color: 'text-emerald-600 bg-emerald-50' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminRolesPage() {
  const supabase = createClient();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('members');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TeamMember>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load team members
      const { data: membersData, error: membersErr } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, app_role, perm_lead_access, perm_export, perm_sync, perm_pipeline, perm_analytics, perm_settings, last_active_at, session_count, created_at')
        .order('created_at', { ascending: false });
      if (membersErr) throw membersErr;
      setMembers(membersData || []);

      // Load audit log
      const { data: auditData, error: auditErr } = await supabase
        .from('user_access_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (auditErr) throw auditErr;

      // Enrich audit with emails
      const enrichedAudit: AuditEntry[] = (auditData || []).map((entry) => {
        const targetMember = (membersData || []).find((m) => m.id === entry.target_user_id);
        const changerMember = (membersData || []).find((m) => m.id === entry.changed_by);
        return {
          ...entry,
          target_email: targetMember?.email || entry.target_user_id?.slice(0, 8) + '...',
          changer_email: changerMember?.email || (entry.changed_by ? entry.changed_by.slice(0, 8) + '...' : 'System'),
        };
      });
      setAuditLog(enrichedAudit);

      // Load active sessions
      const { data: sessionsData, error: sessionsErr } = await supabase
        .from('active_sessions')
        .select('*')
        .eq('is_active', true)
        .order('last_seen_at', { ascending: false });
      if (sessionsErr) throw sessionsErr;

      const enrichedSessions: ActiveSession[] = (sessionsData || []).map((s) => {
        const member = (membersData || []).find((m) => m.id === s.user_id);
        return { ...s, user_email: member?.email || s.user_id?.slice(0, 8) + '...' };
      });
      setSessions(enrichedSessions);

      // Load role templates
      const { data: templatesData } = await supabase
        .from('role_permission_templates')
        .select('*')
        .order('name');
      setRoleTemplates(templatesData || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function startEdit(member: TeamMember) {
    setEditingMember(member.id);
    setEditDraft({
      app_role: member.app_role,
      perm_lead_access: member.perm_lead_access,
      perm_export: member.perm_export,
      perm_sync: member.perm_sync,
      perm_pipeline: member.perm_pipeline,
      perm_analytics: member.perm_analytics,
      perm_settings: member.perm_settings,
    });
  }

  function applyTemplate(templateName: string) {
    const tpl = roleTemplates.find((t) => t.name === templateName);
    if (!tpl) return;
    setEditDraft((prev) => ({
      ...prev,
      perm_lead_access: tpl.perm_lead_access,
      perm_export: tpl.perm_export,
      perm_sync: tpl.perm_sync,
      perm_pipeline: tpl.perm_pipeline,
      perm_analytics: tpl.perm_analytics,
      perm_settings: tpl.perm_settings,
    }));
  }

  async function saveEdit(member: TeamMember) {
    setSaving(true);
    try {
      const oldValue = {
        app_role: member.app_role,
        perm_lead_access: member.perm_lead_access,
        perm_export: member.perm_export,
        perm_sync: member.perm_sync,
        perm_pipeline: member.perm_pipeline,
        perm_analytics: member.perm_analytics,
        perm_settings: member.perm_settings,
      };

      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update({
          app_role: editDraft.app_role,
          perm_lead_access: editDraft.perm_lead_access,
          perm_export: editDraft.perm_export,
          perm_sync: editDraft.perm_sync,
          perm_pipeline: editDraft.perm_pipeline,
          perm_analytics: editDraft.perm_analytics,
          perm_settings: editDraft.perm_settings,
        })
        .eq('id', member.id);
      if (updateErr) throw updateErr;

      // Log the change
      const changeType = editDraft.app_role !== member.app_role ? 'role_change' : 'permission_change';
      await supabase.from('user_access_audit').insert({
        target_user_id: member.id,
        changed_by: user?.id ?? null,
        change_type: changeType,
        old_value: oldValue,
        new_value: editDraft,
        notes: `Updated by ${user?.email || 'admin'}`,
      });

      toast.success('Permissions updated');
      setEditingMember(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function revokeSession(sessionId: string) {
    const { error } = await supabase
      .from('active_sessions')
      .update({ is_active: false })
      .eq('id', sessionId);
    if (error) { toast.error('Failed to revoke session'); return; }
    toast.success('Session revoked');
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }

  const filteredMembers = members.filter((m) =>
    !searchQuery ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              Admin — Roles &amp; Permissions
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage team roles, granular feature permissions, active sessions, and access audit log.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Team Members', value: members.length, icon: <Users size={14} className="text-primary" /> },
            { label: 'Active Sessions', value: sessions.length, icon: <Monitor size={14} className="text-emerald-500" /> },
            { label: 'Admins', value: members.filter((m) => m.app_role === 'admin').length, icon: <Shield size={14} className="text-purple-500" /> },
            { label: 'Audit Events', value: auditLog.length, icon: <History size={14} className="text-amber-500" /> },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">{stat.icon}</div>
              <div>
                <p className="text-lg font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {([
            { key: 'members', label: 'Team Members', icon: <Users size={13} /> },
            { key: 'sessions', label: 'Active Sessions', icon: <Monitor size={13} /> },
            { key: 'audit', label: 'Audit Log', icon: <History size={13} /> },
          ] as { key: Tab; label: string; icon: React.ReactNode }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Team Members Tab ── */}
        {tab === 'members' && (
          <div className="space-y-4">
            {/* Search + role templates info */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Key size={12} />
                <span>{roleTemplates.length} role templates available</span>
              </div>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No team members found</div>
            ) : (
              <div className="space-y-2">
                {filteredMembers.map((member) => {
                  const isEditing = editingMember === member.id;
                  const draft = isEditing ? editDraft : member;
                  return (
                    <div key={member.id} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start gap-4 flex-wrap">
                        {/* Avatar + info */}
                        <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold shrink-0">
                            {(member.full_name || member.email).slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{member.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                            {member.last_active_at && (
                              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                Active {timeAgo(member.last_active_at)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Role badge + edit */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isEditing ? (
                            <select
                              value={editDraft.app_role || 'agent'}
                              onChange={(e) => setEditDraft((p) => ({ ...p, app_role: e.target.value }))}
                              className="text-xs px-2 py-1 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              <option value="admin">Admin</option>
                              <option value="agent">Agent</option>
                              <option value="homeowner">Homeowner</option>
                            </select>
                          ) : (
                            <span className={`text-xs px-2 py-1 rounded-full border font-medium ${ROLE_COLORS[member.app_role] || 'bg-muted text-muted-foreground border-border'}`}>
                              {member.app_role}
                            </span>
                          )}

                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => saveEdit(member)}
                                disabled={saving}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                              >
                                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                Save
                              </button>
                              <button
                                onClick={() => setEditingMember(null)}
                                className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEdit(member)}
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground transition-colors"
                              title="Edit permissions"
                            >
                              <Edit2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Permissions grid */}
                      <div className="mt-3 pt-3 border-t border-border">
                        {isEditing && (
                          <div className="mb-2 flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">Apply template:</span>
                            {roleTemplates.map((tpl) => (
                              <button
                                key={tpl.name}
                                onClick={() => applyTemplate(tpl.name)}
                                className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted hover:bg-muted/80 text-foreground transition-colors"
                              >
                                {tpl.label}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {Object.entries(PERMISSION_LABELS).map(([key, cfg]) => {
                            const permKey = key as keyof TeamMember;
                            const isGranted = isEditing
                              ? !!(editDraft[permKey as keyof typeof editDraft])
                              : !!(member[permKey]);
                            return (
                              <button
                                key={key}
                                type="button"
                                disabled={!isEditing}
                                onClick={() => {
                                  if (isEditing) {
                                    setEditDraft((p) => ({ ...p, [key]: !p[key as keyof typeof p] }));
                                  }
                                }}
                                title={cfg.description}
                                className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-xs font-medium transition-all ${
                                  isGranted
                                    ? 'bg-primary/10 border-primary/30 text-primary' :'bg-muted/40 border-border text-muted-foreground'
                                } ${isEditing ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                              >
                                {cfg.icon}
                                <span className="text-[10px] leading-tight text-center">{cfg.label}</span>
                                {isGranted
                                  ? <CheckCircle2 size={9} className="text-primary" />
                                  : <Lock size={9} className="text-muted-foreground/50" />
                                }
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Active Sessions Tab ── */}
        {tab === 'sessions' && (
          <div className="space-y-3">
            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-12 text-center">
                <WifiOff size={32} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No active sessions found</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <Wifi size={14} className="text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-medium text-foreground">{session.user_email}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.ip_address || 'Unknown IP'} · Last seen {timeAgo(session.last_seen_at)}
                    </p>
                    {session.user_agent && (
                      <p className="text-[10px] text-muted-foreground/60 truncate max-w-xs mt-0.5">
                        {session.user_agent}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    Started {timeAgo(session.started_at)}
                  </div>
                  <button
                    onClick={() => revokeSession(session.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors shrink-0"
                  >
                    <X size={11} /> Revoke
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Audit Log Tab ── */}
        {tab === 'audit' && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <History size={14} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Access Change History</h3>
              <span className="ml-auto text-xs text-muted-foreground">{auditLog.length} events</span>
            </div>
            {loading ? (
              <div className="p-4 space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : auditLog.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No audit events yet</div>
            ) : (
              <div className="divide-y divide-border">
                {auditLog.map((entry) => {
                  const typeInfo = CHANGE_TYPE_LABELS[entry.change_type] || { label: entry.change_type, color: 'text-muted-foreground bg-muted' };
                  return (
                    <div key={entry.id} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                      <div className={`mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${typeInfo.color}`}>
                        {typeInfo.label}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">
                          <span className="font-medium">{entry.target_email}</span>
                          {entry.changer_email && entry.changer_email !== 'System' && (
                            <span className="text-muted-foreground"> · by {entry.changer_email}</span>
                          )}
                        </p>
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{entry.notes}</p>
                        )}
                        {entry.old_value && entry.new_value && (
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="line-through opacity-60">
                              {JSON.stringify(entry.old_value).slice(0, 60)}
                            </span>
                            <span>→</span>
                            <span>{JSON.stringify(entry.new_value).slice(0, 60)}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{timeAgo(entry.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
