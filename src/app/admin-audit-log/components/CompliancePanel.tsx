import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { AdminAuditEntry, AuditSourceStat } from '../types';

export default function CompliancePanel({
  entries,
  complianceSource,
}: {
  entries: AdminAuditEntry[];
  complianceSource?: AuditSourceStat;
}) {
  return (
    <Panel title="Compliance audit log" icon={ShieldCheck}>
      {entries.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No compliance audit rows are currently recorded"
          hint={`The compliance_audit_log table currently has ${complianceSource?.count ?? 0} rows, so the old GDPR/SOC2 scorecards were misleading. This panel now reflects the real table state.`}
        />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={`${entry.sourceTable}:${entry.id}`} className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="danger">{entry.eventType}</StatusPill>
                {entry.targetLabel && <StatusPill tone="default">{entry.targetLabel}</StatusPill>}
              </div>
              <h3 className="mt-2 text-sm font-semibold text-foreground">{entry.title}</h3>
              {entry.summary && <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>}
              {entry.reason && <p className="mt-2 text-xs text-muted-foreground">Reason: {entry.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
