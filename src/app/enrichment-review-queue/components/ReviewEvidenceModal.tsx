'use client';

import { AlertCircle, CheckCircle2, Eye, Phone, Users, X, XCircle } from 'lucide-react';
import { buttonPrimary, buttonSecondary, Panel, StatusPill } from '@/components/ops';
import { confidenceLabel } from '@/lib/services/ownerEnrichmentService';
import type { ReviewItem } from './types';

function confidenceTone(confidence: string | null) {
  switch (confidence) {
    case 'VERIFIED':
    case 'HIGH_CONFIDENCE':
      return 'success' as const;
    case 'MEDIUM_CONFIDENCE':
      return 'warning' as const;
    case 'CONFLICT':
    case 'LOW_CONFIDENCE':
    case 'NO_MATCH':
      return 'danger' as const;
    default:
      return 'default' as const;
  }
}

type MatchSignal = {
  signal: string;
  score: number;
  present: boolean;
  evidence?: string;
};

export default function ReviewEvidenceModal({
  item,
  onClose,
  onAccept,
  onReject,
}: {
  item: ReviewItem;
  onClose: () => void;
  onAccept: (item: ReviewItem) => void;
  onReject: (item: ReviewItem) => void;
}) {
  const signals = (
    ((item.evidence as Record<string, unknown>)?.signals ?? []) as MatchSignal[]
  ).filter((signal) => signal.present || signal.score < 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2 text-primary">
              <Eye size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Review evidence</h2>
              <p className="text-xs text-muted-foreground">
                {item.canonical_address || item.lead_id}
              </p>
            </div>
          </div>
          <button
            aria-label="Close evidence modal"
            onClick={onClose}
            className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-4">
            <Panel title="Property context" padded className="rounded-2xl">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Address
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {item.canonical_address || 'Unavailable'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Provider
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {item.provider || 'Unknown'}
                  </div>
                </div>
              </div>
            </Panel>

            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="Owner comparison" icon={Users} padded className="rounded-2xl">
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Current owner
                    </div>
                    <div className="mt-1 font-medium text-foreground">
                      {item.current_owner_name || 'No canonical owner yet'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Suggested owner
                    </div>
                    <div className="mt-1 font-semibold text-primary">
                      {item.suggested_owner_name || 'Unavailable'}
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel title="Phone comparison" icon={Phone} padded className="rounded-2xl">
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Current phone
                    </div>
                    <div className="mt-1 font-medium text-foreground">
                      {item.current_phone || 'No canonical phone yet'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Suggested phone
                    </div>
                    <div className="mt-1 font-semibold text-primary">
                      {item.suggested_phone || 'Unavailable'}
                    </div>
                  </div>
                </div>
              </Panel>
            </div>

            <Panel title="Scoring signals" icon={AlertCircle} padded className="rounded-2xl">
              {signals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No signal payload was stored for this review item.
                </p>
              ) : (
                <div className="space-y-2">
                  {signals.map((signal, index) => {
                    const positive = signal.score >= 0;
                    return (
                      <div
                        key={`${signal.signal}-${index}`}
                        className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-sm ${
                          positive
                            ? 'border-success/20 bg-success/10'
                            : 'border-danger/20 bg-danger/10'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {positive ? (
                            <CheckCircle2 size={14} className="text-success" />
                          ) : (
                            <XCircle size={14} className="text-danger" />
                          )}
                          <span className="text-foreground">
                            {signal.signal.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                        </div>
                        <span
                          className={`font-semibold tabular-nums ${
                            positive ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {signal.score > 0 ? '+' : ''}
                          {signal.score}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Decision summary" padded className="rounded-2xl">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={confidenceTone(item.confidence)}>
                  {confidenceLabel(item.confidence || 'NO_MATCH')}
                </StatusPill>
                <StatusPill tone="default">Score {item.match_score ?? '—'}/100</StatusPill>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Review reason
                </div>
                <p className="mt-1 text-sm text-foreground">
                  {item.reason || 'No reason recorded.'}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Accepting marks the review item and owner match as approved, updates the canonical
                lead profile, and refreshes queue counts. Rejecting preserves the lead as-is and
                closes the review item.
              </div>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    onReject(item);
                    onClose();
                  }}
                  className={`${buttonSecondary} border-danger/20 bg-danger/10 text-danger hover:bg-danger/20`}
                >
                  <XCircle size={16} />
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAccept(item);
                    onClose();
                  }}
                  className={buttonPrimary}
                >
                  <CheckCircle2 size={16} />
                  Accept and apply
                </button>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
