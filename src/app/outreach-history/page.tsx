'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, MessageSquare, CheckCircle, XCircle, AlertCircle, Clock, RefreshCw, ChevronDown, ChevronUp, Reply, Calendar, Search, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface OutreachRecord {
  id: string;
  lead_id: string;
  lead_address?: string;
  lead_city?: string;
  channel: 'email' | 'sms';
  subject?: string;
  body_preview: string;
  status: 'sent' | 'delivered' | 'bounced' | 'failed' | 'opened' | 'replied';
  failure_reason?: string;
  bounce_type?: 'hard' | 'soft';
  reply_detected: boolean;
  reply_snippet?: string;
  sent_at: string;
  delivered_at?: string;
  opened_at?: string;
  replied_at?: string;
  last_contact_date?: string;
  next_followup_due?: string;
  is_followup_overdue: boolean;
  recipient_email?: string;
  recipient_phone?: string;
}

interface LeadOutreachSummary {
  lead_id: string;
  lead_address: string;
  lead_city: string;
  total_sent: number;
  last_contact_date: string | null;
  next_followup_due: string | null;
  is_followup_overdue: boolean;
  has_reply: boolean;
  records: OutreachRecord[];
}

const STATUS_CONFIG: Record<OutreachRecord['status'], { label: string; color: string; icon: React.ReactNode }> = {
  sent: { label: 'Sent', color: 'text-blue-600 bg-blue-500/10 border-blue-500/20', icon: <Mail size={11} /> },
  delivered: { label: 'Delivered', color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20', icon: <CheckCircle size={11} /> },
  opened: { label: 'Opened', color: 'text-violet-600 bg-violet-500/10 border-violet-500/20', icon: <Mail size={11} /> },
  replied: { label: 'Replied', color: 'text-green-600 bg-green-500/10 border-green-500/20', icon: <Reply size={11} /> },
  bounced: { label: 'Bounced', color: 'text-amber-600 bg-amber-500/10 border-amber-500/20', icon: <AlertCircle size={11} /> },
  failed: { label: 'Failed', color: 'text-red-600 bg-red-500/10 border-red-500/20', icon: <XCircle size={11} /> },
};

function StatusBadge({ status }: { status: OutreachRecord['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Mock data for demo when no DB records exist
function getMockOutreachData(): LeadOutreachSummary[] {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const threeDaysAgo = new Date(today); threeDaysAgo.setDate(today.getDate() - 3);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const twoDaysFromNow = new Date(today); twoDaysFromNow.setDate(today.getDate() + 2);
  const overdue = new Date(today); overdue.setDate(today.getDate() - 2);

  return [
    {
      lead_id: 'lead-001',
      lead_address: '2847 Larimer St',
      lead_city: 'Denver, CO',
      total_sent: 3,
      last_contact_date: yesterday.toISOString(),
      next_followup_due: twoDaysFromNow.toISOString(),
      is_followup_overdue: false,
      has_reply: true,
      records: [
        {
          id: 'out-001',
          lead_id: 'lead-001',
          channel: 'email',
          subject: 'Interested in Your Property at 2847 Larimer St',
          body_preview: 'Hi there, I came across 2847 Larimer St and wanted to reach out directly — I\'m with TRAVLR Vacation Homes...',
          status: 'replied',
          reply_detected: true,
          reply_snippet: 'Thanks for reaching out! I\'d be open to a quick call this week.',
          sent_at: weekAgo.toISOString(),
          delivered_at: weekAgo.toISOString(),
          opened_at: new Date(weekAgo.getTime() + 3600000).toISOString(),
          replied_at: new Date(weekAgo.getTime() + 86400000).toISOString(),
          last_contact_date: weekAgo.toISOString(),
          next_followup_due: twoDaysFromNow.toISOString(),
          is_followup_overdue: false,
          recipient_email: 'owner@example.com',
        },
        {
          id: 'out-002',
          lead_id: 'lead-001',
          channel: 'sms',
          body_preview: 'Hi! Following up on my email about 2847 Larimer St. Would love to connect.',
          status: 'delivered',
          reply_detected: false,
          sent_at: threeDaysAgo.toISOString(),
          delivered_at: threeDaysAgo.toISOString(),
          last_contact_date: threeDaysAgo.toISOString(),
          is_followup_overdue: false,
          recipient_phone: '+1 (303) 555-0142',
        },
        {
          id: 'out-003',
          lead_id: 'lead-001',
          channel: 'email',
          subject: 'Following Up — 2847 Larimer St',
          body_preview: 'Just following up on my previous message about 2847 Larimer St. I am still very interested...',
          status: 'opened',
          reply_detected: false,
          sent_at: yesterday.toISOString(),
          delivered_at: yesterday.toISOString(),
          opened_at: yesterday.toISOString(),
          last_contact_date: yesterday.toISOString(),
          is_followup_overdue: false,
          recipient_email: 'owner@example.com',
        },
      ],
    },
    {
      lead_id: 'lead-002',
      lead_address: '1420 Ogden St',
      lead_city: 'Denver, CO',
      total_sent: 2,
      last_contact_date: weekAgo.toISOString(),
      next_followup_due: overdue.toISOString(),
      is_followup_overdue: true,
      has_reply: false,
      records: [
        {
          id: 'out-004',
          lead_id: 'lead-002',
          channel: 'email',
          subject: 'Interested in Your Property at 1420 Ogden St',
          body_preview: 'Hi there, I came across 1420 Ogden St and wanted to reach out directly...',
          status: 'bounced',
          bounce_type: 'hard',
          failure_reason: 'Recipient address rejected: 550 5.1.1 The email account does not exist.',
          reply_detected: false,
          sent_at: weekAgo.toISOString(),
          is_followup_overdue: true,
          recipient_email: 'invalid@example.com',
        },
        {
          id: 'out-005',
          lead_id: 'lead-002',
          channel: 'sms',
          body_preview: 'Hi! I\'m with TRAVLR Vacation Homes and interested in your property at 1420 Ogden St.',
          status: 'delivered',
          reply_detected: false,
          sent_at: threeDaysAgo.toISOString(),
          delivered_at: threeDaysAgo.toISOString(),
          last_contact_date: threeDaysAgo.toISOString(),
          next_followup_due: overdue.toISOString(),
          is_followup_overdue: true,
          recipient_phone: '+1 (303) 555-0198',
        },
      ],
    },
    {
      lead_id: 'lead-003',
      lead_address: '8901 Sunset Blvd',
      lead_city: 'Los Angeles, CA',
      total_sent: 1,
      last_contact_date: threeDaysAgo.toISOString(),
      next_followup_due: twoDaysFromNow.toISOString(),
      is_followup_overdue: false,
      has_reply: false,
      records: [
        {
          id: 'out-006',
          lead_id: 'lead-003',
          channel: 'email',
          subject: 'Interested in Your Property at 8901 Sunset Blvd',
          body_preview: 'Hi there, I came across 8901 Sunset Blvd and wanted to reach out — I\'m with TRAVLR Vacation Homes...',
          status: 'failed',
          failure_reason: 'Connection timeout — SMTP server unreachable after 3 retries.',
          reply_detected: false,
          sent_at: threeDaysAgo.toISOString(),
          is_followup_overdue: false,
          recipient_email: 'homeowner@example.com',
        },
      ],
    },
  ];
}

export default function OutreachHistoryPage() {
  const [summaries, setSummaries] = useState<LeadOutreachSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLeads, setExpandedLeads] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const supabase = createClient();

  const loadOutreachHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('outreach_history')
        .select('*, leads(address, city, state)')
        .order('sent_at', { ascending: false });

      if (error || !data || data.length === 0) {
        // Fall back to mock data for demo
        setSummaries(getMockOutreachData());
        return;
      }

      // Group by lead_id
      const grouped: Record<string, LeadOutreachSummary> = {};
      for (const row of data) {
        const leadId = row.lead_id;
        const address = row.leads?.address || 'Unknown Address';
        const city = row.leads ? `${row.leads.city}, ${row.leads.state}` : '';

        if (!grouped[leadId]) {
          grouped[leadId] = {
            lead_id: leadId,
            lead_address: address,
            lead_city: city,
            total_sent: 0,
            last_contact_date: null,
            next_followup_due: row.next_followup_due || null,
            is_followup_overdue: false,
            has_reply: false,
            records: [],
          };
        }

        const record: OutreachRecord = {
          id: row.id,
          lead_id: leadId,
          channel: row.channel,
          subject: row.subject,
          body_preview: row.body_preview || '',
          status: row.status,
          failure_reason: row.failure_reason,
          bounce_type: row.bounce_type,
          reply_detected: row.reply_detected || false,
          reply_snippet: row.reply_snippet,
          sent_at: row.sent_at,
          delivered_at: row.delivered_at,
          opened_at: row.opened_at,
          replied_at: row.replied_at,
          last_contact_date: row.sent_at,
          next_followup_due: row.next_followup_due,
          is_followup_overdue: row.next_followup_due ? new Date(row.next_followup_due) < new Date() : false,
          recipient_email: row.recipient_email,
          recipient_phone: row.recipient_phone,
        };

        grouped[leadId].records.push(record);
        grouped[leadId].total_sent++;

        if (row.reply_detected) grouped[leadId].has_reply = true;

        // Track last contact
        if (!grouped[leadId].last_contact_date || row.sent_at > grouped[leadId].last_contact_date!) {
          grouped[leadId].last_contact_date = row.sent_at;
        }

        // Track overdue
        if (record.is_followup_overdue) grouped[leadId].is_followup_overdue = true;
      }

      setSummaries(Object.values(grouped));
    } catch {
      setSummaries(getMockOutreachData());
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadOutreachHistory();
  }, [loadOutreachHistory]);

  const toggleExpand = (leadId: string) => {
    setExpandedLeads((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const filteredSummaries = summaries.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      if (!s.lead_address.toLowerCase().includes(q) && !s.lead_city.toLowerCase().includes(q)) return false;
    }
    if (overdueOnly && !s.is_followup_overdue) return false;
    if (channelFilter !== 'all') {
      if (!s.records.some((r) => r.channel === channelFilter)) return false;
    }
    if (statusFilter !== 'all') {
      if (!s.records.some((r) => r.status === statusFilter)) return false;
    }
    return true;
  });

  const stats = {
    total: summaries.reduce((a, s) => a + s.total_sent, 0),
    delivered: summaries.reduce((a, s) => a + s.records.filter((r) => ['delivered', 'opened', 'replied'].includes(r.status)).length, 0),
    replied: summaries.reduce((a, s) => a + s.records.filter((r) => r.reply_detected).length, 0),
    bounced: summaries.reduce((a, s) => a + s.records.filter((r) => r.status === 'bounced' || r.status === 'failed').length, 0),
    overdue: summaries.filter((s) => s.is_followup_overdue).length,
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/lead-management" className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Outreach History</h1>
            <p className="text-sm text-muted-foreground mt-0.5">All sent emails & SMS per lead — delivery status, replies, and follow-up tracking</p>
          </div>
          <button
            onClick={loadOutreachHistory}
            className="ml-auto p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total Sent', value: stats.total, color: 'text-foreground' },
            { label: 'Delivered', value: stats.delivered, color: 'text-emerald-600' },
            { label: 'Replies', value: stats.replied, color: 'text-violet-600' },
            { label: 'Bounced / Failed', value: stats.bounced, color: 'text-amber-600' },
            { label: 'Follow-up Overdue', value: stats.overdue, color: 'text-red-600' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-card border border-border rounded-xl px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
              <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by address or city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Channels</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="opened">Opened</option>
            <option value="replied">Replied</option>
            <option value="bounced">Bounced</option>
            <option value="failed">Failed</option>
          </select>
          <button
            onClick={() => setOverdueOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${overdueOnly ? 'bg-red-500/10 border-red-500/30 text-red-600' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}
          >
            <Clock size={13} />
            Overdue Only
          </button>
        </div>

        {/* Lead list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading outreach history…</p>
            </div>
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-border">
            <Mail size={32} className="text-muted-foreground mb-3" />
            <p className="text-base font-semibold text-foreground">No outreach records found</p>
            <p className="text-sm text-muted-foreground mt-1">Send emails or SMS from Lead Management to see history here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSummaries.map((summary) => {
              const isExpanded = expandedLeads.has(summary.lead_id);
              return (
                <div key={summary.lead_id} className="bg-card border border-border rounded-xl overflow-hidden">
                  {/* Lead header row */}
                  <button
                    onClick={() => toggleExpand(summary.lead_id)}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{summary.lead_address}</span>
                        <span className="text-xs text-muted-foreground">{summary.lead_city}</span>
                        {summary.is_followup_overdue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 border border-red-500/20 text-red-600">
                            <Clock size={10} />Follow-up Overdue
                          </span>
                        )}
                        {summary.has_reply && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-500/10 border border-green-500/20 text-green-600">
                            <Reply size={10} />Reply Received
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Mail size={10} />{summary.total_sent} message{summary.total_sent !== 1 ? 's' : ''} sent
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Calendar size={10} />Last contact: {formatDate(summary.last_contact_date)}
                        </span>
                        {summary.next_followup_due && (
                          <span className={`text-[11px] flex items-center gap-1 ${summary.is_followup_overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                            <Clock size={10} />Next follow-up: {formatDate(summary.next_followup_due)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>

                  {/* Expanded records */}
                  {isExpanded && (
                    <div className="border-t border-border divide-y divide-border">
                      {summary.records.map((record) => (
                        <div key={record.id} className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            {/* Channel icon */}
                            <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${record.channel === 'email' ? 'bg-blue-500/10 text-blue-600' : 'bg-purple-500/10 text-purple-600'}`}>
                              {record.channel === 'email' ? <Mail size={14} /> : <MessageSquare size={14} />}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                                  {record.channel === 'email' ? 'Email' : 'SMS'}
                                </span>
                                <StatusBadge status={record.status} />
                                {record.bounce_type && (
                                  <span className="text-[11px] text-amber-600 font-medium">
                                    ({record.bounce_type === 'hard' ? 'Hard bounce' : 'Soft bounce'})
                                  </span>
                                )}
                              </div>

                              {record.subject && (
                                <p className="text-sm font-medium text-foreground mb-1">{record.subject}</p>
                              )}
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{record.body_preview}</p>

                              {/* Failure / bounce reason */}
                              {record.failure_reason && (
                                <div className="flex items-start gap-1.5 mb-2 p-2 bg-red-500/5 border border-red-500/15 rounded-lg">
                                  <XCircle size={12} className="text-red-500 mt-0.5 shrink-0" />
                                  <p className="text-[11px] text-red-700">{record.failure_reason}</p>
                                </div>
                              )}

                              {/* Reply snippet */}
                              {record.reply_detected && record.reply_snippet && (
                                <div className="flex items-start gap-1.5 mb-2 p-2 bg-green-500/5 border border-green-500/15 rounded-lg">
                                  <Reply size={12} className="text-green-600 mt-0.5 shrink-0" />
                                  <div>
                                    <p className="text-[10px] text-green-700 font-semibold uppercase tracking-wide mb-0.5">Reply detected</p>
                                    <p className="text-[11px] text-green-800 italic">"{record.reply_snippet}"</p>
                                    {record.replied_at && (
                                      <p className="text-[10px] text-green-600 mt-0.5">{formatDateTime(record.replied_at)}</p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Timestamps */}
                              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Mail size={9} />Sent: {formatDateTime(record.sent_at)}
                                </span>
                                {record.delivered_at && (
                                  <span className="flex items-center gap-1">
                                    <CheckCircle size={9} />Delivered: {formatDateTime(record.delivered_at)}
                                  </span>
                                )}
                                {record.opened_at && (
                                  <span className="flex items-center gap-1 text-violet-600">
                                    <Mail size={9} />Opened: {formatDateTime(record.opened_at)}
                                  </span>
                                )}
                                {record.recipient_email && (
                                  <span className="text-muted-foreground/70">→ {record.recipient_email}</span>
                                )}
                                {record.recipient_phone && (
                                  <span className="text-muted-foreground/70">→ {record.recipient_phone}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
