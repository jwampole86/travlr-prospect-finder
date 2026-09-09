'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { HelpButton } from '@/components/OnboardingTourEngine';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { User, Mail, Phone, Bell, LayoutDashboard, Clock, Save, CheckCircle, Loader2, Smartphone, Monitor, ChevronDown, ChevronUp, Edit2, Camera, Grid, List, BarChart2 } from 'lucide-react';



// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkingHours {
  enabled: boolean;
  start: string;
  end: string;
}

interface AgentProfile {
  name: string;
  email: string;
  phone: string;
  role: string;
  timezone: string;
  avatarInitials: string;
}

interface NotificationPrefs {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  leadAssigned: boolean;
  escalation: boolean;
  deliveryFailure: boolean;
  weeklyDigest: boolean;
  systemAlerts: boolean;
}

interface DashboardPrefs {
  layout: 'bento' | 'list' | 'compact';
  defaultView: 'dashboard' | 'lead-management' | 'cadence-performance';
  showKPIs: boolean;
  showActivityFeed: boolean;
  showTopLeads: boolean;
  showFunnel: boolean;
}

interface WorkingHoursPrefs {
  monday: WorkingHours;
  tuesday: WorkingHours;
  wednesday: WorkingHours;
  thursday: WorkingHours;
  friday: WorkingHours;
  saturday: WorkingHours;
  sunday: WorkingHours;
}

// ─── Initial State ────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: AgentProfile = {
  name: 'Alex Rivera',
  email: 'alex.rivera@travlrpro.com',
  phone: '+1 (555) 234-5678',
  role: 'Senior Agent',
  timezone: 'America/New_York',
  avatarInitials: 'AR',
};

const DEFAULT_NOTIF: NotificationPrefs = {
  inApp: true,
  email: true,
  sms: false,
  leadAssigned: true,
  escalation: true,
  deliveryFailure: true,
  weeklyDigest: true,
  systemAlerts: false,
};

const DEFAULT_DASH: DashboardPrefs = {
  layout: 'bento',
  defaultView: 'dashboard',
  showKPIs: true,
  showActivityFeed: true,
  showTopLeads: true,
  showFunnel: true,
};

const DEFAULT_HOURS: WorkingHoursPrefs = {
  monday: { enabled: true, start: '09:00', end: '17:00' },
  tuesday: { enabled: true, start: '09:00', end: '17:00' },
  wednesday: { enabled: true, start: '09:00', end: '17:00' },
  thursday: { enabled: true, start: '09:00', end: '17:00' },
  friday: { enabled: true, start: '09:00', end: '17:00' },
  saturday: { enabled: false, start: '10:00', end: '14:00' },
  sunday: { enabled: false, start: '10:00', end: '14:00' },
};

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'UTC',
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

