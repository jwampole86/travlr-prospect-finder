'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { Bell, Mail, MessageSquare, Smartphone, Save, CheckCircle, Info, Zap, AlertTriangle, RefreshCw, Users, Activity } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


interface NotifPrefs {
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  notify_new_lead: boolean;
  notify_stage_change: boolean;
  notify_email_sent: boolean;
  notify_sms_sent: boolean;
  notify_call_summary: boolean;
  notify_sync_health: boolean;
  notify_sync_failure: boolean;
  notify_failed_cadence: boolean;
  notify_enrichment_complete: boolean;
  notify_escalation: boolean;
  notify_booking_confirmed: boolean;
  notify_booking_cancelled: boolean;
  notify_payout_processed: boolean;
  notify_payout_failed: boolean;
  notify_maintenance_update: boolean;
  notify_document_ready: boolean;
  digest_frequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
}

const defaultAdminPrefs: NotifPrefs = {
  email_enabled: true, sms_enabled: false, in_app_enabled: true,
  notify_new_lead: true, notify_stage_change: true, notify_email_sent: true,
  notify_sms_sent: false, notify_call_summary: true, notify_sync_health: true,
  notify_sync_failure: true, notify_failed_cadence: true, notify_enrichment_complete: false,
  notify_escalation: true, notify_booking_confirmed: false, notify_booking_cancelled: false,
  notify_payout_processed: false, notify_payout_failed: false, notify_maintenance_update: false,
  notify_document_ready: false, digest_frequency: 'realtime',
};

