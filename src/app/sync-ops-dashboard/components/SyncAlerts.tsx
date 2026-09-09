import React, { useEffect } from 'react';
// ... existing code ...
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Bell, Mail, Settings, AlertCircle } from 'lucide-react';
// ... existing code ...

// ─── Alert Types ──────────────────────────────────────────────────────────────

interface SyncAlertEvent {
  id: string;
  alert_type: string;
  portfolio: string | null;
  severity: string;
  message: string;
  details: Record<string, unknown>;
  acknowledged: boolean;
  created_at: string;
}

interface SyncAlertConfig {
  id: string;
  alert_type: string;
  enabled: boolean;
  threshold_value: number | null;
  slack_webhook_url: string | null;
  alert_email: string | null;
  notify_slack: boolean;
  notify_email: boolean;
}

// ─── Alert Config Panel ───────────────────────────────────────────────────────

function AlertConfigPanel({
  configs,
  onSave,
  saving,
}: {
  configs: SyncAlertConfig[];
  onSave: (updated: SyncAlertConfig[]) => void;
  saving: boolean;
}) {
  const [local, setLocal] = React.useState<SyncAlertConfig[]>(configs);

  React.useEffect(() => { setLocal(configs); }, [configs]);

  const update = (id: string, patch: Partial<SyncAlertConfig>) => {
    setLocal(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  const ALERT_LABELS: Record<string, { label: string; desc: string; icon: React.ElementType }> = {
    provider_unavailable: { label: 'Provider Unavailable', desc: 'Alert when data provider is unreachable during sync', icon: XCircle },
    verification_failure_rate: { label: 'Verification Failure Rate', desc: 'Alert when >10% of leads fail verification in a sync', icon: AlertTriangle },
    suspicious_zero_result: { label: 'Suspicious Zero-Result Sync', desc: 'Alert when a portfolio returns 0 records but previously had data', icon: AlertCircle },
  };

  return (
    <div className="space-y-4">
      {local.map(cfg => {
        const meta = ALERT_LABELS[cfg.alert_type] || { label: cfg.alert_type, desc: '', icon: Bell };
        const MetaIcon = meta.icon;
        return (
          <div key={cfg.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-muted/30">
                  <MetaIcon size={14} className="text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{meta.label}</div>
                  <div className="text-[10px] text-muted-foreground">{meta.desc}</div>
                </div>
              </div>
              <button
                onClick={() => update(cfg.id, { enabled: !cfg.enabled })}
                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${cfg.enabled ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cfg.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {cfg.enabled && (
              <div className="space-y-2 pt-1">
                {cfg.alert_type === 'verification_failure_rate' && (
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground">Threshold (%)</label>
                    <input
                      type="number" min={1} max={100}
                      value={cfg.threshold_value ?? 10}
                      onChange={e => update(cfg.id, { threshold_value: Number(e.target.value) })}
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => update(cfg.id, { notify_email: !cfg.notify_email })}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      cfg.notify_email ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    <Mail size={11} />
                    Email Alert
                  </button>
                  <button
                    onClick={() => update(cfg.id, { notify_slack: !cfg.notify_slack })}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      cfg.notify_slack ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    Slack Alert
                  </button>
                </div>

                {cfg.notify_email && (
                  <input
                    value={cfg.alert_email || ''}
                    onChange={e => update(cfg.id, { alert_email: e.target.value })}
                    placeholder="alert@yourcompany.com"
                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none"
                  />
                )}

                {cfg.notify_slack && (
                  <input
                    value={cfg.slack_webhook_url || ''}
                    onChange={e => update(cfg.id, { slack_webhook_url: e.target.value })}
                    placeholder="https://hooks.slack.com/services/…"
                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={() => onSave(local)}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
        Save Alert Config
      </button>
    </div>
  );
}

// ─── Alert Events Panel ───────────────────────────────────────────────────────

function AlertEventsPanel({
  events,
  onAcknowledge,
}: {
  events: SyncAlertEvent[];
  onAcknowledge: (id: string) => void;
}) {
  const SEVERITY_STYLES: Record<string, string> = {
    critical: 'bg-danger/10 text-danger border-danger/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    info: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  };

  const ALERT_ICONS: Record<string, React.ElementType> = {
    provider_unavailable: XCircle,
    verification_failure_rate: AlertTriangle,
    suspicious_zero_result: AlertCircle,
  };

  const unacked = events.filter(e => !e.acknowledged);
  const acked = events.filter(e => e.acknowledged);

  return (
    <div className="space-y-3">
      {unacked.length === 0 && acked.length === 0 && (
        <div className="text-center py-8">
          <Bell size={24} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No alerts triggered</p>
        </div>
      )}

      {unacked.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Active Alerts ({unacked.length})
          </div>
          <div className="space-y-2">
            {unacked.map(ev => {
              const AlertIcon = ALERT_ICONS[ev.alert_type] || Bell;
              const severityStyle = SEVERITY_STYLES[ev.severity] || SEVERITY_STYLES.warning;
              return (
                <div key={ev.id} className={`flex items-start gap-3 p-3 rounded-xl border ${severityStyle}`}>
                  <AlertIcon size={14} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">{ev.message}</div>
                    {ev.portfolio && (
                      <div className="text-[10px] mt-0.5 opacity-80">Portfolio: {ev.portfolio}</div>
                    )}
                    <div className="text-[10px] mt-0.5 opacity-70">
                      {new Date(ev.created_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => onAcknowledge(ev.id)}
                    className="shrink-0 px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[10px] font-semibold transition-colors"
                  >
                    Ack
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {acked.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Acknowledged ({acked.length})
          </div>
          <div className="space-y-1.5">
            {acked.slice(0, 5).map(ev => (
              <div key={ev.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/20 border border-border">
                <CheckCircle2 size={11} className="text-success shrink-0" />
                <span className="text-[11px] text-muted-foreground truncate">{ev.message}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                  {new Date(ev.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
