'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Shield, Search, RefreshCw, CheckCircle, AlertCircle, XCircle, Clock, ChevronDown, ChevronRight, Filter } from 'lucide-react';

interface VerificationLogEntry {
  id: string;
  lead_id: string | null;
  raw_address: string | null;
  normalized_address: string | null;
  provider_name: string | null;
  provider_request: Record<string, unknown> | null;
  provider_response: Record<string, unknown> | null;
  match_result: boolean | null;
  provider_property_id: string | null;
  apn: string | null;
  latitude: number | null;
  longitude: number | null;
  verification_score: number | null;
  verification_status: string | null;
  rejection_reason: string | null;
  verification_method: string | null;
  created_at: string;
}

interface QuarantineEntry {
  id: string;
  original_lead_id: string | null;
  raw_address: string | null;
  normalized_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: string | null;
  verification_status: string | null;
  verification_score: number | null;
  rejection_reason: string | null;
  verification_notes: string | null;
  quarantined_at: string;
  reviewed_at: string | null;
}

interface VerificationStats {
  total_leads: number;
  verified: number;
  candidate: number;
  pending: number;
  rejected: number;
  quarantined: number;
  stale: number;
  avg_score: number;
  pct_verified: number;
  quarantine_count: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  VERIFIED:             { label: 'Verified', color: 'text-green-600 bg-green-500/10 border-green-500/25', icon: <CheckCircle size={11} /> },
  CANDIDATE:            { label: 'Candidate', color: 'text-blue-600 bg-blue-500/10 border-blue-500/25', icon: <Clock size={11} /> },
  PENDING_VERIFICATION: { label: 'Pending', color: 'text-amber-600 bg-amber-500/10 border-amber-500/25', icon: <Clock size={11} /> },
  REJECTED:             { label: 'Rejected', color: 'text-red-600 bg-red-500/10 border-red-500/25', icon: <XCircle size={11} /> },
  QUARANTINED:          { label: 'Quarantined', color: 'text-orange-600 bg-orange-500/10 border-orange-500/25', icon: <AlertCircle size={11} /> },
  STALE_VERIFICATION:   { label: 'Stale', color: 'text-muted-foreground bg-muted border-border', icon: <Clock size={11} /> },
};

function StatusBadge({ status }: { status: string | null }) {
  const cfg = STATUS_CONFIG[status || ''] || { label: status || 'Unknown', color: 'text-muted-foreground bg-muted border-border', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  const s = score ?? 0;
  const color = s >= 90 ? 'bg-green-500' : s >= 75 ? 'bg-emerald-500' : s >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${s}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{s}</span>
    </div>
  );
}

