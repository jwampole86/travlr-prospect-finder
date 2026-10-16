import React from 'react';
import { AlertTriangle, Bell, CheckCircle2, Info, Loader2, Mail, RefreshCw, Send, Settings, Zap } from 'lucide-react';
import { ALERT_LABELS, useSyncAlerts } from '../lib/useSyncAlerts';
import { timeAgo } from '../lib/syncEngine';

type Alerts = ReturnType<typeof useSyncAlerts>;

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20';

export default function AlertsPanel({ alerts }: { alerts: Alerts }) {
  const { events, configs, setConfigs, loading, saving, testingId, unacked, load, save, acknowledge, sendTest } = alerts;
  const patch = (id: string, change: Partial<(typeof configs)[number]>) =>
    setConfigs((prev) => prev.map((c) => (c.id === id ? { ...c, ...change } : c)));
  const active = events.filter((e) => !e.acknowledged);
  const resolved = events.filter((e) => e.acknowledged);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Alert Events</span>
            {unacked > 0 && <span className="rounded-full bg-danger px-1.5 py-0.5 text-[9px] font-bold text-white">{unacked} new</span>}
          </div>
          <button onClick={load} disabled={loading} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50" aria-label="Refresh alerts">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="max-h-[560px] space-y-5 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-primary" /></div>
          ) : events.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 size={26} className="mx-auto mb-2 text-success" />
              <p className="text-sm font-medium text-foreground">All clear</p>
              <p className="mt-1 text-xs text-muted-foreground">Alerts fire automatically when a sync fails or returns nothing.</p>
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Active ({active.length})</div>
                  <div className="space-y-2">
                    {active.map((ev) => {
                      const isTest = (ev.details as Record<string, unknown>)?.test === true;
                      const style = isTest
                        ? 'border-primary/20 bg-primary/5 text-primary'
                        : ev.severity === 'critical' ? 'border-danger/20 bg-danger/10 text-danger' : 'border-warning/20 bg-warning/10 text-warning';
                      return (
                        <div key={ev.id} className={`flex items-start gap-3 rounded-xl border p-3 ${style}`}>
                          {isTest ? <Info size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold">{ev.message}</div>
                            <div className="mt-0.5 text-[10px] opacity-75">
                              {ev.portfolio ? `${ev.portfolio} · ` : ''}{timeAgo(ev.created_at)}
                            </div>
                          </div>
                          <button onClick={() => acknowledge(ev.id)} className="shrink-0 rounded-lg bg-background/60 px-2 py-1 text-[10px] font-semibold hover:bg-background">
                            Ack
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {resolved.length > 0 && (
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Acknowledged ({resolved.length})</div>
                  <div className="space-y-1.5">
                    {resolved.slice(0, 10).map((ev) => (
                      <div key={ev.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
                        <CheckCircle2 size={11} className="shrink-0 text-success" />
                        <span className="truncate text-[11px] text-muted-foreground">{ev.message}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{timeAgo(ev.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Settings size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Alert Rules</span>
          <span className="ml-auto text-[10px] text-muted-foreground">Configure and test delivery</span>
        </div>
        <div className="max-h-[620px] space-y-4 overflow-y-auto p-4">
          {configs.length === 0 ? (
            <div className="py-8 text-center">
              <Settings size={24} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No alert rules found</p>
            </div>
          ) : (
            <>
              {configs.map((cfg) => {
                const meta = ALERT_LABELS[cfg.alert_type] || { label: cfg.alert_type, desc: '' };
                const testing = testingId === cfg.id;
                const noChannel = !cfg.notify_email && !cfg.notify_slack;
                return (
                  <div key={cfg.id} className="space-y-3 rounded-xl border border-border bg-muted/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{meta.label}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{meta.desc}</div>
                      </div>
                      <button
                        onClick={() => patch(cfg.id, { enabled: !cfg.enabled })}
                        role="switch"
                        aria-checked={cfg.enabled}
                        className={`relative h-5 w-10 shrink-0 rounded-full transition-colors ${cfg.enabled ? 'bg-primary' : 'bg-muted'}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${cfg.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    {cfg.enabled && (
                      <div className="space-y-2">
                        {cfg.alert_type === 'verification_failure_rate' && (
                          <label className="block text-[10px] font-semibold text-muted-foreground">
                            Threshold (% of sources failing)
                            <input type="number" min={1} max={100} value={cfg.threshold_value ?? 10} onChange={(e) => patch(cfg.id, { threshold_value: Number(e.target.value) })} className={`${inputCls} mt-1`} />
                          </label>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            ['notify_email', 'Email', Mail],
                            ['notify_slack', 'Slack', Zap],
                          ] as const).map(([key, label, Icon]) => (
                            <button
                              key={key}
                              onClick={() => patch(cfg.id, { [key]: !cfg[key] })}
                              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                                cfg[key] ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <Icon size={11} /> {label}
                            </button>
                          ))}
                        </div>
                        {cfg.notify_email && <input value={cfg.alert_email || ''} onChange={(e) => patch(cfg.id, { alert_email: e.target.value })} placeholder="alert@yourcompany.com" className={inputCls} />}
                        {cfg.notify_slack && <input value={cfg.slack_webhook_url || ''} onChange={(e) => patch(cfg.id, { slack_webhook_url: e.target.value })} placeholder="https://hooks.slack.com/services/…" className={inputCls} />}
                        <button
                          onClick={() => sendTest(cfg)}
                          disabled={testing || noChannel}
                          title={noChannel ? 'Enable Email or Slack first' : 'Send a test notification'}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
                        >
                          {testing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                          {testing ? 'Sending test…' : 'Send test notification'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => save(configs)}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
                Save alert rules
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
