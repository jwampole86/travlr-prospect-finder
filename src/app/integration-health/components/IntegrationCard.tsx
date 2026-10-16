'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock3, RefreshCw, Shield, XCircle } from 'lucide-react';
import { buttonSecondary, Panel, StatusPill } from '@/components/ops';
import type { ApiIntegration, ApiStatus } from './types';

const toneByStatus: Record<ApiStatus, 'success' | 'warning' | 'danger' | 'default'> = {
  operational: 'success',
  degraded: 'warning',
  down: 'danger',
  unknown: 'default',
};

const iconByStatus: Record<ApiStatus, React.ElementType> = {
  operational: CheckCircle2,
  degraded: AlertTriangle,
  down: XCircle,
  unknown: Shield,
};

function relativeTime(value: string | null) {
  if (!value) return 'Never';
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function IntegrationCard({
  integration,
  onCheck,
}: {
  integration: ApiIntegration;
  onCheck: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [checking, setChecking] = useState(false);
  const StatusIcon = iconByStatus[integration.status];
  const IntegrationIcon = integration.icon;

  const runCheck = async () => {
    setChecking(true);
    try {
      await onCheck(integration.id);
    } catch {
      // The page-level error banner already explains the failure.
    } finally {
      setChecking(false);
    }
  };

  return (
    <Panel
      className="h-full"
      padded={false}
      children={(
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${integration.iconBg}`}>
                <IntegrationIcon size={20} className={integration.iconColor} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{integration.name}</h3>
                  <StatusPill tone={toneByStatus[integration.status]} icon={StatusIcon}>{integration.status}</StatusPill>
                  <StatusPill tone={integration.envKeySet ? 'primary' : 'warning'}>{integration.envKeySet ? 'Configured' : 'Key missing'}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{integration.category}</p>
                <p className="mt-2 text-sm text-muted-foreground">{integration.notes}</p>
              </div>
            </div>
            <button
              type="button"
              aria-label={expanded ? `Collapse ${integration.name}` : `Expand ${integration.name}`}
              onClick={() => setExpanded((value) => !value)}
              className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Last checked</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{relativeTime(integration.lastCheckedAt)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Latency</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">{integration.latencyMs != null ? `${integration.latencyMs} ms` : '—'}</div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Fallback</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{integration.fallbackEnabled ? integration.fallbackMode : 'None'}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { void runCheck(); }} disabled={checking} className={buttonSecondary}>
              <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
              {checking ? 'Checking…' : 'Run live check'}
            </button>
            <StatusPill tone="default" icon={Clock3}>Safe check via /api/integration-health/status</StatusPill>
            {integration.endpoint.includes('/api/leads/rapidapi-import') && <StatusPill tone="warning">No import is triggered by this test</StatusPill>}
          </div>

          {expanded && (
            <div className="mt-4 space-y-3 rounded-2xl border border-border bg-muted/20 p-4 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Endpoint</div>
                <code className="mt-1 inline-flex rounded-lg bg-card px-2 py-1 text-xs text-foreground">{integration.endpoint}</code>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live message</div>
                <p className="mt-1 text-muted-foreground">{integration.message || 'No live status has been recorded yet.'}</p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Why this is safe</div>
                <p className="mt-1 text-muted-foreground">
                  The page checks the dedicated health route, which uses read-only probes or subscription-only checks. It does not call the provider write/import endpoint shown above.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    />
  );
}