function ExpandableJSON({ data, label }: { data: Record<string, unknown> | null; label: string }) {
  const [open, setOpen] = useState(false);
  if (!data) return <span className="text-[10px] text-muted-foreground italic">—</span>;
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[10px] text-primary hover:underline"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {label}
      </button>
      {open && (
        <pre className="mt-1 p-2 bg-muted/50 rounded text-[9px] font-mono text-foreground overflow-x-auto max-h-40 border border-border">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function PropertyVerificationDebugPage() {
  const [activeTab, setActiveTab] = useState<'log' | 'quarantine' | 'stats'>('stats');
  const [stats, setStats] = useState<VerificationStats | null>(null);
  const [logEntries, setLogEntries] = useState<VerificationLogEntry[]>([]);
  const [quarantineEntries, setQuarantineEntries] = useState<QuarantineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [runningAudit, setRunningAudit] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);

  const supabase = createClient();

  async function loadData() {
    setLoading(true);
    try {
      // Load stats
      const [
        totalResult,
        verifiedResult,
        candidateResult,
        pendingResult,
        rejectedResult,
        quarantinedStatusResult,
        quarantineCountResult,
      ] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }).neq('is_synthetic', true),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('verification_status', 'VERIFIED'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('verification_status', 'CANDIDATE'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('verification_status', 'PENDING_VERIFICATION'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('verification_status', 'REJECTED'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('verification_status', 'QUARANTINED'),
        supabase.from('property_quarantine').select('*', { count: 'exact', head: true }),
      ]);

      const total = totalResult.count;
      const verified = verifiedResult.count;
      const candidate = candidateResult.count;
      const pending = pendingResult.count;
      const rejected = rejectedResult.count;
      const quarantinedStatus = quarantinedStatusResult.count;
      const quarantineCount = quarantineCountResult.count;

      const totalLeads = total ?? 0;
      const verifiedCount = verified ?? 0;

      setStats({
        total_leads: totalLeads,
        verified: verifiedCount,
        candidate: candidate ?? 0,
        pending: pending ?? 0,
        rejected: rejected ?? 0,
        quarantined: quarantinedStatus ?? 0,
        stale: 0,
        avg_score: 0,
        pct_verified: totalLeads > 0 ? Math.round((verifiedCount / totalLeads) * 100) : 0,
        quarantine_count: quarantineCount ?? 0,
      });

      // Load verification log
      const { data: logData } = await supabase
        .from('property_verification_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (logData) setLogEntries(logData as VerificationLogEntry[]);

      // Load quarantine
      const { data: quarData } = await supabase
        .from('property_quarantine')
        .select('id, original_lead_id, raw_address, normalized_address, city, state, zip, source, verification_status, verification_score, rejection_reason, verification_notes, quarantined_at, reviewed_at')
        .order('quarantined_at', { ascending: false })
        .limit(200);

      if (quarData) setQuarantineEntries(quarData as QuarantineEntry[]);
    } catch (err) {
      console.error('Failed to load verification data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function runVerificationAudit() {
    setRunningAudit(true);
    setAuditResult(null);
    try {
      const res = await fetch('/api/sync/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagnostic: true }),
      });
      const data = await res.json();
      const summary = data.pipeline_summary;
      setAuditResult(
        `Audit complete — Candidates: ${summary?.total_candidates ?? 0} | Verified: ${summary?.total_verified ?? 0} | Quarantined: ${summary?.total_quarantined ?? 0} | Errors: ${summary?.total_errors ?? 0}`
      );
      await loadData();
    } catch (err) {
      setAuditResult(`Audit failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRunningAudit(false);
    }
  }

  const filteredLog = logEntries.filter(e => {
    const matchSearch = !searchQuery ||
      (e.raw_address || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.lead_id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || e.verification_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredQuarantine = quarantineEntries.filter(e => {
    const matchSearch = !searchQuery ||
      (e.raw_address || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.original_lead_id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || e.verification_status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Property Verification Debug Panel</h1>
              <p className="text-xs text-muted-foreground">Trace every property through the verification pipeline</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runVerificationAudit}
              disabled={runningAudit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {runningAudit ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {runningAudit ? 'Running Audit…' : 'Run Verification Audit'}
            </button>
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
        </div>

        {/* Audit result banner */}
        {auditResult && (
          <div className="px-6 py-2 bg-primary/5 border-b border-primary/20 text-xs text-primary font-medium">
            {auditResult}
          </div>
        )}

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-7 gap-3 px-6 py-4 border-b border-border bg-muted/20 shrink-0">
            {[
              { label: 'Total Properties', value: stats.total_leads, color: 'text-foreground' },
              { label: 'Verified', value: stats.verified, color: 'text-green-600' },
              { label: 'Candidate', value: stats.candidate, color: 'text-blue-600' },
              { label: 'Pending', value: stats.pending, color: 'text-amber-600' },
              { label: 'Rejected', value: stats.rejected, color: 'text-red-600' },
              { label: 'Quarantined', value: stats.quarantine_count, color: 'text-orange-600' },
              { label: '% Verified', value: `${stats.pct_verified}%`, color: stats.pct_verified >= 75 ? 'text-green-600' : 'text-amber-600' },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-lg p-3 text-center">
                <p className="text-[10px] text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-border shrink-0">
          {[
            { id: 'stats', label: 'Overview' },
            { id: 'log', label: `Verification Log (${logEntries.length})` },
            { id: 'quarantine', label: `Quarantine (${quarantineEntries.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search address or lead ID…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="VERIFIED">Verified</option>
              <option value="CANDIDATE">Candidate</option>
              <option value="PENDING_VERIFICATION">Pending</option>
              <option value="REJECTED">Rejected</option>
              <option value="QUARANTINED">Quarantined</option>
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === 'stats' ? (
            <div className="space-y-6 max-w-4xl">
              {/* Pipeline explanation */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Shield size={14} className="text-primary" />
                  Verification Pipeline
                </h2>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { step: '1', label: 'Normalize Address', desc: 'Street, city, state, ZIP canonicalized' },
                    { step: '2', label: 'Verify Property', desc: 'Provider match or structural check' },
                    { step: '3', label: 'Score (0–100)', desc: '≥75 required for production' },
                    { step: '4', label: 'Gate Decision', desc: 'VERIFIED or QUARANTINED' },
                    { step: '5', label: 'Production DB', desc: 'Only VERIFIED ≥75 inserted' },
                  ].map(s => (
                    <div key={s.step} className="text-center p-3 bg-muted/40 rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center mx-auto mb-2">{s.step}</div>
                      <p className="text-[10px] font-semibold text-foreground mb-1">{s.label}</p>
                      <p className="text-[9px] text-muted-foreground">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Score legend */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">Verification Score Legend</h2>
                <div className="space-y-2">
                  {[
                    { range: '100', label: 'Verified property with strong property-record match', color: 'bg-green-500' },
                    { range: '90', label: 'Verified address + property identifier', color: 'bg-emerald-500' },
                    { range: '75', label: 'Strong address match but limited property metadata', color: 'bg-emerald-400' },
                    { range: '50', label: 'Address/geocode match only — BLOCKED from production', color: 'bg-amber-500' },
                    { range: '25', label: 'Weak/incomplete candidate — BLOCKED from production', color: 'bg-orange-500' },
                    { range: '0', label: 'No verified property match — BLOCKED from production', color: 'bg-red-500' },
                  ].map(s => (
                    <div key={s.range} className="flex items-center gap-3">
                      <div className={`w-8 h-2 rounded-full ${s.color}`} />
                      <span className="text-[10px] font-mono text-muted-foreground w-6">{s.range}</span>
                      <span className="text-xs text-foreground">{s.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-2.5 bg-amber-500/8 border border-amber-500/20 rounded-lg">
                  <p className="text-[11px] text-amber-700 font-medium">Production threshold: verification_score ≥ 75 AND verification_status = VERIFIED</p>
                </div>
              </div>

              {/* Hard fail rule */}
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700 mb-1">Hard Fail Safety Rule</p>
                    <p className="text-xs text-red-600">
                      If the property verification provider is unavailable, candidates are QUARANTINED — not inserted.
                      The system fails CLOSED. NO VERIFICATION = NO PRODUCTION PROPERTY.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'log' ? (
            <div className="space-y-2">
              {filteredLog.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No verification log entries found. Run a sync to generate verification records.
                </div>
              ) : filteredLog.map(entry => (
                <div key={entry.id} className="bg-card border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                  >
                    <StatusBadge status={entry.verification_status} />
                    <span className="text-xs font-medium text-foreground flex-1 truncate">{entry.raw_address || '—'}</span>
                    <ScoreBar score={entry.verification_score} />
                    <span className="text-[10px] text-muted-foreground w-24 text-right shrink-0">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </span>
                    {expandedRow === entry.id ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
                  </button>
                  {expandedRow === entry.id && (
                    <div className="px-4 pb-4 border-t border-border bg-muted/10">
                      <div className="grid grid-cols-3 gap-4 mt-3">
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Source Record</p>
                          <div className="space-y-1">
                            {[
                              { label: 'Lead ID', value: entry.lead_id },
                              { label: 'Raw Address', value: entry.raw_address },
                              { label: 'Method', value: entry.verification_method },
                            ].map(f => (
                              <div key={f.label} className="flex gap-2">
                                <span className="text-[10px] text-muted-foreground w-24 shrink-0">{f.label}</span>
                                <span className="text-[10px] text-foreground truncate">{f.value || '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Normalized & Verified</p>
                          <div className="space-y-1">
                            {[
                              { label: 'Normalized', value: entry.normalized_address },
                              { label: 'Provider ID', value: entry.provider_property_id },
                              { label: 'APN', value: entry.apn },
                              { label: 'Coordinates', value: entry.latitude ? `${entry.latitude?.toFixed(4)}, ${entry.longitude?.toFixed(4)}` : null },
                            ].map(f => (
                              <div key={f.label} className="flex gap-2">
                                <span className="text-[10px] text-muted-foreground w-24 shrink-0">{f.label}</span>
                                <span className="text-[10px] text-foreground truncate">{f.value || '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Match Result</p>
                          <div className="space-y-1">
                            <div className="flex gap-2">
                              <span className="text-[10px] text-muted-foreground w-24 shrink-0">Match</span>
                              <span className={`text-[10px] font-medium ${entry.match_result ? 'text-green-600' : 'text-red-500'}`}>
                                {entry.match_result ? 'YES' : 'NO'}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-[10px] text-muted-foreground w-24 shrink-0">Score</span>
                              <span className="text-[10px] font-mono text-foreground">{entry.verification_score ?? 0}/100</span>
                            </div>
                            {entry.rejection_reason && (
                              <div className="mt-2 p-2 bg-red-500/8 rounded text-[10px] text-red-600">
                                {entry.rejection_reason}
                              </div>
                            )}
                          </div>
                          <ExpandableJSON data={entry.provider_request} label="Provider Request" />
                          <ExpandableJSON data={entry.provider_response} label="Provider Response" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Quarantine tab */
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 bg-orange-500/8 border border-orange-500/20 rounded-lg mb-4">
                <AlertCircle size={14} className="text-orange-600 shrink-0" />
                <p className="text-xs text-orange-700">
                  Quarantined records are preserved for audit. They are NOT in the production database and cannot receive outreach.
                  Review each record to determine if it should be re-verified or permanently rejected.
                </p>
              </div>
              {filteredQuarantine.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No quarantined records found.
                </div>
              ) : filteredQuarantine.map(entry => (
                <div key={entry.id} className="bg-card border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                  >
                    <StatusBadge status={entry.verification_status} />
                    <span className="text-xs font-medium text-foreground flex-1 truncate">{entry.raw_address || '—'}</span>
                    <span className="text-[10px] text-muted-foreground">{entry.city}, {entry.state} {entry.zip}</span>
                    <span className="text-[10px] text-muted-foreground w-24 text-right shrink-0">
                      {new Date(entry.quarantined_at).toLocaleDateString()}
                    </span>
                    {entry.reviewed_at && (
                      <span className="text-[9px] text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded-full">Reviewed</span>
                    )}
                    {expandedRow === entry.id ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
                  </button>
                  {expandedRow === entry.id && (
                    <div className="px-4 pb-4 border-t border-border bg-muted/10">
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Record Details</p>
                          <div className="space-y-1">
                            {[
                              { label: 'Original Lead ID', value: entry.original_lead_id },
                              { label: 'Raw Address', value: entry.raw_address },
                              { label: 'Normalized', value: entry.normalized_address },
                              { label: 'Source', value: entry.source },
                              { label: 'Score', value: `${entry.verification_score ?? 0}/100` },
                            ].map(f => (
                              <div key={f.label} className="flex gap-2">
                                <span className="text-[10px] text-muted-foreground w-28 shrink-0">{f.label}</span>
                                <span className="text-[10px] text-foreground">{f.value || '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Rejection Reason</p>
                          {entry.rejection_reason ? (
                            <div className="p-2.5 bg-red-500/8 border border-red-500/20 rounded-lg text-[11px] text-red-600">
                              {entry.rejection_reason}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">No reason recorded</span>
                          )}
                          {entry.verification_notes && (
                            <div className="p-2.5 bg-muted/40 rounded-lg text-[11px] text-foreground mt-2">
                              {entry.verification_notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
