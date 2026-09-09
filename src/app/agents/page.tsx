'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import InviteAgentModal from '@/components/InviteAgentModal';
import { Users, Plus, Pencil, Trash2, MapPin, DollarSign, Shield, ChevronDown, ChevronUp, X, Check, Loader2, Phone, Mail, UserCheck, AlertCircle, UserPlus, Clock, RotateCcw, Ban, Copy, CheckCheck, LayoutDashboard, Activity, AlertTriangle, Power, PowerOff, Edit2, Save } from 'lucide-react';



interface AgentProfile {
  id: string;
  owner_user_id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  avatar_initials: string;
  bio: string;
  created_at: string;
  deactivated_at?: string | null;
  last_active_at?: string | null;
  territories?: Territory[];
  commission?: CommissionSplit | null;
  permissions?: AgentLeadPermission[];
}

interface Territory {
  id: string;
  name: string;
  states: string[];
  counties: string[];
  description: string;
  color: string;
}

interface CommissionSplit {
  id: string;
  agent_id: string;
  split_type: string;
  agent_pct: number;
  company_pct: number;
  referral_pct: number;
  notes: string;
  effective_date: string;
}

interface AgentLeadPermission {
  id: string;
  agent_id: string;
  surplus_lead_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_contact: boolean;
  can_close: boolean;
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-500/15 text-purple-400',
  manager: 'bg-blue-500/15 text-blue-400',
  agent: 'bg-emerald-500/15 text-emerald-400',
  viewer: 'bg-slate-500/15 text-slate-400',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  inactive: 'bg-slate-500/15 text-slate-400',
  suspended: 'bg-red-500/15 text-red-400',
};

// ─── Quick Role Edit Inline ───────────────────────────────────────────────────