// ─── Toggle Component ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`}
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const SectionIcon = icon;
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <SectionIcon size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {open ? <ChevronUp size={15} className="text-muted-foreground" /> : <ChevronDown size={15} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-border pt-4">{children}</div>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentProfilePage() {
  const { user, role } = useAuth();
  const supabase = createClient();
  const [profile, setProfile] = useState<AgentProfile>(DEFAULT_PROFILE);
  const [notif, setNotif] = useState<NotificationPrefs>(DEFAULT_NOTIF);
  const [dash, setDash] = useState<DashboardPrefs>(DEFAULT_DASH);
  const [hours, setHours] = useState<WorkingHoursPrefs>(DEFAULT_HOURS);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('email, full_name, avatar_url, notification_preferences')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error('Unable to load profile preferences');
      } else {
        const preferences = (data?.notification_preferences || {}) as Partial<{
          notif: NotificationPrefs;
          dash: DashboardPrefs;
          hours: WorkingHoursPrefs;
          timezone: string;
          phone: string;
        }>;
        setProfile((current) => ({
          ...current,
          name: data?.full_name || user.user_metadata?.full_name || current.name,
          email: data?.email || user.email || current.email,
          phone: preferences.phone || user.user_metadata?.phone || current.phone,
          role: role === 'owner' ? 'Owner' : role === 'admin' ? 'Administrator' : 'Agent',
          avatarInitials: (data?.full_name || user.email || current.name)
            .split(/\s+/)
            .map((part: string) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
          timezone: preferences.timezone || current.timezone,
        }));
        if (preferences.notif) setNotif({ ...DEFAULT_NOTIF, ...preferences.notif });
        if (preferences.dash) setDash({ ...DEFAULT_DASH, ...preferences.dash });
        if (preferences.hours) setHours({ ...DEFAULT_HOURS, ...preferences.hours });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [role, supabase, user]);

  const handleSave = async () => {
    if (!user?.id || saving) return;
    setSaving(true);
    setSaved(false);
    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: profile.name, phone: profile.phone },
    });
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        email: profile.email,
        full_name: profile.name,
        notification_preferences: {
          notif,
          dash,
          hours,
          timezone: profile.timezone,
          phone: profile.phone,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    setSaving(false);
    if (authError || profileError) {
      toast.error(authError?.message || profileError?.message || 'Unable to save preferences');
      return;
    }
    setSaved(true);
    toast.success('Profile and preferences saved');
    setTimeout(() => setSaved(false), 2500);
  };

  const updateHours = (day: typeof DAYS[number], field: keyof WorkingHours, value: string | boolean) => {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        {loading && (
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            Loading your profile preferences…
          </div>
        )}
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground">Agent Profile & Preferences</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your name, contact info, notification channels, dashboard layout, and working hours</p>
          </div>
          <div className="flex items-center gap-2">
            <HelpButton screenId="dashboard" />
            <button
              onClick={handleSave}
              disabled={loading || saving}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                saved
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600' :'bg-primary text-primary-foreground hover:opacity-90'
              }`}
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : saved ? <><CheckCircle size={14} /> Saved</> : <><Save size={14} /> Save Changes</>}
            </button>
          </div>
        </div>

        {/* Avatar + Profile Summary */}
        <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
              {profile.avatarInitials}
            </div>
            <button className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors">
              <Camera size={11} className="text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-foreground">{profile.name}</p>
            <p className="text-sm text-muted-foreground">{profile.role}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{profile.email} · {profile.timezone}</p>
          </div>
          <button
            onClick={() => setEditingProfile((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <Edit2 size={12} /> Edit
          </button>
        </div>

        {/* Profile Fields */}
        {editingProfile && (
          <Section title="Profile Information" icon={User}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Full Name', key: 'name', icon: User, type: 'text' },
                { label: 'Email Address', key: 'email', icon: Mail, type: 'email' },
                { label: 'Phone Number', key: 'phone', icon: Phone, type: 'tel' },
                { label: 'Role / Title', key: 'role', icon: User, type: 'text' },
              ].map(({ label, key, icon, type }) => {
                const FieldIcon = icon;
                return (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
                  <div className="relative">
                    <FieldIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={type}
                      value={(profile as Record<string, string>)[key]}
                      onChange={(e) => setProfile((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                );
              })}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Timezone</label>
                <select
                  value={profile.timezone}
                  onChange={(e) => setProfile((prev) => ({ ...prev, timezone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
          </Section>
        )}

        {/* Notification Channels */}
        <Section title="Notification Channels" icon={Bell}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Choose how you receive notifications from TRAVLR Pro.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { key: 'inApp', label: 'In-App', icon: Monitor, desc: 'Notification drawer & toasts' },
                { key: 'email', label: 'Email', icon: Mail, desc: 'Sent to your registered email' },
                { key: 'sms', label: 'SMS', icon: Smartphone, desc: 'Sent to your phone number' },
              ].map(({ key, label, icon, desc }) => {
                const CIcon = icon;
                return (
                <div
                  key={key}
                  className={`flex flex-col gap-2 p-3.5 rounded-xl border transition-colors ${(notif as Record<string, boolean>)[key] ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CIcon size={14} className={(notif as Record<string, boolean>)[key] ? 'text-primary' : 'text-muted-foreground'} />
                      <span className="text-sm font-semibold text-foreground">{label}</span>
                    </div>
                    <Toggle
                      checked={(notif as Record<string, boolean>)[key]}
                      onChange={(v) => setNotif((prev) => ({ ...prev, [key]: v }))}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{desc}</p>
                </div>
                );
              })}
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Notification Types</p>
              <div className="space-y-2.5">
                {[
                  { key: 'leadAssigned', label: 'Lead Assigned to Me', desc: 'When a new lead is assigned to your queue' },
                  { key: 'escalation', label: 'Escalation Alerts', desc: 'When a lead escalates or requires immediate action' },
                  { key: 'deliveryFailure', label: 'Delivery Failures', desc: 'SMS/email delivery failures on your leads' },
                  { key: 'weeklyDigest', label: 'Weekly Performance Digest', desc: 'Summary of your metrics every Monday morning' },
                  { key: 'systemAlerts', label: 'System & Ops Alerts', desc: 'Platform downtime, sync failures, API issues' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between gap-3 py-1.5">
                    <div>
                      <p className="text-sm text-foreground font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Toggle
                      checked={(notif as Record<string, boolean>)[key]}
                      onChange={(v) => setNotif((prev) => ({ ...prev, [key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Dashboard Layout Presets */}
        <Section title="Dashboard Layout Presets" icon={LayoutDashboard}>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Layout Style</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'bento', label: 'Bento Grid', icon: Grid },
                  { value: 'list', label: 'List View', icon: List },
                  { value: 'compact', label: 'Compact', icon: BarChart2 },
                ].map(({ value, label, icon }) => {
                  const LIcon = icon;
                  return (
                  <button
                    key={value}
                    onClick={() => setDash((prev) => ({ ...prev, layout: value as DashboardPrefs['layout'] }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-colors ${
                      dash.layout === value
                        ? 'border-primary/40 bg-primary/5 text-primary' :'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <LIcon size={16} />
                    {label}
                  </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Default Landing Screen</p>
              <select
                value={dash.defaultView}
                onChange={(e) => setDash((prev) => ({ ...prev, defaultView: e.target.value as DashboardPrefs['defaultView'] }))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="dashboard">Dashboard</option>
                <option value="lead-management">Lead Management</option>
                <option value="cadence-performance">Cadence Performance</option>
              </select>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Dashboard Widgets</p>
              <div className="space-y-2">
                {[
                  { key: 'showKPIs', label: 'KPI Cards' },
                  { key: 'showActivityFeed', label: 'Activity Feed' },
                  { key: 'showTopLeads', label: 'Top Leads Table' },
                  { key: 'showFunnel', label: 'Stage Funnel Chart' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <span className="text-sm text-foreground">{label}</span>
                    <Toggle
                      checked={(dash as Record<string, boolean>)[key]}
                      onChange={(v) => setDash((prev) => ({ ...prev, [key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Working Hours */}
        <Section title="Working Hours" icon={Clock}>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground mb-3">Set your availability. Notifications outside these hours will be queued and delivered at the start of your next working day.</p>
            {DAYS.map((day) => {
              const h = hours[day];
              return (
                <div key={day} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className="w-24 shrink-0">
                    <div className="flex items-center gap-2">
                      <Toggle checked={h.enabled} onChange={(v) => updateHours(day, 'enabled', v)} />
                      <span className={`text-xs font-medium capitalize ${h.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {day.slice(0, 3).charAt(0).toUpperCase() + day.slice(1, 3)}
                      </span>
                    </div>
                  </div>
                  {h.enabled ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="time"
                        value={h.start}
                        onChange={(e) => updateHours(day, 'start', e.target.value)}
                        className="px-2 py-1 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <input
                        type="time"
                        value={h.end}
                        onChange={(e) => updateHours(day, 'end', e.target.value)}
                        className="px-2 py-1 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Off</span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* Save Footer */}
        <div className="flex justify-end pb-4">
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              saved
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600' :'bg-primary text-primary-foreground hover:opacity-90'
            }`}
          >
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : saved ? <><CheckCircle size={15} /> All Changes Saved</> : <><Save size={15} /> Save All Preferences</>}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
