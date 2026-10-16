'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, Shield, ShieldAlert, WandSparkles } from 'lucide-react';
import { Panel, StatusPill } from '@/components/ops';
import type { CadenceStats } from './types';

function AuditRow({
  icon: Icon,
  title,
  detail,
  tone,
}: {
  icon: React.ElementType;
  title: string;
  detail: string;
  tone: 'success' | 'warning' | 'danger' | 'primary' | 'default';
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 rounded-xl p-2 ${tone === 'success' ? 'bg-success/10 text-success' : tone === 'warning' ? 'bg-warning/10 text-warning' : tone === 'danger' ? 'bg-danger/10 text-danger' : tone === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <Icon size={15} />
        </span>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <StatusPill tone={tone}>{tone}</StatusPill>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export default function CadenceAuditPanel({ stats }: { stats: CadenceStats }) {
  return (
    <Panel title="Live audit" icon={Shield}>
      <div className="space-y-3 text-sm">
        <AuditRow
          icon={stats.enrollmentCount > 0 ? CheckCircle2 : AlertTriangle}
          title="Execution evidence"
          tone={stats.enrollmentCount > 0 || stats.sendCount > 0 ? 'success' : 'warning'}
          detail={stats.enrollmentCount > 0 || stats.sendCount > 0
            ? `${stats.enrollmentCount} enrollments and ${stats.sendCount} send-log rows exist in the live database.`
            : 'cadence_enrollments, cadence_send_log, and email_unsubscribe_tokens are all empty in the live database, so this page now presents the engine as configured-but-idle instead of active.'}
        />
        <AuditRow
          icon={stats.newLeadCount > 0 && stats.nurturingLeadCount === 0 ? ShieldAlert : WandSparkles}
          title="Auto-enrollment gap"
          tone={stats.newLeadCount > 0 && stats.nurturingLeadCount === 0 ? 'danger' : 'primary'}
          detail={stats.newLeadCount > 0 && stats.nurturingLeadCount === 0
            ? `${stats.newLeadCount.toLocaleString()} leads are still in \"New Lead\" while the default run route auto-enrolls stage \"nurturing\". With zero nurturing leads, the engine has nothing to enroll automatically today.`
            : `${stats.nurturingLeadCount.toLocaleString()} leads are currently in the nurturing stage and ${stats.scheduledTouchCount.toLocaleString()} have next_scheduled_touch_at set.`}
        />
        <AuditRow
          icon={Shield}
          title="Manual job execution"
          tone="warning"
          detail={'The page no longer exposes a live "Run Job Now" action because /api/cadence/run requires a signed job request and should not be triggered directly from a browser session. This editor only changes cadence_sequences rows.'}
        />
        <AuditRow
          icon={Shield}
          title="Protected-contact guardrails"
          tone="primary"
          detail="Jennifer and Spencer Wampole remain protected contacts. This editor never sends messages, and its copy now explicitly avoids suggesting that admins can bypass the shared SMS suppression / protected-contact path."
        />
      </div>
    </Panel>
  );
}
