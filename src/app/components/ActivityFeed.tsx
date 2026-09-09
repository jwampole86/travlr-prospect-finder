'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Upload,
  RefreshCw,
  Tag,
  MessageSquare,
  TrendingUp,
  CheckCircle,
  Plus,
  FileText,
  Users,
  Zap,
  Mail,
  Phone,
  Archive,
  RotateCcw,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  activityService,
  formatRelativeTime,
  type ActivityEvent,
  type ActivityEventType,
} from '@/lib/services/activityService';
import { usePortfolio } from '@/contexts/PortfolioContext';
import Link from 'next/link';

// ─── Icon + colour map ────────────────────────────────────────────────────────

const EVENT_ICON: Record<ActivityEventType, React.ElementType> = {
  lead_created: Plus,
  csv_imported: Upload,
  stage_changed: Tag,
  score_updated: TrendingUp,
  note_added: MessageSquare,
  note_edited: FileText,
  regulation_refreshed: RefreshCw,
  live_status: CheckCircle,
  lead_edited: FileText,
  contact_updated: Users,
  lead_assigned: Users,
  lead_archived: Archive,
  lead_restored: RotateCcw,
  bulk_update: Zap,
  enrichment_completed: Zap,
  outreach_sent: Mail,
  email_sent: Mail,
  sms_sent: Phone,
  call_completed: Phone,
};

const EVENT_COLOR: Record<ActivityEventType, string> = {
  lead_created: 'text-primary',
  csv_imported: 'text-primary',
  stage_changed: 'text-warning',
  score_updated: 'text-success',
  note_added: 'text-secondary',
  note_edited: 'text-secondary',
  regulation_refreshed: 'text-muted-foreground',
  live_status: 'text-success',
  lead_edited: 'text-blue-500',
  contact_updated: 'text-blue-500',
  lead_assigned: 'text-purple-500',
  lead_archived: 'text-muted-foreground',
  lead_restored: 'text-primary',
  bulk_update: 'text-warning',
  enrichment_completed: 'text-cyan-500',
  outreach_sent: 'text-blue-500',
  email_sent: 'text-blue-500',
  sms_sent: 'text-purple-500',
  call_completed: 'text-green-600',
};

// ─── Relative timestamp that ticks every minute ───────────────────────────────

function LiveTimestamp({ isoString }: { isoString: string }) {
  const [label, setLabel] = useState(() => formatRelativeTime(isoString));

  useEffect(() => {
    const tick = () => setLabel(formatRelativeTime(isoString));
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [isoString]);

  return <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{label}</span>;
}

// ─── Component ────────────────────────────────────────────────────────────────

const INITIAL_LIMIT = 8;
const LOAD_MORE_INCREMENT = 25;
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds — never spin forever

/** Wrap a promise with a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selectedPortfolio } = usePortfolio();
  const stateCode = selectedPortfolio.stateCode;
  const displayedCountRef = useRef(INITIAL_LIMIT);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Keep a stable ref to the latest stateCode so the realtime callback
  // always uses the current portfolio without needing to re-subscribe.
  const stateCodeRef = useRef(stateCode);
  useEffect(() => {
    stateCodeRef.current = stateCode;
  }, [stateCode]);

  const loadFeed = useCallback(async (sc: string, limit = INITIAL_LIMIT) => {
    if (!mountedRef.current) return;
    setError(null);
    try {
      const data = await withTimeout(
        activityService.getFeed({ stateCode: sc, limit: limit + 1 }),
        FETCH_TIMEOUT_MS
      );
      if (!mountedRef.current) return;
      setHasMore(data.length > limit);
      setEvents(data.slice(0, limit));
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load activity');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Initial load + re-load when portfolio changes
  useEffect(() => {
    setLoading(true);
    displayedCountRef.current = INITIAL_LIMIT;
    loadFeed(stateCode, INITIAL_LIMIT);
  }, [stateCode, loadFeed]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    const newLimit = displayedCountRef.current + LOAD_MORE_INCREMENT;
    displayedCountRef.current = newLimit;
    try {
      const data = await withTimeout(
        activityService.getFeed({ stateCode: stateCodeRef.current, limit: newLimit + 1 }),
        FETCH_TIMEOUT_MS
      );
      if (!mountedRef.current) return;
      setHasMore(data.length > newLimit);
      setEvents(data.slice(0, newLimit));
    } catch {
      // Keep existing events on error
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  }, []);

  // Real-time subscription — handles instant updates without polling
  useEffect(() => {
    const supabase = createClient();
    const channelName = `activity-feed-${stateCode ?? 'all'}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_events' },
        () => loadFeed(stateCodeRef.current, displayedCountRef.current))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'activity_events' },
        () => loadFeed(stateCodeRef.current, displayedCountRef.current))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'activity_events' },
        () => loadFeed(stateCodeRef.current, displayedCountRef.current))
      .subscribe();

    // Fallback poll: every 1 HOUR — realtime handles near-instant updates.
    const ACTIVITY_POLL_INTERVAL_MS = 60 * 60 * 1000;
    const pollId = setInterval(
      () => loadFeed(stateCodeRef.current, displayedCountRef.current),
      ACTIVITY_POLL_INTERVAL_MS
    );

    return () => {
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [stateCode, loadFeed]);

  return (
    <div className="bg-card rounded-xl border border-border">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Latest changes across all leads</p>
        </div>
        <Link
          href="/activity-timeline"
          className="text-[11px] text-primary hover:underline shrink-0"
        >
          View All
        </Link>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 px-5 text-center gap-2">
          <p className="text-xs font-medium text-destructive">DATA ERROR</p>
          <p className="text-[11px] text-muted-foreground">{error}</p>
          <button
            onClick={() => loadFeed(stateCode, INITIAL_LIMIT)}
            className="text-[11px] text-primary hover:underline mt-1"
          >
            Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-5 text-center gap-2">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <RefreshCw size={14} className="text-muted-foreground" />
          </div>
          <p className="text-xs font-medium text-foreground">No recent activity</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Activity events are recorded as leads are created, updated, or moved through stages.
            Historical leads may not have activity records yet.
          </p>
          <Link
            href="/activity-timeline"
            className="text-[11px] text-primary hover:underline mt-1"
          >
            View full activity timeline →
          </Link>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {events.map((event) => {
              const IconComponent = EVENT_ICON[event.event_type] ?? FileText;
              const colorClass = EVENT_COLOR[event.event_type] ?? 'text-muted-foreground';

              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-muted/30 transition-colors duration-100"
                >
                  <div className={`mt-0.5 shrink-0 ${colorClass}`}>
                    <IconComponent size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground leading-snug">
                      {event.description}
                    </p>
                    {event.detail && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {event.detail}
                      </p>
                    )}
                  </div>
                  <LiveTimestamp isoString={event.event_timestamp} />
                </div>
              );
            })}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="px-5 py-3 border-t border-border">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] text-primary hover:underline disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <ChevronDown size={11} />
                )}
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}