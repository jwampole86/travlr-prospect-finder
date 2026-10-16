'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { EmptyState, Panel, StatusPill, buttonSecondary } from '@/components/ops';
import type { SyncFailureItem } from '../types';
import { relativeTime, shortDateTime, titleize, toneForStatus } from '../utils';

export function SyncFailuresTable({
  items,
  loading,
  actionKey,
  onRetry,
}: {
  items: SyncFailureItem[];
  loading: boolean;
  actionKey: string | null;
  onRetry: (item: SyncFailureItem) => void;
}) {
  if (!loading && items.length === 0) {
    return <EmptyState icon={RefreshCw} title="No sync failures found" hint="Failed or retrying sync_events rows will appear here." />;
  }

  return (
    <Panel title="Sync operation retries" padded={false}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Operation</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">Last error</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border align-top">
                <td className="px-4 py-4">
                  <div className="space-y-2 min-w-[220px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={toneForStatus(item.status)}>{titleize(item.status)}</StatusPill>
                      <span className="font-semibold text-foreground">{titleize(item.operationType)}</span>
                    </div>
                    <div className="text-muted-foreground">
                      <p>{item.portfolio || item.operationId}</p>
                      <p className="text-xs">{item.sourceName || 'Route-managed operation'}{item.stateCode ? ` · ${item.stateCode}` : ''}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-2">
                    <StatusPill tone={toneForStatus(item.status)}>{titleize(item.status)}</StatusPill>
                    {item.nextRetryAt ? <p className="text-xs text-muted-foreground">Next retry {relativeTime(item.nextRetryAt)}</p> : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-muted-foreground">
                  <p className="tabular-nums text-foreground">{item.attemptCount} / {item.maxAttempts}</p>
                  <p className="text-xs">Created {shortDateTime(item.createdAt)}</p>
                </td>
                <td className="px-4 py-4 text-muted-foreground min-w-[260px]">
                  <p className="text-foreground">{item.lastError || 'No message saved'}</p>
                  {item.errorCode ? <p className="mt-1 text-xs">Code: {item.errorCode}</p> : null}
                </td>
                <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">
                  <p>{shortDateTime(item.updatedAt)}</p>
                </td>
                <td className="px-4 py-4">
                  {item.retryAction ? (
                    <button
                      type="button"
                      onClick={() => onRetry(item)}
                      className={buttonSecondary}
                      disabled={actionKey === `sync:${item.id}`}
                    >
                      {actionKey === `sync:${item.id}` ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      {item.retryAction.label}
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground">No real retry route is mapped for this event.</p>
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
