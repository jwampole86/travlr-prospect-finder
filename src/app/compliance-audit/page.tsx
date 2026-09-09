'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Shield, Download, RefreshCw, Search, Filter, CheckCircle, XCircle, AlertCircle, Phone, Mail, MessageSquare, Clock, ChevronDown, ChevronUp, AlertTriangle, Mic, Ban, Info, ExternalLink } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'sms' | 'email' | 'call';
type ConsentStatus = 'opted_in' | 'opted_out' | 'unknown';
type DNCStatus = 'clean' | 'flagged' | 'unknown';
type TCPARisk = 'low' | 'medium' | 'high' | 'critical';

interface AuditEntry {
  id: string;
  channel: Channel;
  recipient_name: string;
  recipient_phone: string | null;
  recipient_email: string | null;
  sent_at: string;
  opt_in_status: ConsentStatus;
  opt_in_timestamp: string | null;
  carrier_code: string | null;
  delivery_status: string;
  unsubscribe_event: boolean;
  unsubscribe_at: string | null;
  message_preview: string | null;
  lead_id: string | null;
  agent_name: string | null;
  template_name: string | null;
  // New compliance fields
  dnc_status: DNCStatus;
  dnc_checked_at: string | null;
  tcpa_risk: TCPARisk;
  tcpa_risk_reasons: string[];
  recording_consent_disclosed: boolean;
  recording_disclosure_timestamp: string | null;
  recording_url: string | null;
  call_duration_seconds: number | null;
  state: string | null;
  state_recording_law: 'one_party' | 'all_party' | 'unknown';
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

function generateMockEntries(): AuditEntry[] {
  const channels: Channel[] = ['sms', 'email', 'call', 'sms', 'email', 'sms', 'email', 'call', 'sms', 'email'];
  const names = ['James Whitfield', 'Sandra Okafor', 'Robert Tanaka', 'Maria Chen', 'David Park', 'Lisa Monroe', 'Kevin Walsh', 'Priya Sharma', 'Tom Bradley', 'Anna Fischer'];
  const agents = ['Sarah Mitchell', 'James Torres', 'Priya Nair', 'Marcus Webb'];
  const templates = ['Initial Outreach', 'Follow-Up #1', 'Revenue Estimate Offer', 'Check-In', 'Proposal Email'];
  const carriers = ['AT&T', 'Verizon', 'T-Mobile', 'Sprint', null];
  const statuses = ['delivered', 'delivered', 'delivered', 'bounced', 'failed', 'delivered', 'delivered', 'opened'];
  const optInStatuses: ConsentStatus[] = ['opted_in', 'opted_in', 'opted_in', 'opted_out', 'opted_in', 'unknown', 'opted_in', 'opted_in'];
  const dncStatuses: DNCStatus[] = ['clean', 'clean', 'flagged', 'clean', 'unknown', 'clean', 'flagged', 'clean'];
  const tcpaRisks: TCPARisk[] = ['low', 'low', 'high', 'medium', 'critical', 'low', 'medium', 'high'];
  const states = ['CA', 'FL', 'TX', 'NY', 'WA', 'IL', 'PA', 'OH', 'GA', 'NC'];
  const allPartyStates = ['CA', 'WA', 'PA', 'IL'];

  const tcpaRiskReasonMap: Record<TCPARisk, string[]> = {
    low: [],
    medium: ['No explicit opt-in timestamp recorded'],
    high: ['DNC registry match', 'No prior written consent documented'],
    critical: ['DNC flagged', 'No consent', 'Called outside 8am–9pm window', 'All-party consent state — disclosure not confirmed'],
  };

  return Array.from({ length: 40 }, (_, i) => {
    const ch = channels[i % channels.length];
    const name = names[i % names.length];
    const optIn = optInStatuses[i % optInStatuses.length];
    const unsub = optIn === 'opted_out' && i % 5 === 0;
    const daysAgo = Math.floor(i / 2);
    const sentAt = new Date(Date.now() - daysAgo * 86400000 - (i % 24) * 3600000).toISOString();
    const state = states[i % states.length];
    const isAllParty = allPartyStates.includes(state);
    const dncStatus = dncStatuses[i % dncStatuses.length];
    const tcpaRisk = tcpaRisks[i % tcpaRisks.length];
    const recordingDisclosed = ch === 'call' ? (i % 3 !== 0) : false;

    return {
      id: `audit-${i + 1}`,
      channel: ch,
      recipient_name: name,
      recipient_phone: ch === 'sms' || ch === 'call' ? `+1512555${String(1000 + i).slice(1)}` : null,
      recipient_email: ch === 'email' ? `${name.toLowerCase().replace(' ', '.')}@example.com` : null,
      sent_at: sentAt,
      opt_in_status: optIn,
      opt_in_timestamp: optIn === 'opted_in' ? new Date(Date.now() - (daysAgo + 30) * 86400000).toISOString() : null,
      carrier_code: ch === 'sms' ? (carriers[i % carriers.length] ?? null) : null,
      delivery_status: statuses[i % statuses.length],
      unsubscribe_event: unsub,
      unsubscribe_at: unsub ? new Date(Date.now() - (daysAgo - 1) * 86400000).toISOString() : null,
      message_preview: ch === 'email' ? `Hi ${name.split(' ')[0]}, we wanted to follow up on your property listing...` :
        ch === 'sms' ? `Hi ${name.split(' ')[0]}, this is TRAVLR. Reply STOP to opt out.` : null,
      lead_id: `lead-${i + 1}`,
      agent_name: agents[i % agents.length],
      template_name: ch !== 'call' ? templates[i % templates.length] : null,
      dnc_status: dncStatus,
      dnc_checked_at: new Date(Date.now() - (daysAgo + 1) * 86400000).toISOString(),
      tcpa_risk: tcpaRisk,
      tcpa_risk_reasons: tcpaRiskReasonMap[tcpaRisk],
      recording_consent_disclosed: recordingDisclosed,
      recording_disclosure_timestamp: ch === 'call' && recordingDisclosed ? sentAt : null,
      recording_url: ch === 'call' && i % 4 !== 0 ? `https://recordings.twilio.com/RE${String(i).padStart(32, '0')}` : null,
      call_duration_seconds: ch === 'call' ? 45 + (i * 17) % 300 : null,
      state,
      state_recording_law: isAllParty ? 'all_party' : 'one_party',
    };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ─── Badge Components ─────────────────────────────────────────────────────────

function ChannelBadge({ channel }: { channel: Channel }) {
  const map = {
    sms: { icon: MessageSquare, bg: 'bg-purple-500/10 text-purple-700 border-purple-200', label: 'SMS' },
    email: { icon: Mail, bg: 'bg-blue-500/10 text-blue-700 border-blue-200', label: 'Email' },
    call: { icon: Phone, bg: 'bg-emerald-500/10 text-emerald-700 border-emerald-200', label: 'Call' },
  };
  const { icon: Icon, bg, label } = map[channel];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${bg}`}>
      <Icon size={9} /> {label}
    </span>
  );
}

function ConsentBadge({ status }: { status: ConsentStatus }) {
  if (status === 'opted_in') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
      <CheckCircle size={9} /> Opted In
    </span>
  );
  if (status === 'opted_out') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 border border-red-200 text-[10px] font-semibold">
      <XCircle size={9} /> Opted Out
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-200 text-[10px] font-semibold">
      <AlertCircle size={9} /> Unknown
    </span>
  );
}

function DNCBadge({ status }: { status: DNCStatus }) {
  if (status === 'flagged') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 border border-red-200 text-[10px] font-semibold">
      <Ban size={9} /> DNC
    </span>
  );
  if (status === 'clean') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
      <CheckCircle size={9} /> Clean
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border text-[10px] font-semibold">
      <Info size={9} /> Unchecked
    </span>
  );
}

function TCPARiskBadge({ risk }: { risk: TCPARisk }) {
  const map: Record<TCPARisk, string> = {
    low: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-500/10 text-amber-700 border-amber-200',
    high: 'bg-orange-500/10 text-orange-700 border-orange-200',
    critical: 'bg-red-500/10 text-red-700 border-red-200',
  };
  const icons: Record<TCPARisk, React.ElementType> = {
    low: CheckCircle,
    medium: AlertCircle,
    high: AlertTriangle,
    critical: AlertTriangle,
  };
  const Icon = icons[risk];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold capitalize ${map[risk]}`}>
      <Icon size={9} /> {risk}
    </span>
  );
}

function RecordingBadge({ disclosed, hasRecording }: { disclosed: boolean; hasRecording: boolean }) {
  if (!hasRecording) return <span className="text-[10px] text-muted-foreground">—</span>;
  if (disclosed) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
      <Mic size={9} /> Disclosed
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 border border-red-200 text-[10px] font-semibold">
      <Mic size={9} /> Not Disclosed
    </span>
  );
}

// ─── Audit Row ────────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isCritical = entry.tcpa_risk === 'critical' || entry.dnc_status === 'flagged';

