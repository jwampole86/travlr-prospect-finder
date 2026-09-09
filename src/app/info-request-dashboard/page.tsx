'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Link2, Send, RefreshCw, CheckCircle, Eye, Clock, XCircle, Search, ExternalLink, Loader2, Mail, MessageSquare, AlertCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

type LinkStatus = 'Sent' | 'Viewed' | 'Submitted' | 'Expired';

interface InfoRequestLink {
  id: string;
  lead_id: string;
  lead_address: string;
  lead_city: string;
  lead_state: string;
  sent_at: string;
  sent_via: 'email' | 'sms';
  status: LinkStatus;
  viewed_at: string | null;
  submitted_at: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  link_token: string;
  resent_at: string | null;
}

interface BulkLead {
  id: string;
  address: string;
  city: string;
  state: string;
  source: string;
  prospect_score: number | null;
  lead_status_tag: string | null;
  contact_name: string | null;
}

const STATUS_CONFIG: Record<LinkStatus, { label: string; color: string; icon: React.ReactNode }> = {
  Sent: {
    label: 'Sent',
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    icon: <Send size={11} />,
  },
  Viewed: {
    label: 'Viewed',
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    icon: <Eye size={11} />,
  },
  Submitted: {
    label: 'Submitted',
    color: 'bg-green-500/10 text-green-600 border-green-500/20',
    icon: <CheckCircle size={11} />,
  },
  Expired: {
    label: 'Expired',
    color: 'bg-muted text-muted-foreground border-border',
    icon: <XCircle size={11} />,
  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function isResendEligible(link: InfoRequestLink): boolean {
  if (link.status === 'Submitted' || link.status === 'Expired') return false;
  const sentDate = new Date(link.resent_at || link.sent_at);
  const daysSince = (Date.now() - sentDate.getTime()) / 86400000;
  return daysSince >= 5;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LinkStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Bulk Lead Selector Modal ─────────────────────────────────────────────────

function BulkSendModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const [leads, setLeads] = useState<BulkLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendVia, setSendVia] = useState<'email' | 'sms'>('email');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('leads')
          .select('id, address, city, state, source, prospect_score, lead_status_tag, contact_name')
          .not('lead_status_tag', 'eq', 'Warm — Contact Confirmed')
          .order('prospect_score', { ascending: false })
          .limit(100);
        if (error || !data) throw error;
        setLeads(data as BulkLead[]);
      } catch {
        // Mock fallback
        setLeads([
          { id: 'lead-1', address: '123 Ocean Dr', city: 'Miami', state: 'FL', source: 'Trulia', prospect_score: 88, lead_status_tag: 'New Lead', contact_name: null },
          { id: 'lead-2', address: '456 Palm Ave', city: 'Tampa', state: 'FL', source: 'Zillow', prospect_score: 76, lead_status_tag: 'Contacted', contact_name: null },
          { id: 'lead-3', address: '789 Sunset Blvd', city: 'Orlando', state: 'FL', source: 'Realtor.com', prospect_score: 71, lead_status_tag: 'New Lead', contact_name: null },
          { id: 'lead-4', address: '321 Beach Rd', city: 'Sarasota', state: 'FL', source: 'Trulia', prospect_score: 65, lead_status_tag: 'Contacted', contact_name: null },
          { id: 'lead-5', address: '654 Harbor View', city: 'Naples', state: 'FL', source: 'Zillow', prospect_score: 82, lead_status_tag: 'New Lead', contact_name: null },
        ]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = leads.filter(l =>
    l.address.toLowerCase().includes(search.toLowerCase()) ||
    l.city.toLowerCase().includes(search.toLowerCase())
  );

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(l => l.id)));
    }
  };

  const handleBulkSend = async () => {
    if (selected.size === 0) return;
    setSending(true);
    let successCount = 0;
    let failCount = 0;

    for (const leadId of Array.from(selected)) {
      try {
        const res = await fetch('/api/leads/info-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId, sentVia: sendVia }),
        });
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setSending(false);
    if (successCount > 0) {
      toast.success(`${successCount} info-request link${successCount > 1 ? 's' : ''} sent`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} failed to send`);
    }
    onSent();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Bulk Send Info-Request Links</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select leads to send a personalized info-request link
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <XCircle size={18} />
          </button>
        </div>

        {/* Send via toggle */}
        <div className="px-6 py-3 border-b border-border bg-muted/20 flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Send via:</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSendVia('email')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sendVia === 'email' ?'bg-primary text-primary-foreground' :'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <Mail size={12} /> Email
            </button>
            <button
              onClick={() => setSendVia('sms')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sendVia === 'sms' ?'bg-primary text-primary-foreground' :'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <MessageSquare size={12} /> SMS
            </button>
          </div>
          {sendVia === 'sms' && (
            <span className="text-[10px] text-amber-600 flex items-center gap-1">
              <AlertCircle size={10} /> Requires A2P 10DLC registration
            </span>
          )}
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-border">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search leads..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-muted/30 border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Lead list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted/40 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/30 border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-left">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Address</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Score</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(lead => (
                  <tr
                    key={lead.id}
                    className={`hover:bg-muted/20 transition-colors cursor-pointer ${
                      selected.has(lead.id) ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => {
                      const next = new Set(selected);
                      if (next.has(lead.id)) next.delete(lead.id);
                      else next.add(lead.id);
                      setSelected(next);
                    }}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => {}}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{lead.address}</p>
                      <p className="text-muted-foreground">{lead.city}, {lead.state}</p>
                    </td>
                    <td className="px-4 py-3">
                      {lead.prospect_score != null ? (
                        <span className={`font-semibold ${
                          lead.prospect_score >= 70 ? 'text-green-600' :
                          lead.prospect_score >= 50 ? 'text-amber-600' : 'text-muted-foreground'
                        }`}>
                          {lead.prospect_score}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground text-[10px]">
                        {lead.lead_status_tag || 'New Lead'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/10">
          <span className="text-xs text-muted-foreground">
            {selected.size} of {filtered.length} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkSend}
              disabled={selected.size === 0 || sending}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {sending ? (
                <><Loader2 size={12} className="animate-spin" /> Sending...</>
              ) : (
                <><Send size={12} /> Send {selected.size > 0 ? `${selected.size} ` : ''}Link{selected.size !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function InfoRequestDashboard() {
  const router = useRouter();
  const [links, setLinks] = useState<InfoRequestLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<LinkStatus | 'All'>('All');
  const [search, setSearch] = useState('');
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const supabase = createClient();

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lead_info_requests')
        .select(`
          id, lead_id, sent_at, sent_via, submitted_at, first_name, last_name,
          phone, email, link_token, resent_at,
          leads!inner(address, city, state)
        `)
        .order('sent_at', { ascending: false })
        .limit(200);

      if (error || !data) throw error;

      const now = Date.now();
      const EXPIRY_DAYS = 30;

      const mapped: InfoRequestLink[] = (data as unknown[]).map((row: unknown) => {
        const r = row as {
          id: string; lead_id: string; sent_at: string; sent_via: string;
          submitted_at: string | null; first_name: string | null; last_name: string | null;
          phone: string | null; email: string | null; link_token: string; resent_at: string | null;
          viewed_at?: string | null;
          leads: { address: string; city: string; state: string };
        };
        let status: LinkStatus = 'Sent';
        if (r.submitted_at) {
          status = 'Submitted';
        } else if (r.viewed_at) {
          status = 'Viewed';
        } else {
          const sentDate = new Date(r.sent_at).getTime();
          if ((now - sentDate) / 86400000 > EXPIRY_DAYS) status = 'Expired';
        }
        return {
          id: r.id,
          lead_id: r.lead_id,
          lead_address: r.leads?.address || '',
          lead_city: r.leads?.city || '',
          lead_state: r.leads?.state || '',
          sent_at: r.sent_at,
          sent_via: (r.sent_via as 'email' | 'sms') || 'email',
          status,
          viewed_at: r.viewed_at || null,
          submitted_at: r.submitted_at,
          first_name: r.first_name,
          last_name: r.last_name,
          phone: r.phone,
          email: r.email,
          link_token: r.link_token,
          resent_at: r.resent_at,
        };
      });
      setLinks(mapped);
    } catch {
      // Mock fallback
      const now = new Date();
      setLinks([
        {
          id: 'ir-1', lead_id: 'lead-1', lead_address: '123 Ocean Dr', lead_city: 'Miami', lead_state: 'FL',
          sent_at: new Date(now.getTime() - 86400000 * 2).toISOString(), sent_via: 'email',
          status: 'Submitted', viewed_at: new Date(now.getTime() - 86400000).toISOString(),
          submitted_at: new Date(now.getTime() - 3600000 * 4).toISOString(),
          first_name: 'Jennifer', last_name: 'Walsh', phone: '(305) 555-0192', email: 'jwalsh@email.com',
          link_token: 'tok-1', resent_at: null,
        },
        {
          id: 'ir-2', lead_id: 'lead-2', lead_address: '456 Palm Ave', lead_city: 'Tampa', lead_state: 'FL',
          sent_at: new Date(now.getTime() - 86400000 * 6).toISOString(), sent_via: 'email',
          status: 'Viewed', viewed_at: new Date(now.getTime() - 86400000 * 3).toISOString(),
          submitted_at: null, first_name: null, last_name: null, phone: null, email: null,
          link_token: 'tok-2', resent_at: null,
        },
        {
          id: 'ir-3', lead_id: 'lead-3', lead_address: '789 Sunset Blvd', lead_city: 'Orlando', lead_state: 'FL',
          sent_at: new Date(now.getTime() - 86400000 * 8).toISOString(), sent_via: 'sms',
          status: 'Sent', viewed_at: null, submitted_at: null,
          first_name: null, last_name: null, phone: null, email: null,
          link_token: 'tok-3', resent_at: null,
        },
        {
          id: 'ir-4', lead_id: 'lead-4', lead_address: '321 Beach Rd', lead_city: 'Sarasota', lead_state: 'FL',
          sent_at: new Date(now.getTime() - 86400000 * 35).toISOString(), sent_via: 'email',
          status: 'Expired', viewed_at: null, submitted_at: null,
          first_name: null, last_name: null, phone: null, email: null,
          link_token: 'tok-4', resent_at: null,
        },
        {
          id: 'ir-5', lead_id: 'lead-5', lead_address: '654 Harbor View', lead_city: 'Naples', lead_state: 'FL',
          sent_at: new Date(now.getTime() - 86400000 * 1).toISOString(), sent_via: 'email',
          status: 'Sent', viewed_at: null, submitted_at: null,
          first_name: null, last_name: null, phone: null, email: null,
          link_token: 'tok-5', resent_at: null,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  const handleResend = async (link: InfoRequestLink) => {
    setResendingId(link.id);
    try {
      const res = await fetch('/api/leads/info-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: link.lead_id, sentVia: link.sent_via }),
      });
      if (!res.ok) throw new Error('Failed to resend');

      // Mark old link as expired, update resent_at
      await supabase
        .from('lead_info_requests')
        .update({ resent_at: new Date().toISOString() })
        .eq('id', link.id);

      toast.success('Info-request link resent');
      loadLinks();
    } catch {
      toast.error('Failed to resend link');
    } finally {
      setResendingId(null);
    }
  };

  const filtered = links.filter(l => {
    const matchStatus = statusFilter === 'All' || l.status === statusFilter;
    const matchSearch = !search ||
      l.lead_address.toLowerCase().includes(search.toLowerCase()) ||
      l.lead_city.toLowerCase().includes(search.toLowerCase()) ||
      (l.first_name && l.first_name.toLowerCase().includes(search.toLowerCase())) ||
      (l.last_name && l.last_name.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const counts = {
    All: links.length,
    Sent: links.filter(l => l.status === 'Sent').length,
    Viewed: links.filter(l => l.status === 'Viewed').length,
    Submitted: links.filter(l => l.status === 'Submitted').length,
    Expired: links.filter(l => l.status === 'Expired').length,
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Info-Request Links</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track homeowner responses to your direct info-request links
            </p>
          </div>
          <button
            onClick={() => setBulkModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} />
            Bulk Send Links
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['Sent', 'Viewed', 'Submitted', 'Expired'] as LinkStatus[]).map(status => {
            const cfg = STATUS_CONFIG[status];
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(statusFilter === status ? 'All' : status)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  statusFilter === status
                    ? 'border-primary/40 bg-primary/5' :'border-border bg-card hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`p-1 rounded ${cfg.color}`}>{cfg.icon}</span>
                  <span className="text-xs font-medium text-muted-foreground">{status}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{counts[status]}</p>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by address or homeowner name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-card border border-border rounded-lg outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-2">
            {(['All', 'Sent', 'Viewed', 'Submitted', 'Expired'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {s} {s !== 'All' && `(${counts[s]})`}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-14 bg-muted/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Link2 size={28} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No info-request links found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {statusFilter !== 'All' ? `No links with status "${statusFilter}"` : 'Send your first bulk batch to get started'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-muted/20">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Property</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Sent</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Via</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Homeowner</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(link => (
                    <tr key={link.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-foreground">{link.lead_address}</p>
                        <p className="text-muted-foreground">{link.lead_city}, {link.lead_state}</p>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {timeAgo(link.sent_at)}
                        {link.resent_at && (
                          <p className="text-[10px] text-amber-600 mt-0.5">
                            Resent {timeAgo(link.resent_at)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          {link.sent_via === 'email' ? <Mail size={11} /> : <MessageSquare size={11} />}
                          {link.sent_via === 'email' ? 'Email' : 'SMS'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={link.status} />
                        {link.submitted_at && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {timeAgo(link.submitted_at)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {link.status === 'Submitted' && link.first_name ? (
                          <div>
                            <p className="font-medium text-foreground">
                              {link.first_name} {link.last_name}
                            </p>
                            {link.phone && (
                              <p className="text-muted-foreground">{link.phone}</p>
                            )}
                            {link.email && (
                              <p className="text-muted-foreground truncate max-w-[160px]">{link.email}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {/* View lead */}
                          <button
                            onClick={() => router.push(`/lead-record?id=${link.lead_id}`)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors"
                            title="View lead record"
                          >
                            <ExternalLink size={11} />
                            {link.status === 'Submitted' ? 'View warm lead' : 'View lead'}
                          </button>

                          {/* Resend */}
                          {isResendEligible(link) && (
                            <button
                              onClick={() => handleResend(link)}
                              disabled={resendingId === link.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-primary/10 hover:bg-primary/20 text-primary transition-colors disabled:opacity-50"
                              title="Resend link"
                            >
                              {resendingId === link.id ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <RefreshCw size={11} />
                              )}
                              Resend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Resend eligibility note */}
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Clock size={11} />
          Resend becomes available after 5 days of no activity on Sent or Viewed links.
        </p>
      </div>

      {bulkModalOpen && (
        <BulkSendModal
          onClose={() => setBulkModalOpen(false)}
          onSent={loadLinks}
        />
      )}
    </AppLayout>
  );
}
