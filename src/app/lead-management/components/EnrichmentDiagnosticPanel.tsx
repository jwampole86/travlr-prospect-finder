'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronUp, MapPin, Phone, Shield, Activity, Zap, Target, Eye, EyeOff,  } from 'lucide-react';
import { toast } from 'sonner';

interface EnrichmentDiagnosticPanelProps {
  leadId: string;
  leadAddress?: string;
}

interface ErrorLog {
  id: string;
  lead_id: string;
  batch_id?: string;
  stage: string;
  error_code: string;
  error_message: string;
  error_detail?: Record<string, unknown>;
  raw_address?: string;
  normalized_address?: string;
  normalization_result?: Record<string, unknown>;
  api_provider?: string;
  api_request?: Record<string, unknown>;
  api_response?: Record<string, unknown>;
  api_http_status?: number;
  api_duration_ms?: number;
  match_strategy?: string;
  match_found?: boolean;
  match_confidence?: number;
  matched_lead_id?: string;
  verification_score?: number;
  verification_score_breakdown?: Record<string, number>;
  retry_count?: number;
  last_retry_at?: string;
  is_transient?: boolean;
  resolved?: boolean;
  created_at: string;
}

interface LeadEnrichmentState {
  enrichment_status?: string;
  enrichment_retry_count?: number;
  enrichment_last_error?: string;
  enrichment_last_error_code?: string;
  enrichment_is_transient_error?: boolean;
  enrichment_attempted_at?: string;
  standardized_address?: string;
  dedup_fingerprint?: string;
  match_strategy?: string;
  match_confidence?: number;
  verification_score?: number;
  verified_owner?: boolean;
  verified_number?: boolean;
  verified_address?: boolean;
  has_phone?: boolean;
  source_property_id?: string;
  apn?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-muted text-muted-foreground border-border',
  MATCHING: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  ENRICHED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  PARTIAL: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  NO_MATCH: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  ERROR: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const STAGE_LABELS: Record<string, string> = {
  import_insert: 'CSV Insert',
  import_merge: 'CSV Merge',
  import_row: 'Row Processing',
  retry_queued: 'Retry Queued',
  stage1: 'Stage 1 — Owner Lookup',
  stage2: 'Stage 2 — Contact Enrichment',
  stage3: 'Stage 3 — Skip Trace',
};

function JsonViewer({ data, label }: { data: unknown; label: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return <span className="text-muted-foreground text-[10px]">—</span>;
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const preview = json.slice(0, 80) + (json.length > 80 ? '…' : '');
  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-[10px] text-primary hover:underline"
      >
        {expanded ? <EyeOff size={9} /> : <Eye size={9} />}
        {expanded ? 'Hide' : 'Show'} {label}
      </button>
      {expanded && (
        <pre className="mt-1 p-2 bg-muted/50 rounded text-[9px] font-mono text-foreground overflow-x-auto max-h-40 border border-border">
          {json}
        </pre>
      )}
      {!expanded && (
        <p className="text-[9px] text-muted-foreground font-mono truncate mt-0.5">{preview}</p>
      )}
    </div>
  );
}

function ScoreBar({ score, label }: { score: number; label?: string }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-semibold text-foreground w-8 text-right">{score}</span>
      {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
    </div>
  );
}

export default function EnrichmentDiagnosticPanel({ leadId, leadAddress }: EnrichmentDiagnosticPanelProps) {
  const supabase = createClient();
  const [lead, setLead] = useState<LeadEnrichmentState | null>(null);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadRes, logsRes] = await Promise.all([
        supabase
          .from('leads')
          .select('enrichment_status, enrichment_retry_count, enrichment_last_error, enrichment_last_error_code, enrichment_is_transient_error, enrichment_attempted_at, standardized_address, dedup_fingerprint, match_strategy, match_confidence, verification_score, verified_owner, verified_number, verified_address, has_phone, source_property_id, apn, address, city, state, zip')
          .eq('id', leadId)
          .single(),
        supabase
          .from('enrichment_error_logs')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (leadRes.data) setLead(leadRes.data as LeadEnrichmentState);
      if (logsRes.data) setErrorLogs(logsRes.data as ErrorLog[]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch('/api/leads/retry-enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [leadId] }),
      });
      const data = await res.json();
      if (data.success) {
        const result = data.results?.[0];
        if (result?.queued) {
          toast.success(`Enrichment retry queued (attempt ${result.retryCount})`);
        } else {
          toast.warning(result?.reason || 'Not eligible for retry');
        }
        await loadData();
      } else {
        toast.error(data.error || 'Retry failed');
      }
    } catch {
      toast.error('Network error during retry');
    } finally {
      setRetrying(false);
    }
  }

