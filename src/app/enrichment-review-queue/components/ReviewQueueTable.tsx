'use client';

import { CheckCircle2, Clock3, Eye, Phone, Users, XCircle } from 'lucide-react';
import { buttonSecondary, EmptyState, Panel, StatusPill } from '@/components/ops';
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

function reviewTone(status: string) {
  switch (status) {
    case 'ACCEPTED':
      return 'success' as const;
    case 'REJECTED':
      return 'danger' as const;
    case 'PENDING':
      return 'warning' as const;
    default:
      return 'default' as const;
  }
}

function formatRelativeTime(iso: string) {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const absMinutes = Math.abs(diffMinutes);
  if (absMinutes < 60) return rtf.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, 'day');
}

export default function ReviewQueueTable({
  items,
  actionLoading,
  onOpenEvidence,
  onAction,
}: {
  items: ReviewItem[];
  actionLoading: string | null;
  onOpenEvidence: (item: ReviewItem) => void;
  onAction: (item: ReviewItem, action: 'ACCEPT' | 'REJECT') => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Clock3}
        title="Nothing to review"
        hint="The live review queue is empty right now. New items only appear when enrichment finds a medium-confidence or conflicting owner/phone match."
      />
    );
  }

  return (
    <Panel title="Queued review items" padded={false} className="rounded-2xl">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Property</th>
              <th className="px-4 py-3 font-medium">Comparison</th>
              <th className="px-4 py-3 font-medium">Signals</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Queued</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => {
              const pending = actionLoading === item.id;
              return (
                <tr key={item.id} className="align-top transition-colors hover:bg-muted/20">
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">
                        {item.canonical_address || 'Address unavailable'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.provider || 'Unknown source'}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{item.lead_id}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-border bg-muted/20 p-3">
                        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <Users size={12} />
                          Owner
                        </div>
                        <div className="grid gap-1 text-sm">
                          <div className="text-muted-foreground">
                            Current:{' '}
                            <span className="font-medium text-foreground">
                              {item.current_owner_name || 'None'}
                            </span>
                          </div>
                          <div className="text-muted-foreground">
                            Suggested:{' '}
                            <span className="font-semibold text-primary">
                              {item.suggested_owner_name || 'Unavailable'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {(item.current_phone || item.suggested_phone) && (
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                            <Phone size={12} />
                            Phone
                          </div>
                          <div className="grid gap-1 text-sm">
                            <div className="text-muted-foreground">
                              Current:{' '}
                              <span className="font-medium text-foreground">
                                {item.current_phone || 'None'}
                              </span>
                            </div>
                            <div className="text-muted-foreground">
                              Suggested:{' '}
                              <span className="font-semibold text-primary">
                                {item.suggested_phone || 'Unavailable'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      <StatusPill tone={confidenceTone(item.confidence)}>
                        {confidenceLabel(item.confidence || 'NO_MATCH')}
                      </StatusPill>
                      <div className="text-xs text-muted-foreground">
                        Match score{' '}
                        <span className="font-semibold tabular-nums text-foreground">
                          {item.match_score ?? '—'}/100
                        </span>
                      </div>
                      <div className="max-w-xs text-xs text-muted-foreground">
                        {item.reason || 'No explicit review reason was recorded.'}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <StatusPill tone={reviewTone(item.review_status)}>
                      {item.review_status}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm text-foreground">
                      {formatRelativeTime(item.created_at)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        aria-label={`View evidence for ${item.canonical_address || item.lead_id}`}
                        onClick={() => onOpenEvidence(item)}
                        className={`${buttonSecondary} px-3 py-2`}
                      >
                        <Eye size={15} />
                        Evidence
                      </button>
                      {item.review_status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            aria-label={`Reject match for ${item.canonical_address || item.lead_id}`}
                            disabled={pending}
                            onClick={() => onAction(item, 'REJECT')}
                            className={`${buttonSecondary} border-danger/20 bg-danger/10 px-3 py-2 text-danger hover:bg-danger/20 disabled:opacity-50`}
                          >
                            <XCircle size={15} />
                            Reject
                          </button>
                          <button
                            type="button"
                            aria-label={`Accept match for ${item.canonical_address || item.lead_id}`}
                            disabled={pending}
                            onClick={() => onAction(item, 'ACCEPT')}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            <CheckCircle2 size={15} />
                            Accept
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
