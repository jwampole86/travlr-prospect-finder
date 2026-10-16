import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { SourceRunResult } from './syncEngine';
import type { SyncAlertConfig, SyncAlertEvent } from './types';

export const ALERT_LABELS: Record<string, { label: string; desc: string }> = {
  provider_unavailable: { label: 'Provider Unavailable', desc: 'Alert when every source for a portfolio fails during a sync' },
  verification_failure_rate: { label: 'Source Failure Rate', desc: 'Alert when the share of failed sources in a portfolio sync exceeds the threshold' },
  suspicious_zero_result: { label: 'Suspicious Zero-Result Sync', desc: 'Alert when a portfolio that already has leads returns 0 listings from every source' },
};

export function useSyncAlerts() {
  const supabase = createClient();
  const [events, setEvents] = useState<SyncAlertEvent[]>([]);
  const [configs, setConfigs] = useState<SyncAlertConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const configsRef = useRef<SyncAlertConfig[]>([]);
  configsRef.current = configs;

  const unacked = events.filter((e) => !e.acknowledged).length;

  const load = useCallback(async () => {
    setLoading(true);
    const [c, e] = await Promise.all([
      supabase.from('sync_alert_config').select('*').order('alert_type'),
      supabase.from('sync_alert_events').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setConfigs((c.data || []) as SyncAlertConfig[]);
    setEvents((e.data || []) as SyncAlertEvent[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('sync-alert-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sync_alert_events' }, (payload) => {
        const ev = payload.new as SyncAlertEvent;
        setEvents((prev) => (prev.some((p) => p.id === ev.id) ? prev : [ev, ...prev]));
        if ((ev.details as Record<string, unknown>)?.test !== true) toast.error(`Sync alert: ${ev.message}`, { duration: 6000 });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  const save = async (updated: SyncAlertConfig[]) => {
    setSaving(true);
    try {
      for (const cfg of updated) {
        const { error } = await supabase.from('sync_alert_config').upsert({
          id: cfg.id,
          alert_type: cfg.alert_type,
          enabled: cfg.enabled,
          threshold_value: cfg.threshold_value,
          slack_webhook_url: cfg.slack_webhook_url,
          alert_email: cfg.alert_email,
          notify_slack: cfg.notify_slack,
          notify_email: cfg.notify_email,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      toast.success('Alert configuration saved');
      await load();
    } catch {
      toast.error('Failed to save alert config');
    } finally {
      setSaving(false);
    }
  };

  const acknowledge = async (id: string) => {
    await supabase.from('sync_alert_events').update({ acknowledged: true, acknowledged_at: new Date().toISOString() }).eq('id', id);
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, acknowledged: true } : e)));
  };

  const sendTest = useCallback(async (cfg: SyncAlertConfig) => {
    setTestingId(cfg.id);
    const label = ALERT_LABELS[cfg.alert_type]?.label || cfg.alert_type;
    const message = `[TEST] ${label} — test notification from Sync Ops Dashboard`;
    const timestamp = new Date().toISOString();
    let slackOk = false;
    let emailOk = false;
    const errors: string[] = [];

    if (cfg.notify_slack && cfg.slack_webhook_url) {
      try {
        const res = await fetch(cfg.slack_webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `🔔 *${message}*\nAlert Type: \`${cfg.alert_type}\`\nTimestamp: ${timestamp}` }),
        });
        slackOk = res.ok;
        if (!res.ok) errors.push(`Slack webhook returned HTTP ${res.status}`);
      } catch (e) {
        errors.push(`Slack webhook error: ${e instanceof Error ? e.message : 'Network error'}`);
      }
    }

    if (cfg.notify_email && cfg.alert_email) {
      try {
        const res = await fetch('/api/send-test-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: cfg.alert_email,
            subject: `[TEST] Sync Alert: ${label}`,
            body: `This is a test notification from the Sync Ops Dashboard.\n\nAlert Type: ${cfg.alert_type}\nMessage: ${message}\nTimestamp: ${timestamp}\n\nIf you received this, your email alert is configured correctly.`,
          }),
        });
        const data = await res.json();
        emailOk = res.ok && data.success !== false;
        if (!emailOk) errors.push(`Email send failed: ${data.error || `HTTP ${res.status}`}`);
      } catch (e) {
        errors.push(`Email error: ${e instanceof Error ? e.message : 'Network error'}`);
      }
    }

    setTestingId(null);
    const channels = [cfg.notify_slack && cfg.slack_webhook_url ? 'Slack' : null, cfg.notify_email && cfg.alert_email ? 'Email' : null].filter(Boolean);
    if (errors.length > 0) toast.error(`Test failed: ${errors[0]}`);
    else if (channels.length === 0) toast.warning('No channels configured — enable Slack or Email and add a destination first');
    else toast.success(`Test sent via ${channels.join(' + ')}`);

    await supabase.from('sync_alert_events').insert({
      alert_type: cfg.alert_type,
      portfolio: null,
      severity: 'info',
      message: `[TEST] ${label} — test notification`,
      details: { test: true, slack_ok: slackOk, email_ok: emailOk, errors },
    }).then(undefined, () => {});
  }, [supabase]);

  /** Evaluate a finished portfolio sync against the enabled alert rules. */
  const evaluate = useCallback(async (portfolio: string, results: SourceRunResult[], previousLeads: number) => {
    const attempted = results.filter((r) => r.status !== 'skipped');
    if (attempted.length === 0) return;
    const failed = attempted.filter((r) => r.status === 'failed');
    const fire = (alert_type: string, severity: string, message: string, details: Record<string, unknown>) =>
      supabase.from('sync_alert_events').insert({ alert_type, portfolio, severity, message, details }).then(undefined, () => {});

    for (const cfg of configsRef.current.filter((c) => c.enabled)) {
      if (cfg.alert_type === 'provider_unavailable' && failed.length === attempted.length) {
        await fire('provider_unavailable', 'critical', `Every source failed for ${portfolio}: ${failed[0].error ?? 'unknown error'}`, {
          errors: failed.map((f) => ({ source: f.source, error: f.error })),
        });
      }
      if (cfg.alert_type === 'verification_failure_rate') {
        const rate = Math.round((failed.length / attempted.length) * 100);
        if (failed.length > 0 && failed.length < attempted.length && rate > (cfg.threshold_value ?? 10)) {
          await fire('verification_failure_rate', 'warning', `${failed.length}/${attempted.length} sources failed for ${portfolio} (${rate}%)`, {
            rate, threshold: cfg.threshold_value ?? 10, failed: failed.map((f) => f.source),
          });
        }
      }
      if (cfg.alert_type === 'suspicious_zero_result' && previousLeads > 0 && failed.length === 0 && attempted.every((r) => r.fetched === 0)) {
        await fire('suspicious_zero_result', 'warning', `Suspicious zero-result: ${portfolio} returned 0 listings from ${attempted.length} sources but already has ${previousLeads} leads`, {
          previous_count: previousLeads, current_count: 0,
        });
      }
    }
  }, [supabase]);

  return { events, configs, setConfigs, loading, saving, testingId, unacked, load, save, acknowledge, sendTest, evaluate };
}
