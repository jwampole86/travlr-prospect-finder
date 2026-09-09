'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { FileText, CheckCircle2, XCircle, Clock, ExternalLink, RefreshCw, Search, ChevronDown, File, Check, X, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewStatus = 'pending_review' | 'under_review' | 'approved' | 'rejected';

interface DocReviewItem {
  id: string;
  lead_id: string;
  homeowner_user_id: string;
  step_number: number;
  document_category: string;
  file_name: string;
  file_url: string;
  file_size_bytes?: number;
  mime_type?: string;
  notes?: string;
  review_status: ReviewStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  uploaded_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_NAMES: Record<number, string> = {
  1: 'Assessment & Prep',
  2: 'Legal & Compliance',
  3: 'Photography & Content',
  4: 'Operations Setup',
  5: 'Listing Creation',
  6: 'Pre-Launch QA',
};

const DOC_CATEGORY_LABELS: Record<string, string> = {
  str_permit: 'STR Permit',
  hoa_approval: 'HOA Approval',
  tot_registration: 'TOT Registration',
  inspection_report: 'Inspection Report',
  property_photos: 'Property Photos',
  floor_plan: 'Floor Plan',
  insurance: 'Insurance',
  other: 'Other',
};

const REVIEW_STATUS_CONFIG: Record<ReviewStatus, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  pending_review: {
    label: 'Pending Review',
    icon: <Clock size={12} />,
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
    border: 'border-amber-200',
  },
  under_review: {
    label: 'Under Review',
    icon: <Eye size={12} />,
    color: 'text-blue-600',
    bg: 'bg-blue-500/10',
    border: 'border-blue-200',
  },
  approved: {
    label: 'Approved',
    icon: <CheckCircle2 size={12} />,
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-200',
  },
  rejected: {
    label: 'Rejected',
    icon: <XCircle size={12} />,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-200',
  },
};

