'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Settings, Clock, ToggleLeft, ToggleRight, Play, CheckCircle2, AlertCircle, Loader2, RefreshCw, Mail } from 'lucide-react';

interface AutoAdvanceConfig {
  id: string;
  delay_days: number;
  enabled: boolean;
  updated_at: string;
}

export default function ChecklistAutoAdvanceSettingsPage() {
  const supabase = createClient();
  const [config, setConfig] = useState<AutoAdvanceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningAdvance, setRunningAdvance] = useState(false);
  const [runningDigest, setRunningDigest] = useState(false);
  const [delayDays, setDelayDays] = useState(7);
  const [enabled, setEnabled] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function loadConfig() {
    setLoading(true);
    const { data } = await supabase
      .from('checklist_auto_advance_config')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setConfig(data);
      setDelayDays(data.delay_days);
      setEnabled(data.enabled);
    }
    setLoading(false);
  }

  async function saveConfig() {
    setSaving(true);
    try {
      if (config?.id) {
        const { error } = await supabase
          .from('checklist_auto_advance_config')
          .update({ delay_days: delayDays, enabled, updated_at: new Date().toISOString() })
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('checklist_auto_advance_config')
          .insert({ delay_days: delayDays, enabled });
        if (error) throw error;
      }
      await loadConfig();
      showToast('success', 'Settings saved successfully');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function triggerAutoAdvance() {
    setRunningAdvance(true);
    try {
      const res = await fetch('/api/cron/checklist-auto-advance', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run auto-advance');
      showToast('success', `Auto-advance complete: ${data.stepsAdvanced} step(s) advanced, ${data.notificationsSent} agent notification(s) sent`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to trigger auto-advance');
    } finally {
      setRunningAdvance(false);
    }
  }

  async function triggerDigest() {
    setRunningDigest(true);
    try {
      const res = await fetch('/api/cron/weekly-checklist-digest', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send digest');
      showToast('success', `Digest sent: ${data.sent} email(s) sent, ${data.skipped} skipped (nothing pending)`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to send digest');
    } finally {
      setRunningDigest(false);
    }
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {toast.message}
          </div>
        )}

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <Settings size={16} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Checklist Automation Settings</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-10">
            Configure auto-advance delays and weekly digest emails for homeowner onboarding checklists.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Auto-Advance Config */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Clock size={14} className="text-amber-500" />
                    Auto-Advance Pending Steps
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Automatically move checklist steps from "Not Started" to "In Progress" after a set number of days.
                  </p>
                </div>
                <button
                  onClick={() => setEnabled(!enabled)}
                  className="shrink-0 ml-4"
                  title={enabled ? 'Disable auto-advance' : 'Enable auto-advance'}
                >
                  {enabled ? (
                    <ToggleRight size={28} className="text-indigo-600" />
                  ) : (
                    <ToggleLeft size={28} className="text-muted-foreground" />
                  )}
                </button>
              </div>

              <div className={`space-y-3 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Delay before auto-advance (days)
                  </span>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="range"
                      min={1}
                      max={30}
                      value={delayDays}
                      onChange={e => setDelayDays(Number(e.target.value))}
                      className="flex-1 accent-indigo-600"
                    />
                    <div className="w-16 text-center">
                      <span className="text-2xl font-bold text-foreground">{delayDays}</span>
                      <span className="text-xs text-muted-foreground block">days</span>
                    </div>
                  </div>
                </label>

                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    <strong>What happens:</strong> Any checklist step that has been "Not Started" for {delayDays}+ days will automatically move to "In Progress." The assigned agent receives a reminder notification, and the event is logged to the Activity Timeline.
                  </p>
                </div>
              </div>

              <button
                onClick={saveConfig}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>

            {/* Manual Triggers */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Manual Triggers</h2>
              <p className="text-xs text-muted-foreground -mt-2">
                Run these jobs on demand without waiting for the scheduled cron.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Auto-Advance Trigger */}
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <RefreshCw size={13} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Run Auto-Advance</p>
                      <p className="text-[11px] text-muted-foreground">Advance stale pending steps now</p>
                    </div>
                  </div>
                  <button
                    onClick={triggerAutoAdvance}
                    disabled={runningAdvance}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
                  >
                    {runningAdvance ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    {runningAdvance ? 'Running…' : 'Run Now'}
                  </button>
                </div>

                {/* Digest Trigger */}
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <Mail size={13} className="text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Send Weekly Digest</p>
                      <p className="text-[11px] text-muted-foreground">Email all homeowners with pending items</p>
                    </div>
                  </div>
                  <button
                    onClick={triggerDigest}
                    disabled={runningDigest}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
                  >
                    {runningDigest ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                    {runningDigest ? 'Sending…' : 'Send Now'}
                  </button>
                </div>
              </div>
            </div>

            {/* Cron Schedule Info */}
            <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Recommended Cron Schedule</h3>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Auto-Advance (daily)</span>
                  <code className="bg-card border border-border px-2 py-0.5 rounded text-foreground font-mono">POST /api/cron/checklist-auto-advance</code>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Weekly Digest (Mondays 9am)</span>
                  <code className="bg-card border border-border px-2 py-0.5 rounded text-foreground font-mono">POST /api/cron/weekly-checklist-digest</code>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Both endpoints require the <code className="font-mono">x-job-secret</code> header matching your <code className="font-mono">SEQUENCE_JOB_SECRET</code> env variable.
              </p>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
