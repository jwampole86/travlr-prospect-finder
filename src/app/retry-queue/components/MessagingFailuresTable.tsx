'use client';

import Link from 'next/link';
import { ExternalLink, Loader2, Mail, MessageSquare, RefreshCw } from 'lucide-react';
import { EmptyState, Panel, StatusPill, buttonSecondary } from '@/components/ops';
import type { MessagingFailureItem } from '../types';
import { shortDateTime, toneForStatus, titleize } from '../utils';

export function MessagingFailuresTable({
  items,
  loading,
  actionKey,
  onRetry,
}: {
  items: MessagingFailureItem[];
  loading: boolean;
  actionKey: string | null;
  onRetry: (item: MessagingFailureItem) => void;
}) {
  if (!loading && items.length === 0) {
    return <EmptyState icon={MessageSquare} title="No message delivery failures found" hint="Failed outreach_history rows for SMS and email will appear here." />;
  }

  return (
    <Panel title="Message retries" padded={false}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Failure</th>
              <th className="px-4 py-3 font-medium">Preview</th>
              <th className="px-4 py-3 font-medium">Sent</th>
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
                      {item.leadId ? (
                        <Link href={`/lead-profile?id=${encodeURIComponent(item.leadId)}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          View lead <ExternalLink size={11} />
                        </Link>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{item.propertyLabel}</p>
                    {item.sequenceName ? <StatusPill>{item.sequenceName}</StatusPill> : null}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-2">
                    <StatusPill tone={toneForStatus(item.status)} icon={item.channel === 'sms' ? MessageSquare : Mail}>
                      {item.channel === 'sms' ? 'SMS' : 'Email'}
                    </StatusPill>
                    <p className="text-xs text-muted-foreground break-all">{item.recipient || 'Recipient missing'}</p>
                  </div>
                </td>
                <td className="px-4 py-4 text-muted-foreground min-w-[220px]">
                  <p className="text-foreground">{item.errorMessage || 'Delivery failed'}</p>
                  {item.errorCode ? <p className="mt-1 text-xs">Code: {item.errorCode}</p> : null}
                </td>
                <td className="px-4 py-4 text-muted-foreground min-w-[280px]">
                  <p className="text-foreground line-clamp-3">{item.preview || 'No message preview saved'}</p>
                  {item.subject ? <p className="mt-1 text-xs">Subject: {item.subject}</p> : null}
                </td>
                <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">
                  {shortDateTime(item.sentAt || item.updatedAt)}
                </td>
                <td className="px-4 py-4">
                  {item.retryable && item.retryPayload ? (
                    <button
                      type="button"
                      onClick={() => onRetry(item)}
                      className={buttonSecondary}
                      disabled={actionKey === `message:${item.id}`}
                    >
                      {actionKey === `message:${item.id}` ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Retry via {item.channel === 'sms' ? '/api/sms/send' : '/api/send-homeowner-email'}
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground">{item.retryDisabledReason || `Not retryable`}</p>
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