function QuickRoleEdit({ agent, onSaved }: { agent: AgentProfile; onSaved: () => void }) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(agent.role);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await supabase.from('agent_profiles').update({ role }).eq('id', agent.id);
    setSaving(false);
    setEditing(false);
    onSaved();
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_COLORS[agent.role] || 'bg-muted text-muted-foreground'} hover:opacity-80 transition-opacity`}
        title="Click to change role"
      >
        {agent.role}
        <Edit2 size={8} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="text-xs px-1.5 py-0.5 bg-background border border-border rounded-lg focus:outline-none"
        autoFocus
      >
        {['admin', 'manager', 'agent', 'viewer'].map((r) => (
          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
        ))}
      </select>
      <button onClick={save} disabled={saving} className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded transition-colors">
        {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
      </button>
      <button onClick={() => { setEditing(false); setRole(agent.role); }} className="p-1 text-muted-foreground hover:bg-muted rounded transition-colors">
        <X size={11} />
      </button>
    </div>
  );
}

// ─── Agent Modal ──────────────────────────────────────────────────────────────

function AgentModal({
  agent,
  territories,
  onClose,
  onSave,
}: {
  agent: AgentProfile | null;
  territories: Territory[];
  onClose: () => void;
  onSave: () => void;
}) {
  const supabase = createClient();
  const { user } = useAuth();
  const isNew = !agent;

  const [form, setForm] = useState({
    full_name: agent?.full_name || '',
    email: agent?.email || '',
    phone: agent?.phone || '',
    role: agent?.role || 'agent',
    status: agent?.status || 'active',
    bio: agent?.bio || '',
  });
  const [commission, setCommission] = useState({
    agent_pct: agent?.commission?.agent_pct ?? 50,
    company_pct: agent?.commission?.company_pct ?? 50,
    referral_pct: agent?.commission?.referral_pct ?? 0,
    notes: agent?.commission?.notes || '',
    effective_date: agent?.commission?.effective_date || '',
  });
  const [selectedTerritoryIds, setSelectedTerritoryIds] = useState<string[]>(
    agent?.territories?.map((t) => t.id) || []
  );
  const [permissions, setPermissions] = useState({
    can_view: agent?.permissions?.[0]?.can_view ?? true,
    can_edit: agent?.permissions?.[0]?.can_edit ?? false,
    can_contact: agent?.permissions?.[0]?.can_contact ?? true,
    can_close: agent?.permissions?.[0]?.can_close ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'territory' | 'commission' | 'permissions'>('profile');

  const totalPct = commission.agent_pct + commission.company_pct + commission.referral_pct;

  async function handleSave() {
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('Full name and email are required.');
      return;
    }
    if (Math.abs(totalPct - 100) > 0.01) {
      setError('Commission splits must total 100%.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const initials = form.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
      let agentId = agent?.id;

      if (isNew) {
        const { data, error: insertErr } = await supabase
          .from('agent_profiles')
          .insert({ ...form, avatar_initials: initials, owner_user_id: user?.id })
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        agentId = data.id;
      } else {
        const { error: updateErr } = await supabase
          .from('agent_profiles')
          .update({ ...form, avatar_initials: initials })
          .eq('id', agent!.id);
        if (updateErr) throw updateErr;
      }

      if (agentId) {
        if (agent?.commission?.id) {
          await supabase.from('commission_splits').update({ ...commission, agent_id: agentId, owner_user_id: user?.id }).eq('id', agent.commission.id);
        } else {
          await supabase.from('commission_splits').insert({ ...commission, agent_id: agentId, owner_user_id: user?.id });
        }

        await supabase.from('agent_territory_assignments').delete().eq('agent_id', agentId);
        if (selectedTerritoryIds.length > 0) {
          await supabase.from('agent_territory_assignments').insert(
            selectedTerritoryIds.map((tid) => ({ agent_id: agentId, territory_id: tid }))
          );
        }
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save agent.');
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { key: 'profile', label: 'Profile', icon: UserCheck },
    { key: 'territory', label: 'Territory', icon: MapPin },
    { key: 'commission', label: 'Commission', icon: DollarSign },
    { key: 'permissions', label: 'Permissions', icon: Shield },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{isNew ? 'Add Agent' : 'Edit Agent'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-border px-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-all ${
                activeTab === tab.key
                  ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'profile' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Full Name *</label>
                  <input
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    placeholder="Jane Smith"
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="jane@example.com"
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {['admin', 'manager', 'agent', 'viewer'].map((r) => (
                      <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {['active', 'inactive', 'suspended'].map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Bio</label>
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  rows={3}
                  placeholder="Brief description of agent's background and specialties..."
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
            </>
          )}

          {activeTab === 'territory' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Assign territories to this agent.</p>
              {territories.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No territories created yet.</div>
              ) : (
                <div className="space-y-2">
                  {territories.map((t) => {
                    const selected = selectedTerritoryIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() =>
                          setSelectedTerritoryIds((prev) =>
                            selected ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                          )
                        }
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                          selected ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted'
                        }`}
                      >
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{t.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{t.states.join(', ')}</p>
                        </div>
                        {selected && <Check size={14} className="text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'commission' && (
            <div className="space-y-4">
              <div className={`px-3 py-2 rounded-lg text-xs font-medium ${Math.abs(totalPct - 100) < 0.01 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                Total: {totalPct.toFixed(1)}% {Math.abs(totalPct - 100) < 0.01 ? '✓ Balanced' : '— Must equal 100%'}
              </div>
              {[
                { key: 'agent_pct', label: 'Agent %' },
                { key: 'company_pct', label: 'Company %' },
                { key: 'referral_pct', label: 'Referral %' },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">{label}</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={0} max={100} step={0.5}
                      value={(commission as any)[key]}
                      onChange={(e) => setCommission((c) => ({ ...c, [key]: parseFloat(e.target.value) }))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-sm font-semibold text-foreground w-12 text-right">{(commission as any)[key]}%</span>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Effective Date</label>
                  <input
                    type="date"
                    value={commission.effective_date}
                    onChange={(e) => setCommission((c) => ({ ...c, effective_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Notes</label>
                <textarea
                  value={commission.notes}
                  onChange={(e) => setCommission((c) => ({ ...c, notes: e.target.value }))}
                  rows={2}
                  placeholder="Any special commission terms..."
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Set default lead permissions for this agent.</p>
              {[
                { key: 'can_view', label: 'View Leads', desc: 'Can see lead details and contact info' },
                { key: 'can_edit', label: 'Edit Leads', desc: 'Can update lead fields and notes' },
                { key: 'can_contact', label: 'Contact Leads', desc: 'Can send emails and log calls' },
                { key: 'can_close', label: 'Close Deals', desc: 'Can mark leads as Under Contract or Live' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-background">
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <button
                    onClick={() => setPermissions((p) => ({ ...p, [key]: !(p as any)[key] }))}
                    className={`w-10 h-5 rounded-full transition-all relative ${(permissions as any)[key] ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${(permissions as any)[key] ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertCircle size={13} />{error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isNew ? 'Add Agent' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Territory Modal ──────────────────────────────────────────────────────────

function TerritoryModal({
  territory,
  onClose,
  onSave,
}: {
  territory: Territory | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const supabase = createClient();
  const { user } = useAuth();
  const isNew = !territory;

  const [form, setForm] = useState({
    name: territory?.name || '',
    states: territory?.states || [] as string[],
    counties: territory?.counties || [] as string[],
    description: territory?.description || '',
    color: territory?.color || '#6366f1',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!form.name.trim()) { setError('Territory name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      if (isNew) {
        const { error: err } = await supabase.from('territories').insert({ ...form, owner_user_id: user?.id });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('territories').update(form).eq('id', territory!.id);
        if (err) throw err;
      }
      onSave();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save territory.');
    } finally {
      setSaving(false);
    }
  }

  const toggleState = (s: string) =>
    setForm((f) => ({
      ...f,
      states: f.states.includes(s) ? f.states.filter((x) => x !== s) : [...f.states, s],
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{isNew ? 'Create Territory' : 'Edit Territory'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Territory Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Mountain West"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-10 h-9 rounded-lg border border-border cursor-pointer bg-background"
                />
                <span className="text-xs text-muted-foreground font-mono">{form.color}</span>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">States / Regions</label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-background border border-border rounded-lg">
              {US_STATES.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleState(s)}
                  className={`px-2 py-0.5 text-xs rounded-md font-medium transition-all ${
                    form.states.includes(s) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Brief description of this territory..."
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertCircle size={13} />{error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invite types ─────────────────────────────────────────────────────────────

interface AgentInvite {
  id: string;
  invite_token: string;
  email: string;
  first_name: string;
  last_name: string;
  assigned_portfolios: string[];
  role: string;
  status: string;
  sent_at: string;
  expires_at: string;
  completed_at: string | null;
  agent_user_id: string | null;
  agent_tour_count?: number;
}

const INVITE_STATUS_STYLES: Record<string, string> = {
  invited: 'bg-amber-500/15 text-amber-400',
  expired: 'bg-slate-500/15 text-slate-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
};

function InviteRow({
  invite,
  onResend,
  onRevoke,
}: {
  invite: AgentInvite;
  onResend: (id: string) => void;
  onRevoke: (id: string) => void;
}) {
  const [actionLoading, setActionLoading] = useState<'resend' | 'revoke' | null>(null);
  const [copied, setCopied] = useState(false);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.staytrvlr.com';
  const inviteLink = `${siteUrl}/invite/${invite.invite_token}`;

  const isExpiredOrRevoked = invite.status === 'expired';
  const isCompleted = invite.status === 'completed';
  const daysLeft = Math.max(0, Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / 86400000));

  async function handleResend() {
    setActionLoading('resend');
    await onResend(invite.id);
    setActionLoading(null);
  }

  async function handleRevoke() {
    if (!confirm(`Revoke invite for ${invite.first_name} ${invite.last_name}? They won't be able to use this link.`)) return;
    setActionLoading('revoke');
    await onRevoke(invite.id);
    setActionLoading(null);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-amber-500">
            {invite.first_name[0]}{invite.last_name[0]}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{invite.first_name} {invite.last_name}</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${INVITE_STATUS_STYLES[invite.status] || 'bg-muted text-muted-foreground'}`}>
              {invite.status === 'invited' ? 'Invited' : invite.status === 'completed' ? 'Active' : 'Expired'}
            </span>
            {isCompleted && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${(invite.agent_tour_count ?? 0) > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>
                {(invite.agent_tour_count ?? 0) > 0 ? '✓ Tour Complete' : 'Tour Pending'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mail size={10} />{invite.email}
            </span>
            {invite.status === 'invited' && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock size={10} />
                {daysLeft > 0 ? `${daysLeft}d left` : 'Expires today'}
              </span>
            )}
            {isCompleted && invite.completed_at && (
              <span className="text-xs text-muted-foreground">
                Joined {new Date(invite.completed_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isCompleted && (
            <button onClick={copyLink} title="Copy invite link" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
              {copied ? <CheckCheck size={13} className="text-emerald-500" /> : <Copy size={13} />}
            </button>
          )}
          {(isExpiredOrRevoked || invite.status === 'invited') && (
            <button
              onClick={handleResend}
              disabled={actionLoading === 'resend'}
              title="Resend / regenerate invite"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-400 hover:bg-blue-500/10 transition-all disabled:opacity-50"
            >
              {actionLoading === 'resend' ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
              Resend
            </button>
          )}
          {invite.status === 'invited' && (
            <button
              onClick={handleRevoke}
              disabled={actionLoading === 'revoke'}
              title="Revoke invite"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
            >
              {actionLoading === 'revoke' ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
              Revoke
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Dashboard Tab ──────────────────────────────────────────────────────

function AdminDashboardTab({
  agents,
  invites,
  onDeactivate,
  onReactivate,
  onRoleChange,
  onResendInvite,
  onRevokeInvite,
}: {
  agents: AgentProfile[];
  invites: AgentInvite[];
  onDeactivate: (id: string) => void;
  onReactivate: (id: string) => void;
  onRoleChange: () => void;
  onResendInvite: (id: string) => void;
  onRevokeInvite: (id: string) => void;
}) {
  const activeAgents = agents.filter((a) => a.status === 'active');
  const inactiveAgents = agents.filter((a) => a.status === 'inactive' || a.status === 'suspended');
  const pendingInvites = invites.filter((i) => i.status === 'invited');
  const expiredInvites = invites.filter((i) => i.status === 'expired');

  return (
    <div className="space-y-6">
      {/* KPI summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Agents', value: activeAgents.length, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Inactive / Suspended', value: inactiveAgents.length, color: 'text-slate-400', bg: 'bg-slate-500/10' },
          { label: 'Pending Invites', value: pendingInvites.length, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          { label: 'Expired Invites', value: expiredInvites.length, color: 'text-red-400', bg: 'bg-red-500/10' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-border rounded-xl px-4 py-3 text-center`}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Active agents with quick role edit + deactivate */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} className="text-emerald-500" />
          <h3 className="text-sm font-semibold text-foreground">Active Agents</h3>
          <span className="text-xs text-muted-foreground">({activeAgents.length})</span>
        </div>
        {activeAgents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No active agents.</p>
        ) : (
          <div className="space-y-2">
            {activeAgents.map((agent) => (
              <div key={agent.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{agent.avatar_initials || agent.full_name.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{agent.full_name}</p>
                    <QuickRoleEdit agent={agent} onSaved={onRoleChange} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Permissions summary */}
                  <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    <Shield size={9} />
                    {agent.role}
                  </span>
                  <button
                    onClick={() => onDeactivate(agent.id)}
                    title="Deactivate agent"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-500/10 transition-all"
                  >
                    <PowerOff size={11} />
                    <span className="hidden sm:inline">Deactivate</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inactive agents */}
      {inactiveAgents.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Inactive / Suspended</h3>
            <span className="text-xs text-muted-foreground">({inactiveAgents.length})</span>
          </div>
          <div className="space-y-2">
            {inactiveAgents.map((agent) => (
              <div key={agent.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 opacity-75">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-muted-foreground">{agent.avatar_initials || agent.full_name.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{agent.full_name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[agent.status]}`}>{agent.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                  {agent.deactivated_at && (
                    <p className="text-[10px] text-muted-foreground">Deactivated {new Date(agent.deactivated_at).toLocaleDateString()}</p>
                  )}
                </div>
                <button
                  onClick={() => onReactivate(agent.id)}
                  title="Reactivate agent"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-500 hover:bg-emerald-500/10 transition-all shrink-0"
                >
                  <Power size={11} />
                  <span className="hidden sm:inline">Reactivate</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Pending Invites</h3>
            <span className="text-xs text-muted-foreground">({pendingInvites.length})</span>
          </div>
          <div className="space-y-2">
            {pendingInvites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} onResend={onResendInvite} onRevoke={onRevokeInvite} />
            ))}
          </div>
        </div>
      )}

      {/* Expired invites needing resend */}
      {expiredInvites.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={14} className="text-red-400" />
            <h3 className="text-sm font-semibold text-foreground">Expired Invites</h3>
            <span className="text-xs text-muted-foreground">— resend to re-activate</span>
          </div>
          <div className="space-y-2">
            {expiredInvites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} onResend={onResendInvite} onRevoke={onRevokeInvite} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const supabase = createClient();
  const { user } = useAuth();

  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [invites, setInvites] = useState<AgentInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'agents' | 'invites' | 'territories'>('dashboard');
  const [agentModal, setAgentModal] = useState<{ open: boolean; agent: AgentProfile | null }>({ open: false, agent: null });
  const [territoryModal, setTerritoryModal] = useState<{ open: boolean; territory: Territory | null }>({ open: false, territory: null });
  const [inviteModal, setInviteModal] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [agentsRes, territoriesRes, invitesRes] = await Promise.all([
        supabase.from('agent_profiles').select('*').eq('owner_user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('territories').select('*').eq('owner_user_id', user.id).order('name'),
        supabase.from('agent_invites').select('*').eq('invited_by', user.id).order('created_at', { ascending: false }),
      ]);

      const agentList: AgentProfile[] = agentsRes.data || [];

      if (agentList.length > 0) {
        const agentIds = agentList.map((a) => a.id);
        const [commRes, assignRes] = await Promise.all([
          supabase.from('commission_splits').select('*').in('agent_id', agentIds),
          supabase.from('agent_territory_assignments').select('*, territories(*)').in('agent_id', agentIds),
        ]);

        agentList.forEach((agent) => {
          agent.commission = commRes.data?.find((c) => c.agent_id === agent.id) || null;
          agent.territories = (assignRes.data || [])
            .filter((a) => a.agent_id === agent.id)
            .map((a) => (a as any).territories)
            .filter(Boolean);
        });
      }

      const inviteList: AgentInvite[] = invitesRes.data || [];
      const completedWithUser = inviteList.filter((i) => i.status === 'completed' && i.agent_user_id);
      if (completedWithUser.length > 0) {
        const userIds = completedWithUser.map((i) => i.agent_user_id!);
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, tour_view_count')
          .in('id', userIds);

        inviteList.forEach((inv) => {
          if (inv.agent_user_id) {
            const profile = profiles?.find((p) => p.id === inv.agent_user_id);
            inv.agent_tour_count = profile?.tour_view_count ?? 0;
          }
        });
      }

      setAgents(agentList);
      setTerritories(territoriesRes.data || []);
      setInvites(inviteList);
    } catch (err) {
      console.error('Failed to load agents data', err);
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  async function deleteAgent(id: string) {
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    await supabase.from('agent_profiles').delete().eq('id', id);
    loadData();
  }

  async function deactivateAgent(id: string) {
    if (!confirm('Deactivate this agent? They will lose access until reactivated.')) return;
    await supabase.from('agent_profiles').update({ status: 'inactive', deactivated_at: new Date().toISOString() }).eq('id', id);
    loadData();
  }

  async function reactivateAgent(id: string) {
    await supabase.from('agent_profiles').update({ status: 'active', deactivated_at: null }).eq('id', id);
    loadData();
  }

  async function deleteTerritory(id: string) {
    if (!confirm('Delete this territory?')) return;
    await supabase.from('territories').delete().eq('id', id);
    loadData();
  }

  async function handleResendInvite(inviteId: string) {
    await fetch('/api/agent-invite/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId }),
    });
    loadData();
  }

  async function handleRevokeInvite(inviteId: string) {
    await fetch('/api/agent-invite/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId }),
    });
    loadData();
  }

  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const pendingInvites = invites.filter((i) => i.status === 'invited').length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground">Agent Management</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {agents.length} agents · {activeAgents} active · {territories.length} territories
              {pendingInvites > 0 && ` · ${pendingInvites} invite${pendingInvites !== 1 ? 's' : ''} pending`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary border border-primary/20 text-sm font-semibold rounded-xl hover:bg-primary/20 transition-all"
            >
              <UserPlus size={15} />
              Invite Agent
            </button>
            <button
              onClick={() =>
                activeTab === 'agents'
                  ? setAgentModal({ open: true, agent: null })
                  : activeTab === 'territories'
                  ? setTerritoryModal({ open: true, territory: null })
                  : setInviteModal(true)
              }
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all"
            >
              <Plus size={15} />
              {activeTab === 'agents' ? 'Add Agent' : activeTab === 'territories' ? 'New Territory' : 'Invite Agent'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6 bg-card shrink-0 overflow-x-auto">
          {[
            { key: 'dashboard', label: 'Admin Dashboard', icon: LayoutDashboard, badge: undefined },
            { key: 'agents', label: 'Agent Profiles', icon: Users, badge: undefined },
            {
              key: 'invites',
              label: 'Invites & Onboarding',
              icon: UserPlus,
              badge: pendingInvites > 0 ? String(pendingInvites) : undefined,
            },
            { key: 'territories', label: 'Territories', icon: MapPin, badge: undefined },
          ].map(({ key, label, icon: TabIcon, badge }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                activeTab === key
                  ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {React.createElement(TabIcon, { size: 14 })}
              {label}
              {badge && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === 'dashboard' ? (
            <AdminDashboardTab
              agents={agents}
              invites={invites}
              onDeactivate={deactivateAgent}
              onReactivate={reactivateAgent}
              onRoleChange={loadData}
              onResendInvite={handleResendInvite}
              onRevokeInvite={handleRevokeInvite}
            />
          ) : activeTab === 'agents' ? (
            agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users size={40} className="text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No agents yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use <strong>Invite Agent</strong> to onboard a new hire, or Add Agent to create a profile manually.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {agents.map((agent) => {
                  const expanded = expandedAgent === agent.id;
                  return (
                    <div key={agent.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-4 px-5 py-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-primary">{agent.avatar_initials || agent.full_name.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-foreground">{agent.full_name}</p>
                            <QuickRoleEdit agent={agent} onSaved={loadData} />
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[agent.status] || 'bg-muted text-muted-foreground'}`}>
                              {agent.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail size={10} />{agent.email}
                            </span>
                            {agent.phone && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone size={10} />{agent.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right mr-2">
                            <p className="text-xs text-muted-foreground">Commission</p>
                            <p className="text-sm font-semibold text-foreground">{agent.commission?.agent_pct ?? 50}%</p>
                          </div>
                          {agent.status === 'active' ? (
                            <button
                              onClick={() => deactivateAgent(agent.id)}
                              title="Deactivate agent"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                            >
                              <PowerOff size={13} />
                            </button>
                          ) : (
                            <button
                              onClick={() => reactivateAgent(agent.id)}
                              title="Reactivate agent"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                            >
                              <Power size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => setAgentModal({ open: true, agent })}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => deleteAgent(agent.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 size={13} />
                          </button>
                          <button
                            onClick={() => setExpandedAgent(expanded ? null : agent.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                          >
                            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="border-t border-border px-5 py-4 bg-muted/30 grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Territories</p>
                            {agent.territories && agent.territories.length > 0 ? (
                              <div className="space-y-1">
                                {agent.territories.map((t) => (
                                  <div key={t.id} className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                                    <span className="text-xs text-foreground">{t.name}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">No territories assigned</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Commission Split</p>
                            {agent.commission ? (
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Agent</span>
                                  <span className="font-semibold text-foreground">{agent.commission.agent_pct}%</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Company</span>
                                  <span className="font-semibold text-foreground">{agent.commission.company_pct}%</span>
                                </div>
                                {agent.commission.referral_pct > 0 && (
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Referral</span>
                                    <span className="font-semibold text-foreground">{agent.commission.referral_pct}%</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">Default 50/50</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bio</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{agent.bio || 'No bio provided.'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : activeTab === 'invites' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Pending', count: invites.filter((i) => i.status === 'invited').length, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                  { label: 'Active', count: invites.filter((i) => i.status === 'completed').length, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                  { label: 'Tour Complete', count: invites.filter((i) => i.status === 'completed' && (i.agent_tour_count ?? 0) > 0).length, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                ].map(({ label, count, color, bg }) => (
                  <div key={label} className={`${bg} border border-border rounded-xl px-4 py-3 text-center`}>
                    <p className={`text-2xl font-bold ${color}`}>{count}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {invites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <UserPlus size={40} className="text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-foreground">No invites sent yet</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Use "Invite Agent" to onboard a new hire.</p>
                  <button
                    onClick={() => setInviteModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all"
                  >
                    <UserPlus size={14} />
                    Send First Invite
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {invites.map((invite) => (
                    <InviteRow
                      key={invite.id}
                      invite={invite}
                      onResend={handleResendInvite}
                      onRevoke={handleRevokeInvite}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            territories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <MapPin size={40} className="text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">No territories yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create territories to assign to agents.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {territories.map((t) => {
                  const assignedCount = agents.filter((a) => a.territories?.some((at) => at.id === t.id)).length;
                  return (
                    <div key={t.id} className="bg-card border border-border rounded-2xl p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                          <p className="text-sm font-semibold text-foreground">{t.name}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setTerritoryModal({ open: true, territory: t })}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => deleteTerritory(t.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                      <div className="flex flex-wrap gap-1">
                        {t.states.slice(0, 8).map((s) => (
                          <span key={s} className="px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] rounded font-medium">{s}</span>
                        ))}
                        {t.states.length > 8 && (
                          <span className="px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] rounded font-medium">+{t.states.length - 8}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                        <Users size={11} className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{assignedCount} agent{assignedCount !== 1 ? 's' : ''} assigned</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>

      {agentModal.open && (
        <AgentModal
          agent={agentModal.agent}
          territories={territories}
          onClose={() => setAgentModal({ open: false, agent: null })}
          onSave={loadData}
        />
      )}
      {territoryModal.open && (
        <TerritoryModal
          territory={territoryModal.territory}
          onClose={() => setTerritoryModal({ open: false, territory: null })}
          onSave={loadData}
        />
      )}
      {inviteModal && (
        <InviteAgentModal
          onClose={() => setInviteModal(false)}
          onInviteSent={() => { loadData(); setActiveTab('invites'); }}
          invitedBy={user?.id}
        />
      )}
    </AppLayout>
  );
}