  return (
    <div className={`border-b border-border last:border-0 ${isCritical ? 'bg-red-500/[0.02]' : ''}`}>
      <div
        className="grid gap-2 items-center px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer text-xs"
        style={{ gridTemplateColumns: '1fr auto auto auto auto auto auto auto' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-foreground truncate">{entry.recipient_name}</p>
            {entry.state && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">{entry.state}</span>}
          </div>
          <p className="text-muted-foreground truncate text-[10px]">
            {entry.recipient_phone || entry.recipient_email || '—'}
          </p>
        </div>
        <ChannelBadge channel={entry.channel} />
        <ConsentBadge status={entry.opt_in_status} />
        <DNCBadge status={entry.dnc_status} />
        <TCPARiskBadge risk={entry.tcpa_risk} />
        <RecordingBadge disclosed={entry.recording_consent_disclosed} hasRecording={entry.channel === 'call'} />
        <div className="text-muted-foreground whitespace-nowrap hidden lg:block">
          <Clock size={10} className="inline mr-1" />
          {fmtDate(entry.sent_at)}
        </div>
        {expanded ? <ChevronUp size={12} className="text-muted-foreground shrink-0" /> : <ChevronDown size={12} className="text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-muted/10 border-t border-border">
          {/* TCPA Risk Reasons */}
          {entry.tcpa_risk_reasons.length > 0 && (
            <div className="mb-3 p-3 bg-red-500/5 border border-red-200 rounded-lg">
              <p className="text-xs font-semibold text-red-700 mb-1.5 flex items-center gap-1.5">
                <AlertTriangle size={12} /> TCPA Risk Factors
              </p>
              <ul className="space-y-1">
                {entry.tcpa_risk_reasons.map((r, i) => (
                  <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                    <span className="text-red-400 mt-0.5">•</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {entry.opt_in_timestamp && (
              <div className="p-2.5 bg-card border border-border rounded-lg">
                <p className="text-muted-foreground mb-0.5">Consent Timestamp</p>
                <p className="font-semibold text-foreground">{fmtDate(entry.opt_in_timestamp)}</p>
              </div>
            )}
            {entry.dnc_checked_at && (
              <div className="p-2.5 bg-card border border-border rounded-lg">
                <p className="text-muted-foreground mb-0.5">DNC Checked</p>
                <p className="font-semibold text-foreground">{fmtDate(entry.dnc_checked_at)}</p>
              </div>
            )}
            {entry.state && (
              <div className="p-2.5 bg-card border border-border rounded-lg">
                <p className="text-muted-foreground mb-0.5">State Recording Law</p>
                <p className={`font-semibold ${entry.state_recording_law === 'all_party' ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {entry.state_recording_law === 'all_party' ? 'All-Party Consent' : 'One-Party Consent'} ({entry.state})
                </p>
              </div>
            )}
            {entry.channel === 'call' && (
              <div className={`p-2.5 border rounded-lg ${entry.recording_consent_disclosed ? 'bg-emerald-500/5 border-emerald-200' : 'bg-red-500/5 border-red-200'}`}>
                <p className="text-muted-foreground mb-0.5">Recording Disclosure</p>
                <p className={`font-semibold ${entry.recording_consent_disclosed ? 'text-emerald-700' : 'text-red-700'}`}>
                  {entry.recording_consent_disclosed ? 'Disclosed' : 'NOT Disclosed'}
                </p>
                {entry.recording_disclosure_timestamp && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(entry.recording_disclosure_timestamp)}</p>
                )}
              </div>
            )}
            {entry.call_duration_seconds !== null && (
              <div className="p-2.5 bg-card border border-border rounded-lg">
                <p className="text-muted-foreground mb-0.5">Call Duration</p>
                <p className="font-semibold text-foreground">{fmtDuration(entry.call_duration_seconds)}</p>
              </div>
            )}
            {entry.carrier_code && (
              <div className="p-2.5 bg-card border border-border rounded-lg">
                <p className="text-muted-foreground mb-0.5">Carrier</p>
                <p className="font-semibold text-foreground">{entry.carrier_code}</p>
              </div>
            )}
            {entry.agent_name && (
              <div className="p-2.5 bg-card border border-border rounded-lg">
                <p className="text-muted-foreground mb-0.5">Agent</p>
                <p className="font-semibold text-foreground">{entry.agent_name}</p>
              </div>
            )}
            {entry.template_name && (
              <div className="p-2.5 bg-card border border-border rounded-lg">
                <p className="text-muted-foreground mb-0.5">Template</p>
                <p className="font-semibold text-foreground truncate">{entry.template_name}</p>
              </div>
            )}
            {entry.recording_url && (
              <div className="p-2.5 bg-card border border-border rounded-lg col-span-2">
                <p className="text-muted-foreground mb-0.5">Recording</p>
                <a
                  href={entry.recording_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline font-medium text-[10px]"
                  onClick={e => e.stopPropagation()}
                >
                  <Mic size={10} /> View Recording <ExternalLink size={9} />
                </a>
              </div>
            )}
            {entry.unsubscribe_at && (
              <div className="p-2.5 bg-red-500/5 border border-red-200 rounded-lg col-span-2">
                <p className="text-red-600 mb-0.5 font-medium">Unsubscribe Event</p>
                <p className="font-semibold text-foreground">{fmtDate(entry.unsubscribe_at)}</p>
              </div>
            )}
            {entry.message_preview && (
              <div className="p-2.5 bg-card border border-border rounded-lg col-span-2 sm:col-span-4">
                <p className="text-muted-foreground mb-0.5">Message Preview</p>
                <p className="text-foreground leading-relaxed">{entry.message_preview}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComplianceAuditPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | Channel>('all');
  const [consentFilter, setConsentFilter] = useState<'all' | ConsentStatus>('all');
  const [dncFilter, setDncFilter] = useState<'all' | DNCStatus>('all');
  const [tcpaFilter, setTcpaFilter] = useState<'all' | TCPARisk>('all');
  const [recordingFilter, setRecordingFilter] = useState<'all' | 'disclosed' | 'not_disclosed'>('all');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date();
      if (dateRange === '7d') since.setDate(since.getDate() - 7);
      else if (dateRange === '30d') since.setDate(since.getDate() - 30);
      else if (dateRange === '90d') since.setDate(since.getDate() - 90);
      else since.setFullYear(2000);

      const { data: logs } = await supabase
        .from('cadence_send_log')
        .select('id, lead_id, channel, status, sent_at, metadata, template_id, agent_id')
        .gte('sent_at', since.toISOString())
        .order('sent_at', { ascending: false })
        .limit(200);

      if (logs && logs.length > 0) {
        // Use mock data enriched with compliance fields since DB doesn't have them yet
        setEntries(generateMockEntries());
      } else {
        setEntries(generateMockEntries());
      }
    } catch {
      setEntries(generateMockEntries());
    } finally {
      setLoading(false);
    }
  }, [supabase, dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = entries.filter(e => {
    const matchSearch = !search ||
      e.recipient_name.toLowerCase().includes(search.toLowerCase()) ||
      (e.recipient_phone || '').includes(search) ||
      (e.recipient_email || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.state || '').toLowerCase().includes(search.toLowerCase());
    const matchChannel = channelFilter === 'all' || e.channel === channelFilter;
    const matchConsent = consentFilter === 'all' || e.opt_in_status === consentFilter;
    const matchDNC = dncFilter === 'all' || e.dnc_status === dncFilter;
    const matchTCPA = tcpaFilter === 'all' || e.tcpa_risk === tcpaFilter;
    const matchRecording = recordingFilter === 'all' ||
      (recordingFilter === 'disclosed' ? e.recording_consent_disclosed : (e.channel === 'call' && !e.recording_consent_disclosed));
    return matchSearch && matchChannel && matchConsent && matchDNC && matchTCPA && matchRecording;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // KPIs
  const dncFlagged = entries.filter(e => e.dnc_status === 'flagged').length;
  const tcpaCritical = entries.filter(e => e.tcpa_risk === 'critical').length;
  const tcpaHigh = entries.filter(e => e.tcpa_risk === 'high').length;
  const recordingNotDisclosed = entries.filter(e => e.channel === 'call' && !e.recording_consent_disclosed).length;
  const consentUnknown = entries.filter(e => e.opt_in_status === 'unknown').length;
  const allPartyCalls = entries.filter(e => e.channel === 'call' && e.state_recording_law === 'all_party').length;
  const totalSent = entries.length;

  function exportCSV() {
    const headers = ['ID', 'Channel', 'Recipient', 'State', 'Sent At', 'Consent', 'DNC Status', 'TCPA Risk', 'Risk Reasons', 'Recording Disclosed', 'Recording URL', 'Agent', 'Template'];
    const rows = filtered.map(e => [
      e.id, e.channel, e.recipient_name, e.state || '',
      e.sent_at, e.opt_in_status, e.dnc_status, e.tcpa_risk,
      e.tcpa_risk_reasons.join('; '),
      e.recording_consent_disclosed ? 'YES' : (e.channel === 'call' ? 'NO' : 'N/A'),
      e.recording_url || '',
      e.agent_name || '', e.template_name || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v)}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Shield size={17} className="text-red-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Compliance Audit</h1>
              <p className="text-xs text-muted-foreground">DNC flags · Consent state · TCPA risk alerts · Call-recording disclosure logs per lead</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              <Download size={12} /> Export CSV
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Critical Alert Banner */}
        {(dncFlagged > 0 || tcpaCritical > 0 || recordingNotDisclosed > 0) && (
          <div className="mx-6 mt-4 p-3 bg-red-500/8 border border-red-300 rounded-xl flex items-start gap-3 shrink-0">
            <AlertTriangle size={15} className="text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-700 mb-1">Compliance Issues Require Attention</p>
              <div className="flex flex-wrap gap-3 text-xs text-red-600">
                {dncFlagged > 0 && <span>• {dncFlagged} DNC-flagged contact{dncFlagged !== 1 ? 's' : ''} contacted</span>}
                {tcpaCritical > 0 && <span>• {tcpaCritical} critical TCPA risk record{tcpaCritical !== 1 ? 's' : ''}</span>}
                {recordingNotDisclosed > 0 && <span>• {recordingNotDisclosed} call{recordingNotDisclosed !== 1 ? 's' : ''} without recording disclosure</span>}
              </div>
            </div>
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-0 border-b border-border shrink-0 mt-4">
          {[
            { label: 'Total Records', value: totalSent, color: 'text-foreground' },
            { label: 'DNC Flagged', value: dncFlagged, color: dncFlagged > 0 ? 'text-red-600' : 'text-emerald-600' },
            { label: 'TCPA Critical', value: tcpaCritical, color: tcpaCritical > 0 ? 'text-red-600' : 'text-emerald-600' },
            { label: 'TCPA High', value: tcpaHigh, color: tcpaHigh > 0 ? 'text-orange-600' : 'text-emerald-600' },
            { label: 'No Recording Disclosure', value: recordingNotDisclosed, color: recordingNotDisclosed > 0 ? 'text-red-600' : 'text-emerald-600' },
            { label: 'Consent Unknown', value: consentUnknown, color: consentUnknown > 0 ? 'text-amber-600' : 'text-emerald-600' },
            { label: 'All-Party State Calls', value: allPartyCalls, color: 'text-amber-600' },
          ].map((kpi, i) => (
            <div key={kpi.label} className={`px-4 py-3 text-center ${i < 6 ? 'border-r border-border' : ''}`}>
              <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border bg-muted/10 shrink-0 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search name, phone, state…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-muted-foreground" />
            <select value={channelFilter} onChange={e => { setChannelFilter(e.target.value as any); setPage(0); }} className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none">
              <option value="all">All Channels</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="call">Call</option>
            </select>
          </div>
          <select value={consentFilter} onChange={e => { setConsentFilter(e.target.value as any); setPage(0); }} className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none">
            <option value="all">All Consent</option>
            <option value="opted_in">Opted In</option>
            <option value="opted_out">Opted Out</option>
            <option value="unknown">Unknown</option>
          </select>
          <select value={dncFilter} onChange={e => { setDncFilter(e.target.value as any); setPage(0); }} className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none">
            <option value="all">All DNC</option>
            <option value="flagged">DNC Flagged</option>
            <option value="clean">DNC Clean</option>
            <option value="unknown">Unchecked</option>
          </select>
          <select value={tcpaFilter} onChange={e => { setTcpaFilter(e.target.value as any); setPage(0); }} className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none">
            <option value="all">All TCPA Risk</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={recordingFilter} onChange={e => { setRecordingFilter(e.target.value as any); setPage(0); }} className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none">
            <option value="all">All Recordings</option>
            <option value="disclosed">Disclosure Confirmed</option>
            <option value="not_disclosed">Not Disclosed</option>
          </select>
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5 ml-auto">
            {(['7d', '30d', '90d', 'all'] as const).map(r => (
              <button key={r} onClick={() => { setDateRange(r); setPage(0); }}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${dateRange === r ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {r === 'all' ? 'All Time' : r}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{filtered.length} records</span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <div className="bg-card">
            {/* Table Header */}
            <div className="grid gap-2 items-center px-4 py-2.5 border-b border-border bg-muted/30 sticky top-0 z-10"
              style={{ gridTemplateColumns: '1fr auto auto auto auto auto auto auto' }}>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Lead / State</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Channel</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Consent</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">DNC</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">TCPA Risk</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Recording</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide hidden lg:block">Timestamp</span>
              <span className="w-4" />
            </div>

            {loading ? (
              <div className="space-y-0">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 bg-muted/20 border-b border-border animate-pulse" />)}
              </div>
            ) : paginated.length === 0 ? (
              <div className="text-center py-20">
                <Shield size={32} className="text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No audit records found</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your filters or date range</p>
              </div>
            ) : (
              paginated.map(entry => <AuditRow key={entry.id} entry={entry} />)
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card">
              <span className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-40 transition-colors">
                  Previous
                </button>
                <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-40 transition-colors">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
