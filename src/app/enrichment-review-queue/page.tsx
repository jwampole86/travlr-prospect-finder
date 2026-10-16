'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  buttonSecondary,
  ErrorBanner,
  inputClass,
  LoadingState,
  PageHeader,
  SegmentedTabs,
  StatGrid,
} from '@/components/ops';
import type { Stat } from '@/components/ops';
import { createClient } from '@/lib/supabase/client';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  Shield,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import ReviewEvidenceModal from './components/ReviewEvidenceModal';
import ReviewQueueTable from './components/ReviewQueueTable';
import type { ReviewItem } from './components/types';

type ReviewTab = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'ALL';

const EMPTY_COUNTS = { PENDING: 0, ACCEPTED: 0, REJECTED: 0 };

export default function EnrichmentReviewQueuePage() {
  const supabase = createClient();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [filterStatus, setFilterStatus] = useState<ReviewTab>('PENDING');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState(EMPTY_COUNTS);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      let itemsQuery = supabase
        .from('enrichment_review_queue')
        .select('*, enrichment_jobs(canonical_address)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filterStatus !== 'ALL') {
        itemsQuery = itemsQuery.eq('review_status', filterStatus);
      }

      const [itemsResult, pendingCountResult, acceptedCountResult, rejectedCountResult] =
        await Promise.all([
          itemsQuery,
          supabase
            .from('enrichment_review_queue')
            .select('*', { count: 'exact', head: true })
            .eq('review_status', 'PENDING'),
          supabase
            .from('enrichment_review_queue')
            .select('*', { count: 'exact', head: true })
            .eq('review_status', 'ACCEPTED'),
          supabase
            .from('enrichment_review_queue')
            .select('*', { count: 'exact', head: true })
            .eq('review_status', 'REJECTED'),
        ]);

      for (const result of [
        itemsResult,
        pendingCountResult,
        acceptedCountResult,
        rejectedCountResult,
      ]) {
        if (result.error) {
          throw result.error;
        }
      }

      const mapped = (itemsResult.data || []).map((item: Record<string, unknown>) => ({
        ...item,
        canonical_address:
          ((item.enrichment_jobs as Record<string, unknown>)?.canonical_address as string) || '',
      })) as ReviewItem[];

      setItems(mapped);
      setStatusCounts({
        PENDING: pendingCountResult.count || 0,
        ACCEPTED: acceptedCountResult.count || 0,
        REJECTED: rejectedCountResult.count || 0,
      });
      setLastLoadedAt(new Date().toISOString());
    } catch (error) {
      console.error('[enrichment-review-queue]', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load the review queue.');
      setItems([]);
      setStatusCounts(EMPTY_COUNTS);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, supabase]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;

    return items.filter((item) =>
      [item.suggested_owner_name, item.current_owner_name, item.canonical_address, item.lead_id]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [items, search]);

  async function handleAction(item: ReviewItem, action: 'ACCEPT' | 'REJECT') {
    setActionLoading(item.id);
    try {
      const res = await fetch('/api/enrichment/review-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId: item.id,
          matchId: item.match_id,
          leadId: item.lead_id,
          action,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Review action failed');
      }

      toast.success(
        action === 'ACCEPT'
          ? 'Match accepted and applied to the canonical lead profile.'
          : 'Match rejected and removed from the pending queue.'
      );

      if (selectedItem?.id === item.id) {
        setSelectedItem(null);
      }
      await loadItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to process the review action.');
    } finally {
      setActionLoading(null);
    }
  }

  const stats: Stat[] = [
    {
      label: 'Pending review',
      value: statusCounts.PENDING.toLocaleString(),
      hint: 'Needs a human decision before updating the lead',
      icon: Clock3,
      tone: statusCounts.PENDING > 0 ? 'warning' : 'default',
    },
    {
      label: 'Accepted',
      value: statusCounts.ACCEPTED.toLocaleString(),
      hint: 'Persisted approvals reflected in the queue history',
      icon: CheckCircle2,
      tone: 'success',
    },
    {
      label: 'Rejected',
      value: statusCounts.REJECTED.toLocaleString(),
      hint: 'Closed without changing the canonical lead',
      icon: XCircle,
      tone: 'danger',
    },
    {
      label: 'Visible rows',
      value: filteredItems.length.toLocaleString(),
      hint: search.trim() ? 'After search filtering' : 'Most recent 100 review records',
      icon: Shield,
      tone: 'primary',
    },
  ];

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader
          icon={AlertCircle}
          title="Enrichment Review Queue"
          description="Review medium-confidence or conflicting owner/phone enrichment matches before they update the canonical lead profile."
          actions={
            <button
              type="button"
              onClick={loadItems}
              className={buttonSecondary}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          }
        />

        <StatGrid stats={stats} columns={4} />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedTabs<ReviewTab>
            value={filterStatus}
            onChange={setFilterStatus}
            tabs={[
              { key: 'PENDING', label: 'Pending', badge: statusCounts.PENDING },
              { key: 'ACCEPTED', label: 'Accepted' },
              { key: 'REJECTED', label: 'Rejected' },
              { key: 'ALL', label: 'All history' },
            ]}
          />

          <div className="flex w-full max-w-md items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search address, owner, or lead id"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>
        </div>

        {errorMessage && <ErrorBanner message={errorMessage} onRetry={loadItems} />}

        {lastLoadedAt && !loading && (
          <div className="text-xs text-muted-foreground">
            Last synced with Supabase {new Date(lastLoadedAt).toLocaleString()}.
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading live review queue…" />
        ) : (
          <ReviewQueueTable
            items={filteredItems}
            actionLoading={actionLoading}
            onOpenEvidence={setSelectedItem}
            onAction={handleAction}
          />
        )}
      </div>

      {selectedItem && (
        <ReviewEvidenceModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAccept={(item) => handleAction(item, 'ACCEPT')}
          onReject={(item) => handleAction(item, 'REJECT')}
        />
      )}
    </AppLayout>
  );
}
