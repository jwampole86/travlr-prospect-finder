'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppLayout from '@/components/AppLayout';
import { CheckCircle2, XCircle, Search, RefreshCw, AlertCircle, Eye, Users, Phone, FileText, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { confidenceColor, confidenceLabel } from '@/lib/services/ownerEnrichmentService';

interface ReviewItem {
  id: string;
  lead_id: string;
  job_id: string | null;
  match_id: string | null;
  current_owner_name: string | null;
  suggested_owner_name: string | null;
  current_phone: string | null;
  suggested_phone: string | null;
  confidence: string | null;
  match_score: number | null;
  evidence: Record<string, unknown>;
  provider: string | null;
  reason: string | null;
  review_status: string;
  created_at: string;
  // joined
  canonical_address?: string;
}

interface EvidenceModalProps {
  item: ReviewItem;
  onClose: () => void;
  onAccept: (item: ReviewItem) => void;
  onReject: (item: ReviewItem) => void;
}

function EvidenceModal({ item, onClose, onAccept, onReject }: EvidenceModalProps) {
  const signals = (item.evidence as Record<string, unknown>)?.signals as Array<{ signal: string; score: number; present: boolean; evidence?: string }> || [];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Eye size={16} />
            Enrichment Evidence
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XCircle size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Property Evidence */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Property Evidence</h3>
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span className="text-foreground font-medium">{item.canonical_address || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Provider</span><span className="text-foreground">{item.provider || '—'}</span></div>
            </div>
          </div>

          {/* Owner Evidence */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Owner Evidence</h3>
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Current Owner</span><span className="text-foreground font-medium">{item.current_owner_name || 'None on file'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Suggested Owner</span><span className="text-foreground font-semibold text-primary">{item.suggested_owner_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Confidence</span>
                {item.confidence && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${confidenceColor(item.confidence)}`}>
                    {confidenceLabel(item.confidence)}
                  </span>
                )}
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Match Score</span><span className="text-foreground">{item.match_score ?? '—'} / 100</span></div>
            </div>
          </div>

          {/* Phone Evidence */}
          {(item.current_phone || item.suggested_phone) && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Phone Evidence</h3>
              <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Current Phone</span><span className="text-foreground">{item.current_phone || 'None on file'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Suggested Phone</span><span className="text-foreground font-semibold text-primary">{item.suggested_phone || '—'}</span></div>
              </div>
            </div>
          )}

          {/* Match Signals */}
          {signals.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Match Explanation</h3>
              <div className="space-y-1">
                {signals.filter(s => s.present || s.score < 0).map((s, i) => (
                  <div key={i} className={`flex items-center justify-between p-2 rounded-lg text-xs ${s.score < 0 ? 'bg-red-500/5 border border-red-500/20' : s.present ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-muted/50 border border-border/50'}`}>
                    <div className="flex items-center gap-2">
                      {s.score < 0 ? <XCircle size={12} className="text-red-500" /> : s.present ? <CheckCircle2 size={12} className="text-emerald-500" /> : <AlertCircle size={12} className="text-muted-foreground" />}
                      <span className={s.score < 0 ? 'text-red-700 dark:text-red-400' : s.present ? 'text-foreground' : 'text-muted-foreground'}>
                        {s.signal.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    </div>
                    <span className={`font-semibold ${s.score < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {s.score > 0 ? '+' : ''}{s.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reason */}
          {item.reason && (
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
              <strong>Review Reason:</strong> {item.reason}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
            Close
          </button>
          <button
            onClick={() => { onReject(item); onClose(); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-500/10 text-red-600 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            <XCircle size={14} />
            Reject Match
          </button>
          <button
            onClick={() => { onAccept(item); onClose(); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-colors"
          >
            <CheckCircle2 size={14} />
            Accept Match
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EnrichmentReviewQueue() {
  const supabase = createClient();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [filterStatus, setFilterStatus] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('enrichment_review_queue')
        .select('*, enrichment_jobs(canonical_address)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filterStatus !== 'ALL') {
        query = query.eq('review_status', filterStatus);
      }

      const { data } = await query;
      const mapped = (data || []).map((item: Record<string, unknown>) => ({
        ...item,
        canonical_address: (item.enrichment_jobs as Record<string, unknown>)?.canonical_address as string || '',
      })) as ReviewItem[];

      setItems(mapped);
    } catch (err) {
      console.error('Load review queue error:', err);
    }
    setLoading(false);
  }, [supabase, filterStatus]);

  useEffect(() => { loadItems(); }, [loadItems]);

  async function handleAction(item: ReviewItem, action: 'ACCEPT' | 'REJECT', reason?: string) {
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
          reason,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(action === 'ACCEPT' ? 'Match accepted and applied to property profile' : 'Match rejected');
        loadItems();
      } else {
        toast.error(data.error || 'Action failed');
      }
    } catch {
      toast.error('Failed to process action');
    }
    setActionLoading(null);
  }

  const filtered = items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.suggested_owner_name?.toLowerCase().includes(q) ||
      item.canonical_address?.toLowerCase().includes(q) ||
      item.lead_id?.toLowerCase().includes(q)
    );
  });

  const statusCounts = {
    PENDING: items.filter(i => i.review_status === 'PENDING').length,
    ACCEPTED: items.filter(i => i.review_status === 'ACCEPTED').length,
    REJECTED: items.filter(i => i.review_status === 'REJECTED').length,
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <AlertCircle size={22} className="text-amber-500" />
              Enrichment Review Queue
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review owner and phone matches before attaching to property profiles
            </p>
          </div>
          <button onClick={loadItems} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-xl w-fit">
          {[
            { key: 'PENDING', label: `Pending (${statusCounts.PENDING})` },
            { key: 'ACCEPTED', label: `Accepted (${statusCounts.ACCEPTED})` },
            { key: 'REJECTED', label: `Rejected (${statusCounts.REJECTED})` },
            { key: 'ALL', label: 'All' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${filterStatus === tab.key ? 'bg-card text-foreground font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by owner, address..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Shield size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No items in review queue</p>
              <p className="text-xs mt-1">Medium-confidence and conflict matches will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Property</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Current Owner</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Suggested Owner</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Confidence</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Score</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Provider</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Reason</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 max-w-[160px]">
                        <div className="truncate text-foreground font-medium">{item.canonical_address || item.lead_id}</div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{item.current_owner_name || <span className="italic">None on file</span>}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Users size={12} className="text-primary shrink-0" />
                          <span className="text-foreground font-medium">{item.suggested_owner_name || '—'}</span>
                        </div>
                        {item.suggested_phone && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Phone size={12} className="text-teal-500 shrink-0" />
                            <span className="text-muted-foreground">{item.suggested_phone}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {item.confidence ? (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${confidenceColor(item.confidence)}`}>
                            {confidenceLabel(item.confidence)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-4 text-foreground">{item.match_score ?? '—'}</td>
                      <td className="py-3 px-4 text-muted-foreground">{item.provider || '—'}</td>
                      <td className="py-3 px-4 max-w-[140px]">
                        <span className="text-muted-foreground truncate block">{item.reason || '—'}</span>
                      </td>
                      <td className="py-3 px-4">
                        {item.review_status === 'PENDING' ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setSelectedItem(item)}
                              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                              title="View Evidence"
                            >
                              <FileText size={13} />
                            </button>
                            <button
                              onClick={() => handleAction(item, 'ACCEPT')}
                              disabled={actionLoading === item.id}
                              className="p-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors text-emerald-600"
                              title="Accept Match"
                            >
                              {actionLoading === item.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                            </button>
                            <button
                              onClick={() => handleAction(item, 'REJECT')}
                              disabled={actionLoading === item.id}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-red-500"
                              title="Reject Match"
                            >
                              <XCircle size={13} />
                            </button>
                          </div>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${item.review_status === 'ACCEPTED' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                            {item.review_status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Evidence Modal */}
        {selectedItem && (
          <EvidenceModal
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onAccept={(item) => handleAction(item, 'ACCEPT')}
            onReject={(item) => handleAction(item, 'REJECT')}
          />
        )}
      </div>
    </AppLayout>
  );
}
