'use client';

import { Panel, StatusPill } from '@/components/ops';
import type { ConsistencyClaim } from '../types';

const toneByStatus: Record<ConsistencyClaim['status'], 'success' | 'warning' | 'default' | 'danger'> = {
  VALIDATED: 'success',
  PARTIALLY_VALIDATED: 'warning',
  NOT_YET_VALIDATED: 'default',
  NEEDS_CLARIFICATION: 'danger',
};

export function ClaimPanel({
  title,
  claims,
  emptyHint,
}: {
  title: string;
  claims: ConsistencyClaim[];
  emptyHint: string;
}) {
  return (
    <Panel title={title}>
      {claims.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="space-y-3">
          {claims.map((claim, index) => (
            <div key={`${claim.resumeClaim}-${index}`} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={toneByStatus[claim.status]}>{claim.status.replace(/_/g, ' ')}</StatusPill>
                <StatusPill tone="default">{claim.confidence} confidence</StatusPill>
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">{claim.resumeClaim}</p>
              {claim.resumeEvidence ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Resume:</span> {claim.resumeEvidence}</p>
              ) : null}
              {claim.interviewEvidence ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Interview:</span> {claim.interviewEvidence}</p>
              ) : null}
              {claim.analysis ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{claim.analysis}</p> : null}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
