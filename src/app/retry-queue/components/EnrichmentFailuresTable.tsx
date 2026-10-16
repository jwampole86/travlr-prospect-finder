'use client';

import Link from 'next/link';
import { ExternalLink, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { EmptyState, Panel, StatusPill, buttonSecondary } from '@/components/ops';
import type { EnrichmentFailureItem } from '../types';
import { relativeTime, shortDateTime, titleize, toneForStatus } from '../utils';

export function EnrichmentFailuresTable({
  items,
  loading,
  actionKey,
  onRetry,
}: {
  items: EnrichmentFailureItem[];
  loading: boolean;
  actionKey: string | null;
  onRetry: (item: EnrichmentFailureItem) => void;
}) {
  if (!loading && items.length === 0) {
    return <EmptyState icon={ShieldAlert} title="No unresolved enrichment errors found" hint="Open enrichment_error_logs rows will appear here." />;
  }

  return (
    <Panel title="Enrichment retries" padded={false}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Error</th>
              <th className="px-4 py-3 font-medium">Retries</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border align-top">
                <td className="px-4 py-4">
                  <div className="space-y-2 min-w-[220px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{item.leadLabel}</p>
                      <Link href={`/lead-profile?id=${encodeURIComponent(item.leadId)}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        View lead <ExternalLink size={11} />
                      </Link>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.propertyLabel}</p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-2">
                    <StatusPill tone={toneForStatus(item.enrichmentStatus)}>{titleize(item.enrichmentStatus || 'unknown')}</StatusPill>
                    {item.isTransient ? <StatusPill tone="warning">Transient</StatusPill> : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-muted-foreground min-w-[160px]">
                  <p className="text-foreground">{titleize(item.stage)}</p>
                  {item.apiProvider ? <p className="text-xs">Provider: {item.apiProvider}{item.apiHttpStatus ? ` · HTTP ${item.apiHttpStatus}` : ''}</p> : null}
                </td>
                <td className="px-4 py-4 text-muted-foreground min-w-[280px]">
                  <p className="text-foreground">{item.errorMessage}</p>
                  <p className="mt-1 text-xs">Code: {item.errorCode}</p>
                </td>
                <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">
                  <p className="tabular-nums text-foreground">{item.retryCount}</p>
                  <p className="text-xs">Last retry {relativeTime(item.lastRetryAt)}</p>
                  <p className="text-xs">Logged {shortDateTime(item.createdAt)}</p>
                </td>
                <td className="px-4 py-4">
                  {item.retryable ? (
                    <button
                      type="button"
                      onClick={() => onRetry(item)}
                      className={buttonSecondary}
                      disabled={actionKey === `enrichment:${item.id}`}
                    >
                      {actionKey === `enrichment:${item.id}` ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Queue enrichment retry
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground">{item.retryDisabledReason || 'Lead is not in a retryable enrichment state.'}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
