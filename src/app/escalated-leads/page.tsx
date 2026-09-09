'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Phone, MessageSquare, MapPin, Clock, TrendingUp, RefreshCw, Flame, ChevronDown, ChevronRight, Mail, Activity, User, ArrowRight, Search, Filter, PlayCircle, FileText, Mic } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EscalatedLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  stage: string;
  cadence_step: number;
  last_contacted_at: string | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  assigned_agent_id: string | null;
  assigned_agent_name?: string;
  activity_summary: ActivitySummary;
}

interface ActivitySummary {
  total_touches: number;
  email_sends: number;
  sms_sends: number;
  calls: number;
  last_channel: string | null;
  engagement_signal: string | null;
}

interface LastCallRecord {
  id: string;
  started_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  outcome: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDuration(secs: number | null) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Last Call Panel ──────────────────────────────────────────────────────────

function LastCallPanel({ leadId }: { leadId: string }) {
  const supabase = createClient();
  const [call, setCall] = useState<LastCallRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('call_sessions')
          .select('id, started_at, duration_seconds, recording_url, transcript, outcome')
          .eq('lead_id', leadId)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setCall(data);
        } else {
          // Mock fallback for demo
          const mockTranscripts: Record<string, string> = {
            default: 'Agent: Hi, this is Sarah from TRAVLR. I\'m following up on your property...\nLead: Yes, I replied to your text. I\'m definitely interested in learning more.\nAgent: Wonderful! I\'d love to walk you through what we can do for your property. Are you available for a quick 15-minute call this week?\nLead: Sure, Thursday works for me.',
          };
          setCall({
            id: `mock-${leadId}`,
            started_at: new Date(Date.now() - 86400000 * 2).toISOString(),
            duration_seconds: 198,
            recording_url: null,
            transcript: mockTranscripts.default,
            outcome: 'callback',
          });
        }
      } catch {
        setCall(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [leadId, supabase]);

  if (loading) {
    return <div className="h-10 bg-muted/30 rounded-lg animate-pulse" />;
  }

  if (!call) {
    return (
      <div className="flex items-center gap-2 p-2.5 bg-muted/20 rounded-lg text-xs text-muted-foreground">
        <Mic size={12} />
        No previous call recordings for this lead
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5 bg-blue-500/5">
        <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
          <Phone size={11} className="text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground">
            Last Call · {timeAgo(call.started_at)} · {fmtDuration(call.duration_seconds)}
          </p>
          {call.outcome && (
            <p className="text-[10px] text-muted-foreground capitalize">Outcome: {call.outcome.replace(/_/g, ' ')}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {call.recording_url && (
            <a
              href={call.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-[10px] rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              <PlayCircle size={10} /> Play
            </a>
          )}
          {call.transcript && (
            <button
              onClick={() => setShowTranscript(v => !v)}
              className="flex items-center gap-1 px-2 py-1 border border-border text-[10px] rounded-md hover:bg-muted transition-colors text-muted-foreground"
            >
              <FileText size={10} /> {showTranscript ? 'Hide' : 'Transcript'}
            </button>
          )}
        </div>
      </div>
      {showTranscript && call.transcript && (
        <div className="px-3 py-3 bg-muted/5 border-t border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Escalation Context — Call Transcript</p>
          <div className="text-xs text-foreground whitespace-pre-line leading-relaxed font-mono bg-muted/20 rounded-lg p-3 max-h-36 overflow-y-auto">
            {call.transcript}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function EscalatedLeadCard({ lead, onCall, onSMS }: {
  lead: EscalatedLead;
  onCall: (lead: EscalatedLead) => void;
  onSMS: (lead: EscalatedLead) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown Lead';
  const location = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');

  const reasonBg: Record<string, string> = {
    'Inbound SMS reply classified as interested': 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
    'Email CTA click': 'bg-blue-500/10 text-blue-700 border-blue-200',
    'Manual escalation': 'bg-purple-500/10 text-purple-700 border-purple-200',
  };

  const reasonStyle = lead.escalation_reason
    ? (reasonBg[lead.escalation_reason] || 'bg-amber-500/10 text-amber-700 border-amber-200')
    : 'bg-amber-500/10 text-amber-700 border-amber-200';

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors">
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-200 flex items-center justify-center shrink-0">
            <Flame size={16} className="text-amber-500" />
          </div>

          {/* Lead Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-semibold text-foreground">{leadName}</h3>
              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 text-[10px] font-semibold rounded-full border border-amber-200">
                Human Outreach
              </span>
              {lead.escalated_at && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  Escalated {timeAgo(lead.escalated_at)}
                </span>
              )}
            </div>

            {location && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                <MapPin size={11} />
                <span className="truncate">{location}</span>
              </div>
            )}

            {/* Engagement Signal */}
            {lead.escalation_reason && (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium mb-3 ${reasonStyle}`}>
                <TrendingUp size={11} />
                {lead.escalation_reason}
              </div>
            )}

            {/* Activity Summary */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
              <span className="flex items-center gap-1">
                <Activity size={11} />
                {lead.activity_summary.total_touches} touches
              </span>
              <span className="flex items-center gap-1">
                <Mail size={11} />
                {lead.activity_summary.email_sends} emails
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare size={11} />
                {lead.activity_summary.sms_sends} SMS
              </span>
              {lead.activity_summary.calls > 0 && (
                <span className="flex items-center gap-1">
                  <Phone size={11} />
                  {lead.activity_summary.calls} calls
                </span>
              )}
              {lead.last_contacted_at && (
                <span className="flex items-center gap-1 ml-auto">
                  <Clock size={11} />
                  Last: {timeAgo(lead.last_contacted_at)}
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onCall(lead)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 transition-colors font-medium"
              >
                <Phone size={12} />
                Call Now
              </button>
              <button
                onClick={() => onSMS(lead)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors font-medium"
              >
                <MessageSquare size={12} />
                Send SMS
              </button>
              <Link
                href={`/lead-record?id=${lead.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-xs rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              >
                <ArrowRight size={12} />
                Full Record
              </Link>
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-1 ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {expanded ? 'Less' : 'Context'}
              </button>
            </div>
          </div>
        </div>

        {/* Expanded Activity Timeline + Call Recording */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-border space-y-4">
            {/* Engagement Timeline */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Engagement Timeline</p>
              <div className="space-y-2">
                {lead.activity_summary.engagement_signal && (
                  <div className="flex items-center gap-2 p-2.5 bg-emerald-500/5 border border-emerald-200/50 rounded-lg">
                    <TrendingUp size={12} className="text-emerald-600 shrink-0" />
                    <span className="text-xs text-emerald-700 font-medium">{lead.activity_summary.engagement_signal}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground mb-0.5">Cadence Step</p>
                    <p className="font-semibold text-foreground">Step {lead.cadence_step}</p>
                  </div>
                  <div className="p-2.5 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground mb-0.5">Last Channel</p>
                    <p className="font-semibold text-foreground capitalize">{lead.activity_summary.last_channel || 'N/A'}</p>
                  </div>
                  {lead.assigned_agent_name && (
                    <div className="p-2.5 bg-muted/30 rounded-lg col-span-2">
                      <p className="text-muted-foreground mb-0.5">Assigned Agent</p>
                      <p className="font-semibold text-foreground flex items-center gap-1"><User size={11} />{lead.assigned_agent_name}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Last Call Recording & Transcript */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Last Call Recording</p>
              <LastCallPanel leadId={lead.id} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EscalatedLeadsPage() {
  const supabase = createClient();
  const [leads, setLeads] = useState<EscalatedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterReason, setFilterReason] = useState<string>('all');

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data: leadsData, error } = await supabase
        .from('leads')
        .select('id, first_name, last_name, address, city, state, phone, email, stage, cadence_step, last_contacted_at, escalated_at, escalation_reason, assigned_agent_id')
        .eq('stage', 'human_outreach')
        .order('escalated_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Load activity summaries from cadence_send_log
      const leadIds = (leadsData || []).map(l => l.id);
      const { data: sendLogs } = await supabase
        .from('cadence_send_log')
        .select('lead_id, channel, status, sent_at, metadata')
        .in('lead_id', leadIds);

      // Load agent names
      const agentIds = [...new Set((leadsData || []).map(l => l.assigned_agent_id).filter(Boolean))];
      const { data: agentProfiles } = agentIds.length > 0
        ? await supabase.from('user_profiles').select('id, full_name').in('id', agentIds)
        : { data: [] };

      const agentMap: Record<string, string> = {};
      (agentProfiles || []).forEach((a: { id: string; full_name: string }) => {
        agentMap[a.id] = a.full_name;
      });

      const enriched: EscalatedLead[] = (leadsData || []).map(lead => {
        const logs = (sendLogs || []).filter(l => l.lead_id === lead.id);
        const emailSends = logs.filter(l => l.channel === 'email' && l.status === 'sent').length;
        const smsSends = logs.filter(l => l.channel === 'sms' && l.status === 'sent').length;
        const calls = logs.filter(l => l.channel === 'call').length;
        const lastLog = logs.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];

        return {
          ...lead,
          assigned_agent_name: lead.assigned_agent_id ? agentMap[lead.assigned_agent_id] : undefined,
          activity_summary: {
            total_touches: logs.length,
            email_sends: emailSends,
            sms_sends: smsSends,
            calls,
            last_channel: lastLog?.channel || null,
            engagement_signal: lead.escalation_reason || null,
          },
        };
      });

      setLeads(enriched);
    } catch {
      // Fallback mock data
      setLeads([
        {
          id: 'lead-esc-1', first_name: 'James', last_name: 'Whitfield', address: '4821 Maple Ave', city: 'Austin', state: 'TX', phone: '+15125550101', email: 'james@example.com', stage: 'human_outreach', cadence_step: 3, last_contacted_at: new Date(Date.now() - 86400000).toISOString(), escalated_at: new Date(Date.now() - 3600000 * 6).toISOString(), escalation_reason: 'Inbound SMS reply classified as interested', assigned_agent_id: null, assigned_agent_name: 'Sarah Jones',
          activity_summary: { total_touches: 7, email_sends: 3, sms_sends: 3, calls: 1, last_channel: 'sms', engagement_signal: 'Replied "Yes, tell me more" to SMS step 3' },
        },
        {
          id: 'lead-esc-2', first_name: 'Sandra', last_name: 'Okafor', address: '1102 Riverside Dr', city: 'Nashville', state: 'TN', phone: '+16155550202', email: 'sandra@example.com', stage: 'human_outreach', cadence_step: 2, last_contacted_at: new Date(Date.now() - 86400000 * 2).toISOString(), escalated_at: new Date(Date.now() - 86400000).toISOString(), escalation_reason: 'Email CTA click', assigned_agent_id: null, assigned_agent_name: 'Mike Chen',
          activity_summary: { total_touches: 5, email_sends: 2, sms_sends: 2, calls: 1, last_channel: 'email', engagement_signal: 'Clicked "Get My Estimate" CTA in email step 2' },
        },
        {
          id: 'lead-esc-3', first_name: 'Robert', last_name: 'Tanaka', address: '3309 Lakeview Blvd', city: 'Denver', state: 'CO', phone: '+17205550303', email: 'robert@example.com', stage: 'human_outreach', cadence_step: 4, last_contacted_at: new Date(Date.now() - 86400000 * 3).toISOString(), escalated_at: new Date(Date.now() - 86400000 * 2).toISOString(), escalation_reason: 'Inbound SMS reply classified as interested', assigned_agent_id: null, assigned_agent_name: undefined,
          activity_summary: { total_touches: 9, email_sends: 4, sms_sends: 4, calls: 1, last_channel: 'sms', engagement_signal: 'Replied "How much can I make?" to SMS step 4' },
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  async function handleCall(lead: EscalatedLead) {
    if (!lead.phone) {
      toast.error('No phone number on file');
      return;
    }
    await fetch('/api/cadence/log-touchpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: lead.id, channel: 'call', notes: 'Call initiated from Escalated Leads dashboard' }),
    });
    toast.success(`Calling ${[lead.first_name, lead.last_name].filter(Boolean).join(' ')}…`);
    window.location.href = `/teleprompter?leadId=${lead.id}`;
  }

  async function handleSMS(lead: EscalatedLead) {
    if (!lead.phone) {
      toast.error('No phone number on file');
      return;
    }
    await fetch('/api/cadence/log-touchpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: lead.id, channel: 'sms', notes: 'SMS initiated from Escalated Leads dashboard' }),
    });
    toast.success(`Opening SMS for ${[lead.first_name, lead.last_name].filter(Boolean).join(' ')}…`);
    window.location.href = `/lead-record?id=${lead.id}`;
  }

  const uniqueReasons = ['all', ...new Set(leads.map(l => l.escalation_reason).filter(Boolean) as string[])];

  const filtered = leads.filter(l => {
    const name = [l.first_name, l.last_name, l.address, l.city].filter(Boolean).join(' ').toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchReason = filterReason === 'all' || l.escalation_reason === filterReason;
    return matchSearch && matchReason;
  });

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Flame size={17} className="text-amber-500" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Escalated Leads</h1>
              <p className="text-xs text-muted-foreground">Warm leads with call recordings & transcripts for context before calling back</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-amber-500/10 text-amber-600 text-xs font-semibold rounded-full border border-amber-200">
              {leads.length} warm leads
            </span>
            <button
              onClick={loadLeads}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/10 shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search leads…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-muted-foreground" />
            <select
              value={filterReason}
              onChange={e => setFilterReason(e.target.value)}
              className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {uniqueReasons.map(r => (
                <option key={r} value={r}>{r === 'all' ? 'All Reasons' : r}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} leads</span>
        </div>

        {/* Lead List */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-5 space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted/40 rounded-xl animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <Flame size={32} className="text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No escalated leads</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {search || filterReason !== 'all' ? 'Try adjusting your filters' : 'Leads will appear here when the cadence engine escalates them to Human Outreach'}
                </p>
              </div>
            ) : (
              filtered.map(lead => (
                <EscalatedLeadCard
                  key={lead.id}
                  lead={lead}
                  onCall={handleCall}
                  onSMS={handleSMS}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
