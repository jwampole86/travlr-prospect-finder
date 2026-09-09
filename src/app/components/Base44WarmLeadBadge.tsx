'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Flame, X, ArrowRight, MapPin } from 'lucide-react';

interface WarmLeadNotice {
  id: string;
  lead_id: string;
  address: string;
  contact_name: string;
  received_at: string;
  status: 'matched' | 'created';
}

const STORAGE_KEY = 'base44_dismissed_leads';

function getDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function addDismissed(id: string) {
  const set = getDismissed();
  set.add(id);
  // Keep only last 50 to avoid bloat
  const arr = Array.from(set).slice(-50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Base44WarmLeadBadge() {
  const [notices, setNotices] = useState<WarmLeadNotice[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDismissed(getDismissed());
  }, []);

  const fetchRecent = useCallback(async () => {
    const supabase = createClient();
    // Fetch Base44 webhook logs that resulted in a lead (matched or created) in the last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('webhook_logs')
      .select('id, lead_id, payload, status, received_at')
      .eq('source', 'base44_estimate')
      .in('status', ['matched', 'created'])
      .gte('received_at', since)
      .order('received_at', { ascending: false })
      .limit(5);

    if (data) {
      const items: WarmLeadNotice[] = data
        .filter((r) => r.lead_id)
        .map((r) => {
          const p = (r.payload ?? {}) as Record<string, unknown>;
          const firstName = (p.first_name ?? p.firstName ?? '') as string;
          const lastName = (p.last_name ?? p.lastName ?? '') as string;
          const name = [firstName, lastName].filter(Boolean).join(' ') || (p.email as string) || 'Unknown';
          const address = (p.address ?? p.property_address ?? p.propertyAddress ?? '') as string;
          return {
            id: r.id,
            lead_id: r.lead_id,
            address,
            contact_name: name,
            received_at: r.received_at,
            status: r.status as 'matched' | 'created',
          };
        });
      setNotices(items);
    }
  }, []);

  useEffect(() => {
    fetchRecent();

    const supabase = createClient();
    const channel = supabase
      .channel('base44-warm-leads-badge')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'webhook_logs',
        filter: 'source=eq.base44_estimate',
      }, () => {
        fetchRecent();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'webhook_logs',
        filter: 'source=eq.base44_estimate',
      }, () => {
        fetchRecent();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchRecent]);

  if (!mounted) return null;

  const visible = notices.filter((n) => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    addDismissed(id);
    setDismissed((prev) => new Set([...prev, id]));
  }

  function dismissAll() {
    visible.forEach((n) => addDismissed(n.id));
    setDismissed((prev) => new Set([...prev, ...visible.map((n) => n.id)]));
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
          </span>
          <span className="text-xs font-semibold text-foreground">
            {visible.length} Base44 Warm Lead{visible.length !== 1 ? 's' : ''} Arrived
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/base44-submissions"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            View all
            <ArrowRight size={10} />
          </Link>
          {visible.length > 1 && (
            <button
              onClick={dismissAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss all
            </button>
          )}
        </div>
      </div>

      {/* Notice cards */}
      {visible.map((notice) => (
        <div
          key={notice.id}
          className="relative flex items-start gap-3 p-3 rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800/50 dark:bg-orange-950/20"
        >
          <div className="p-1.5 rounded-md bg-orange-100 dark:bg-orange-900/40 shrink-0 mt-0.5">
            <Flame size={13} className="text-orange-600 dark:text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground">{notice.contact_name}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                notice.status === 'created' ?'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' :'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
              }`}>
                {notice.status === 'created' ? 'New Lead' : 'Matched'}
              </span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(notice.received_at)}</span>
            </div>
            {notice.address && (
              <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                <MapPin size={10} />
                <span className="truncate">{notice.address}</span>
              </div>
            )}
            <Link
              href={`/lead-record?id=${notice.lead_id}`}
              className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-primary hover:underline"
            >
              View Lead
              <ArrowRight size={10} />
            </Link>
          </div>
          <button
            onClick={() => dismiss(notice.id)}
            className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