const defaultHomeownerPrefs: NotifPrefs = {
  email_enabled: true, sms_enabled: false, in_app_enabled: true,
  notify_new_lead: false, notify_stage_change: false, notify_email_sent: false,
  notify_sms_sent: false, notify_call_summary: false, notify_sync_health: false,
  notify_sync_failure: false, notify_failed_cadence: false, notify_enrichment_complete: false,
  notify_escalation: false, notify_booking_confirmed: true, notify_booking_cancelled: true,
  notify_payout_processed: true, notify_payout_failed: true, notify_maintenance_update: true,
  notify_document_ready: true, digest_frequency: 'realtime',
};

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="min-w-0 flex-1 pr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${checked ? 'bg-primary' : 'bg-muted'}`}
        role="switch"
        aria-checked={checked}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function ChannelBadge({ icon: Icon, label, active }: { icon: React.ElementType; label: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${active ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted text-muted-foreground border-border'}`}>
      <Icon size={11} />
      {label}
    </div>
  );
}

export default function NotificationsPage() {
  const { user, isAdmin, isHomeowner } = useAuth();
  const supabase = createClient();
  const [prefs, setPrefs] = useState<NotifPrefs>(isHomeowner() ? defaultHomeownerPrefs : defaultAdminPrefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'channels' | 'types' | 'frequency'>('channels');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setPrefs(prev => ({ ...prev, ...data }));
      }
      setLoading(false);
    })();
  }, [user]);

  function set(key: keyof NotifPrefs, value: boolean | string) {
    setPrefs(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) {
      toast.error('Failed to save preferences');
    } else {
      toast.success('Notification preferences saved');
    }
  }

  const isHO = isHomeowner();
  const tabs = [
    { key: 'channels', label: 'Channels' },
    { key: 'types', label: isHO ? 'Alert Types' : 'Event Types' },
    { key: 'frequency', label: 'Frequency' },
  ];

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 flex items-center justify-center min-h-[300px]">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Notification Preferences</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isHO ? 'Control how and when you receive updates about your property.' : 'Control which events trigger alerts and how they reach you.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ChannelBadge icon={Mail} label="Email" active={prefs.email_enabled} />
            <ChannelBadge icon={Smartphone} label="SMS" active={prefs.sms_enabled} />
            <ChannelBadge icon={Bell} label="In-App" active={prefs.in_app_enabled} />
          </div>
        </div>

        {/* Role badge */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${isHO ? 'bg-info/10 text-info border-info/30' : 'bg-primary/10 text-primary border-primary/30'}`}>
          <Users size={12} />
          {isHO ? 'Homeowner Portal — property-specific notifications only' : `${isAdmin() ? 'Admin' : 'Agent'} — full platform event access`}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${activeTab === tab.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Channels Tab */}
        {activeTab === 'channels' && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Zap size={14} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Delivery Channels</h2>
            </div>
            <div className="px-5 py-2">
              <Toggle checked={prefs.in_app_enabled} onChange={v => set('in_app_enabled', v)} label="In-App Notifications" description="Bell icon alerts and notification drawer inside the app" />
              <Toggle checked={prefs.email_enabled} onChange={v => set('email_enabled', v)} label="Email Notifications" description="Receive alerts at your account email address" />
              <div>
                <Toggle checked={prefs.sms_enabled} onChange={v => set('sms_enabled', v)} label="SMS Notifications" description="Text message alerts to your registered phone number" />
                {prefs.sms_enabled && (
                  <div className="flex items-start gap-2 px-3 py-2 mb-2 bg-warning/10 border border-warning/30 rounded-lg text-xs text-warning">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    SMS requires a verified phone number on your profile. Standard message rates apply.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Types Tab */}
        {activeTab === 'types' && (
          <div className="space-y-4">
            {!isHO && (
              <>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <Activity size={14} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Lead Events</h2>
                  </div>
                  <div className="px-5 py-2">
                    <Toggle checked={prefs.notify_new_lead} onChange={v => set('notify_new_lead', v)} label="New Lead Created" description="When a new lead enters the system" />
                    <Toggle checked={prefs.notify_stage_change} onChange={v => set('notify_stage_change', v)} label="Stage Changes" description="When a lead moves to a new pipeline stage" />
                    <Toggle checked={prefs.notify_escalation} onChange={v => set('notify_escalation', v)} label="Escalation to Human Outreach" description="When a lead engages and needs immediate follow-up" />
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <MessageSquare size={14} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Outreach Events</h2>
                  </div>
                  <div className="px-5 py-2">
                    <Toggle checked={prefs.notify_email_sent} onChange={v => set('notify_email_sent', v)} label="Email Sent" description="Confirmation when cadence emails are dispatched" />
                    <Toggle checked={prefs.notify_sms_sent} onChange={v => set('notify_sms_sent', v)} label="SMS Sent" description="Confirmation when SMS messages are dispatched" />
                    <Toggle checked={prefs.notify_call_summary} onChange={v => set('notify_call_summary', v)} label="Call Summaries" description="AI-generated summary after each completed call" />
                    <Toggle checked={prefs.notify_failed_cadence} onChange={v => set('notify_failed_cadence', v)} label="Failed Cadence Steps" description="When a scheduled message fails to send" />
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <RefreshCw size={14} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">System Events</h2>
                  </div>
                  <div className="px-5 py-2">
                    <Toggle checked={prefs.notify_sync_health} onChange={v => set('notify_sync_health', v)} label="Sync Health Alerts" description="When a data source sync completes or has issues" />
                    <Toggle checked={prefs.notify_sync_failure} onChange={v => set('notify_sync_failure', v)} label="Sync Failures" description="When a scheduled sync job fails" />
                    <Toggle checked={prefs.notify_enrichment_complete} onChange={v => set('notify_enrichment_complete', v)} label="Enrichment Complete" description="When lead enrichment finishes processing" />
                  </div>
                </div>
              </>
            )}
            {isHO && (
              <>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <Bell size={14} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Booking Alerts</h2>
                  </div>
                  <div className="px-5 py-2">
                    <Toggle checked={prefs.notify_booking_confirmed} onChange={v => set('notify_booking_confirmed', v)} label="Booking Confirmed" description="When a new booking is confirmed for your property" />
                    <Toggle checked={prefs.notify_booking_cancelled} onChange={v => set('notify_booking_cancelled', v)} label="Booking Cancelled" description="When an existing booking is cancelled" />
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <CheckCircle size={14} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Financial Alerts</h2>
                  </div>
                  <div className="px-5 py-2">
                    <Toggle checked={prefs.notify_payout_processed} onChange={v => set('notify_payout_processed', v)} label="Payout Processed" description="When your payout is successfully sent" />
                    <Toggle checked={prefs.notify_payout_failed} onChange={v => set('notify_payout_failed', v)} label="Payout Failed" description="When a payout attempt fails — action required" />
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <Info size={14} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Property Updates</h2>
                  </div>
                  <div className="px-5 py-2">
                    <Toggle checked={prefs.notify_maintenance_update} onChange={v => set('notify_maintenance_update', v)} label="Maintenance Updates" description="Status changes on maintenance requests" />
                    <Toggle checked={prefs.notify_document_ready} onChange={v => set('notify_document_ready', v)} label="Documents Ready" description="When new documents are available to sign or review" />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Frequency Tab */}
        {activeTab === 'frequency' && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <RefreshCw size={14} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Delivery Frequency</h2>
            </div>
            <div className="px-5 py-5 space-y-3">
              <p className="text-xs text-muted-foreground">Choose how often you receive notification digests. Critical alerts (failures, escalations) are always sent immediately.</p>
              {(['realtime', 'hourly', 'daily', 'weekly'] as const).map(freq => {
                const labels = { realtime: 'Real-time', hourly: 'Hourly digest', daily: 'Daily digest', weekly: 'Weekly digest' };
                const descs = {
                  realtime: 'Receive each notification as it happens',
                  hourly: 'Batched summary every hour',
                  daily: 'One summary email each morning at 9 AM',
                  weekly: 'Weekly roundup every Monday morning',
                };
                return (
                  <label key={freq} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${prefs.digest_frequency === freq ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                    <input
                      type="radio"
                      name="digest_frequency"
                      value={freq}
                      checked={prefs.digest_frequency === freq}
                      onChange={() => set('digest_frequency', freq)}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">{labels[freq]}</p>
                      <p className="text-xs text-muted-foreground">{descs[freq]}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Save */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">Changes apply to your account only and don't affect other users.</p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
            Save Preferences
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