  async function handleForceRetry() {
    setRetrying(true);
    try {
      const res = await fetch('/api/leads/retry-enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [leadId], force: true }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Force retry queued');
        await loadData();
      } else {
        toast.error(data.error || 'Force retry failed');
      }
    } catch {
      toast.error('Network error during force retry');
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-48 mb-3" />
        <div className="h-3 bg-muted rounded w-full mb-2" />
        <div className="h-3 bg-muted rounded w-3/4" />
      </div>
    );
  }

  const status = lead?.enrichment_status || 'PENDING';
  const retryCount = lead?.enrichment_retry_count || 0;
  const isTransient = lead?.enrichment_is_transient_error || false;
  const verificationScore = lead?.verification_score || 0;
  const canRetry = ['ERROR', 'NO_MATCH', 'PARTIAL'].includes(status);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">Enrichment Diagnostics</span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[status] || STATUS_COLORS.PENDING}`}>
            {status}
          </span>
          {isTransient && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-600 border-amber-500/20">
              Transient
            </span>
          )}
          {retryCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {retryCount} {retryCount === 1 ? 'retry' : 'retries'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={9} className={retrying ? 'animate-spin' : ''} />
              Retry
            </button>
          )}
          {canRetry && retryCount >= 3 && (
            <button
              onClick={handleForceRetry}
              disabled={retrying}
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
            >
              <Zap size={9} />
              Force Retry
            </button>
          )}
          <button onClick={() => setExpanded(v => !v)} className="p-1 rounded hover:bg-muted transition-colors">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {!expanded ? null : (
        <div className="p-4 space-y-4">

          {/* ── Normalization Result ─────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <MapPin size={11} className="text-primary" />
              <span className="text-[11px] font-semibold text-foreground">Address Normalization</span>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-[10px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Raw Address</span>
                <span className="text-foreground font-medium text-right max-w-[60%] truncate">{leadAddress || lead?.address || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Standardized</span>
                <span className="text-foreground font-medium text-right max-w-[60%] truncate">{lead?.standardized_address || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dedup Fingerprint</span>
                <span className="text-foreground font-mono text-right max-w-[60%] truncate text-[9px]">{lead?.dedup_fingerprint || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">City / State / ZIP</span>
                <span className="text-foreground font-medium">{[lead?.city, lead?.state, lead?.zip].filter(Boolean).join(', ') || '—'}</span>
              </div>
            </div>
          </section>

          {/* ── Match Outcome ────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <Target size={11} className="text-primary" />
              <span className="text-[11px] font-semibold text-foreground">Match Outcome</span>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-[10px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Match Strategy</span>
                <span className="text-foreground font-medium">{lead?.match_strategy || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Match Confidence</span>
                <span className="text-foreground font-medium">{lead?.match_confidence != null ? `${lead.match_confidence}%` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source Property ID</span>
                <span className="text-foreground font-mono text-[9px]">{lead?.source_property_id || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">APN / Parcel</span>
                <span className="text-foreground font-mono text-[9px]">{lead?.apn || '—'}</span>
              </div>
            </div>
          </section>

          {/* ── Verification Score ───────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <Shield size={11} className="text-primary" />
              <span className="text-[11px] font-semibold text-foreground">Verification Score</span>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <ScoreBar score={verificationScore} label="/ 100" />
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { label: 'Owner', value: lead?.verified_owner, icon: <Shield size={9} /> },
                  { label: 'Number', value: lead?.verified_number, icon: <Phone size={9} /> },
                  { label: 'Address', value: lead?.verified_address, icon: <MapPin size={9} /> },
                ].map(({ label, value, icon }) => (
                  <div key={label} className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border ${value ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'}`}>
                    {value ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
                    {icon}
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Error Logs ───────────────────────────────────────────────── */}
          {errorLogs.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertCircle size={11} className="text-red-500" />
                <span className="text-[11px] font-semibold text-foreground">Error Logs</span>
                <span className="text-[10px] text-muted-foreground">({errorLogs.length})</span>
              </div>
              <div className="space-y-2">
                {errorLogs.map(log => (
                  <div key={log.id} className={`rounded-lg border overflow-hidden ${log.resolved ? 'border-border opacity-60' : 'border-red-500/20'}`}>
                    <button
                      onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-red-500/5 hover:bg-red-500/10 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded ${log.is_transient ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600'}`}>
                          {log.error_code}
                        </span>
                        <span className="text-[10px] text-foreground">{STAGE_LABELS[log.stage] || log.stage}</span>
                        {log.is_transient && (
                          <span className="text-[9px] text-amber-600 bg-amber-500/10 px-1 rounded">Transient</span>
                        )}
                        {log.resolved && (
                          <span className="text-[9px] text-emerald-600 bg-emerald-500/10 px-1 rounded">Resolved</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                        {expandedLogId === log.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </div>
                    </button>

                    {expandedLogId === log.id && (
                      <div className="px-3 py-2 space-y-2 bg-card">
                        <p className="text-[10px] text-red-600">{log.error_message}</p>

                        {/* Normalization */}
                        {log.normalization_result && (
                          <div>
                            <p className="text-[10px] font-semibold text-foreground mb-1">Normalization Result</p>
                            <JsonViewer data={log.normalization_result} label="normalization data" />
                          </div>
                        )}

                        {/* API Request / Response */}
                        {(log.api_provider || log.api_request || log.api_response) && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold text-foreground">API Diagnostics</p>
                            {log.api_provider && (
                              <div className="flex gap-2 text-[10px]">
                                <span className="text-muted-foreground">Provider:</span>
                                <span className="text-foreground font-medium">{log.api_provider}</span>
                              </div>
                            )}
                            {log.api_http_status && (
                              <div className="flex gap-2 text-[10px]">
                                <span className="text-muted-foreground">HTTP Status:</span>
                                <span className={`font-medium ${log.api_http_status >= 400 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {log.api_http_status}
                                </span>
                              </div>
                            )}
                            {log.api_duration_ms && (
                              <div className="flex gap-2 text-[10px]">
                                <span className="text-muted-foreground">Duration:</span>
                                <span className="text-foreground">{log.api_duration_ms}ms</span>
                              </div>
                            )}
                            {log.api_request && <JsonViewer data={log.api_request} label="API request" />}
                            {log.api_response && <JsonViewer data={log.api_response} label="API response" />}
                          </div>
                        )}

                        {/* Match outcome */}
                        {log.match_strategy && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold text-foreground">Match Outcome</p>
                            <div className="flex gap-4 text-[10px]">
                              <span className="text-muted-foreground">Strategy: <span className="text-foreground">{log.match_strategy}</span></span>
                              <span className="text-muted-foreground">Confidence: <span className="text-foreground">{log.match_confidence}%</span></span>
                              <span className={log.match_found ? 'text-emerald-600' : 'text-red-600'}>
                                {log.match_found ? '✓ Match found' : '✗ No match'}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Verification score breakdown */}
                        {log.verification_score_breakdown && Object.keys(log.verification_score_breakdown).length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-foreground mb-1">
                              Verification Score: {log.verification_score}/100
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(log.verification_score_breakdown).map(([k, v]) => (
                                <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                  {k.replace(/_/g, ' ')}: +{v}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Retry info */}
                        {(log.retry_count || 0) > 0 && (
                          <div className="flex gap-2 text-[10px]">
                            <span className="text-muted-foreground">Retry count:</span>
                            <span className="text-foreground">{log.retry_count}</span>
                            {log.last_retry_at && (
                              <span className="text-muted-foreground">
                                Last: {new Date(log.last_retry_at).toLocaleString()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {errorLogs.length === 0 && status !== 'ERROR' && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
              <CheckCircle2 size={12} className="text-emerald-600" />
              <p className="text-[10px] text-emerald-700">No enrichment errors recorded for this property.</p>
            </div>
          )}

          {/* Last error summary */}
          {lead?.enrichment_last_error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <AlertCircle size={11} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-red-600">{lead.enrichment_last_error_code || 'ERROR'}</p>
                <p className="text-[10px] text-red-700 mt-0.5">{lead.enrichment_last_error}</p>
                {lead.enrichment_is_transient_error && (
                  <p className="text-[9px] text-amber-600 mt-1">
                    ⚡ Transient error — safe to retry automatically
                  </p>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