function formatBytes(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OnboardingDocumentReviewPage() {
  const supabase = createClient();
  const [docs, setDocs] = useState<DocReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('pending_review');
  const [search, setSearch] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('str_checklist_documents')
        .select('*')
        .order('uploaded_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('review_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDocs((data ?? []) as DocReviewItem[]);
    } catch (err) {
      // If table doesn't exist yet, show empty state gracefully
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, statusFilter]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  async function handleReview(docId: string, newStatus: 'approved' | 'rejected' | 'under_review') {
    setReviewingId(docId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('str_checklist_documents')
        .update({
          review_status: newStatus,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes[docId] || null,
        })
        .eq('id', docId);

      if (error) throw error;

      setDocs(prev => prev.map(d =>
        d.id === docId
          ? { ...d, review_status: newStatus, reviewed_at: new Date().toISOString(), review_notes: reviewNotes[docId] || undefined }
          : d
      ));

      const statusLabel = REVIEW_STATUS_CONFIG[newStatus].label;
      toast.success(`Document marked as ${statusLabel}`);

      // If approved, auto-advance the checklist step to in_progress if still pending
      if (newStatus === 'approved') {
        const doc = docs.find(d => d.id === docId);
        if (doc) {
          const { data: stepData } = await supabase
            .from('str_checklist_steps')
            .select('id, status')
            .eq('lead_id', doc.lead_id)
            .eq('step_number', doc.step_number)
            .single();

          if (stepData && stepData.status === 'pending') {
            await supabase
              .from('str_checklist_steps')
              .update({
                status: 'in_progress',
                source_event: 'document_approved',
                auto_updated: true,
                updated_at: new Date().toISOString(),
              })
              .eq('id', stepData.id);
          }
        }
      }
    } catch (err) {
      toast.error('Failed to update review status');
    } finally {
      setReviewingId(null);
    }
  }

  const filtered = docs.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.file_name.toLowerCase().includes(q) ||
      d.lead_id.toLowerCase().includes(q) ||
      DOC_CATEGORY_LABELS[d.document_category]?.toLowerCase().includes(q)
    );
  });

  const pendingCount = docs.filter(d => d.review_status === 'pending_review').length;
  const approvedCount = docs.filter(d => d.review_status === 'approved').length;
  const rejectedCount = docs.filter(d => d.review_status === 'rejected').length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Onboarding Document Review</h1>
              <p className="text-xs text-muted-foreground">Review and approve documents uploaded by homeowners during STR onboarding</p>
            </div>
          </div>
          <button
            onClick={loadDocs}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-muted/20 shrink-0 flex-wrap">
          {[
            { label: 'Pending Review', count: pendingCount, color: 'text-amber-600', bg: 'bg-amber-500/10', status: 'pending_review' as const },
            { label: 'Approved', count: approvedCount, color: 'text-emerald-600', bg: 'bg-emerald-500/10', status: 'approved' as const },
            { label: 'Rejected', count: rejectedCount, color: 'text-red-500', bg: 'bg-red-500/10', status: 'rejected' as const },
            { label: 'All', count: docs.length, color: 'text-foreground', bg: 'bg-muted', status: 'all' as const },
          ].map(stat => (
            <button
              key={stat.status}
              onClick={() => setStatusFilter(stat.status as ReviewStatus | 'all')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${statusFilter === stat.status ? `${stat.bg} border-current ${stat.color}` : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}
            >
              <span className={`font-bold ${statusFilter === stat.status ? stat.color : ''}`}>{stat.count}</span>
              {stat.label}
            </button>
          ))}

          <div className="ml-auto relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground w-48"
            />
          </div>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <FileText size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                {statusFilter === 'pending_review' ? 'No documents pending review' : 'No documents found'}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {statusFilter === 'pending_review' ?'All uploaded documents have been reviewed. Check back when homeowners upload new files.' :'Try adjusting your filter or search.'}
              </p>
            </div>
          ) : (
            <div className="max-w-4xl space-y-2">
              {filtered.map(doc => {
                const statusCfg = REVIEW_STATUS_CONFIG[doc.review_status];
                const isExpanded = expandedId === doc.id;
                const isReviewing = reviewingId === doc.id;

                return (
                  <div
                    key={doc.id}
                    className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-primary/30 shadow-sm' : 'border-border'}`}
                  >
                    {/* Doc row */}
                    <div
                      className="flex items-center gap-3 p-3.5 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                    >
                      <div className="w-9 h-9 rounded-xl bg-muted border border-border flex items-center justify-center shrink-0">
                        <File size={16} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground truncate max-w-[200px]">{doc.file_name}</p>
                          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
                            {statusCfg.icon}
                            {statusCfg.label}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                            {DOC_CATEGORY_LABELS[doc.document_category] ?? doc.document_category}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                          <span>Step {doc.step_number}: {STEP_NAMES[doc.step_number]}</span>
                          {doc.file_size_bytes && <span>{formatBytes(doc.file_size_bytes)}</span>}
                          <span>Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        {doc.file_url && !doc.file_url.startsWith('pending-upload:') && (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="View file"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                      <ChevronDown size={14} className={`text-muted-foreground transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>

                    {/* Expanded review panel */}
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/10 p-4 space-y-4">
                        {doc.notes && (
                          <div className="p-3 bg-card border border-border rounded-lg">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Homeowner Note</p>
                            <p className="text-xs text-foreground">{doc.notes}</p>
                          </div>
                        )}

                        {doc.reviewed_at && (
                          <div className="text-[11px] text-muted-foreground">
                            Last reviewed: {new Date(doc.reviewed_at).toLocaleString()}
                            {doc.review_notes && <span className="ml-2 text-foreground">— &ldquo;{doc.review_notes}&rdquo;</span>}
                          </div>
                        )}

                        {/* Review notes input */}
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                            Review Notes (optional)
                          </label>
                          <textarea
                            value={reviewNotes[doc.id] ?? ''}
                            onChange={e => setReviewNotes(prev => ({ ...prev, [doc.id]: e.target.value }))}
                            placeholder="Add notes for the homeowner or internal record…"
                            rows={2}
                            className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                          />
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleReview(doc.id, 'under_review')}
                            disabled={isReviewing || doc.review_status === 'under_review'}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:opacity-50 ${doc.review_status === 'under_review' ? 'bg-blue-500/10 text-blue-600 border-blue-200' : 'border-border text-muted-foreground hover:bg-muted'}`}
                          >
                            {isReviewing ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
                            Mark Under Review
                          </button>
                          <button
                            onClick={() => handleReview(doc.id, 'approved')}
                            disabled={isReviewing || doc.review_status === 'approved'}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all disabled:opacity-50 ${doc.review_status === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200' : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'}`}
                          >
                            {isReviewing ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                            Approve
                          </button>
                          <button
                            onClick={() => handleReview(doc.id, 'rejected')}
                            disabled={isReviewing || doc.review_status === 'rejected'}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all disabled:opacity-50 ${doc.review_status === 'rejected' ? 'bg-red-500/10 text-red-500 border-red-200' : 'bg-red-600 text-white border-red-600 hover:bg-red-700'}`}
                          >
                            {isReviewing ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                            Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
