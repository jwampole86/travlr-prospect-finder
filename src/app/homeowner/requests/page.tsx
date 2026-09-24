'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, MessageSquare, Plus, RefreshCw, X } from 'lucide-react';

interface SpecialRequest {
  id: string;
  title?: string | null;
  category: string;
  description: string | null;
  status: string;
  created_at: string;
}

const STATUS_CLASS: Record<string, string> = {
  submitted: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  in_review: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  approved: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  completed: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  declined: 'bg-red-500/10 text-red-600 border-red-500/20',
};

export default function HomeownerRequestsPage() {
  const supabase = createClient();
  const [leadId, setLeadId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [requests, setRequests] = useState<SpecialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Maintenance');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadRequests() {
    setLoading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      setUserId(userRes.user.id);

      const { data: propLinks } = await supabase
        .from('property_homeowners')
        .select('lead_id')
        .eq('homeowner_user_id', userRes.user.id)
        .limit(1);

      const primaryLeadId = propLinks?.[0]?.lead_id || null;
      setLeadId(primaryLeadId);
      if (!primaryLeadId) return;

      const { data } = await supabase
        .from('special_requests')
        .select('*')
        .eq('lead_id', primaryLeadId)
        .order('created_at', { ascending: false });

      setRequests((data || []) as SpecialRequest[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function submitRequest() {
    if (!leadId || !userId || !title.trim()) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from('special_requests')
      .insert({
        lead_id: leadId,
        homeowner_user_id: userId,
        title: title.trim(),
        category,
        description: description.trim(),
        status: 'submitted',
      })
      .select()
      .single();

    setSubmitting(false);
    if (!error && data) {
      setRequests((prev) => [data as SpecialRequest, ...prev]);
      setTitle('');
      setCategory('Maintenance');
      setDescription('');
      setShowNewRequest(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Special Requests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Submit and track maintenance, pricing, cleaning, and owner-use requests.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadRequests} className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Refresh requests">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowNewRequest(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            <Plus size={14} />
            New Request
          </button>
        </div>
      </div>

      {!leadId ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <MessageSquare size={28} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No property is linked to your homeowner account yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Contact your TRAVLR property manager to connect your property.</p>
        </div>
      ) : showNewRequest ? (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">New Request</h2>
            <button onClick={() => setShowNewRequest(false)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Title</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Brief title for your request" className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category</label>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none">
              <option>Maintenance</option>
              <option>Improvement</option>
              <option>Cleaning</option>
              <option>Personal Use</option>
              <option>Pricing</option>
              <option>General</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="Add the details your property manager needs..." className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none resize-none" />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setShowNewRequest(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={submitRequest} disabled={submitting || !title.trim()} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60">
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <MessageSquare size={28} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No requests yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Use New Request when you need maintenance, cleaning, pricing, or owner-use help.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h2 className="text-sm font-semibold text-foreground">{request.title || request.category}</h2>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_CLASS[request.status] || STATUS_CLASS.submitted}`}>
                      {request.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {request.description && <p className="text-sm text-muted-foreground leading-relaxed">{request.description}</p>}
                  <p className="text-xs text-muted-foreground mt-2">{request.category} · {new Date(request.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
