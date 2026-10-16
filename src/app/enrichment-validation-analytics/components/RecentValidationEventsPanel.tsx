'use client';

import { CheckCircle2, Eye, XCircle, Zap } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { RecentEvent } from './types';

function confidenceTone(score: number | null) {
  if (score === null) return 'default' as const;
  if (score >= 80) return 'success' as const;
  if (score >= 60) return 'warning' as const;
  return 'danger' as const;
}

function recommendationTone(value: string | null) {
  switch (value) {
    case 'accept':
      return 'success' as const;
    case 'review':
      return 'warning' as const;
    case 'reject':
      return 'danger' as const;
    default:
      return 'default' as const;
  }
}

function formatRelativeTime(iso: string) {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
  return rtf.format(Math.round(diffHours / 24), 'day');
}

export default function RecentValidationEventsPanel({ events }: { events: RecentEvent[] }) {
  return (
    <Panel title="Recent validation events" icon={Eye} padded={false} className="rounded-2xl">
      {events.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Eye}
            title="No validation events yet"
            hint="The live enrichment validation table is currently empty for this timeframe."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
                <th className="px-4 py-3 font-medium">Confidence</th>
                <th className="px-4 py-3 font-medium">Recommendation</th>
                <th className="px-4 py-3 font-medium">Cache</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((event) => (
                <tr key={event.id} className="transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="text-sm text-foreground">
                      {formatRelativeTime(event.created_at)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">{event.source || 'Unknown'}</td>
                  <td className="px-4 py-3">
                    {event.passed ? (
                      <StatusPill tone="success" icon={CheckCircle2}>
                        Pass
                      </StatusPill>
                    ) : (
                      <StatusPill tone="danger" icon={XCircle}>
                        Fail
                      </StatusPill>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <StatusPill tone={confidenceTone(event.overall_confidence)}>
                        Overall {event.overall_confidence ?? '—'}
                      </StatusPill>
                      <StatusPill tone={confidenceTone(event.ownership_confidence)}>
                        Owner {event.ownership_confidence ?? '—'}
                      </StatusPill>
                      <StatusPill tone={confidenceTone(event.market_comp_confidence)}>
                        Comps {event.market_comp_confidence ?? '—'}
                      </StatusPill>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={recommendationTone(event.recommendation)}>
                      {event.recommendation || 'unknown'}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3">
                    {event.cache_hit ? (
                      <StatusPill tone="primary" icon={Zap}>
                        Hit
                      </StatusPill>
                    ) : (
                      <span className="text-xs text-muted-foreground">Miss</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
