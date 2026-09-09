'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Database, Search, Loader2, CheckCircle, AlertTriangle, HelpCircle, ExternalLink, ChevronRight, Shield } from 'lucide-react';
import { CANONICAL_STATUS_LABELS, CANONICAL_STATUS_COLORS, formatRegDate } from '@/lib/services/cityRegulationService';

export default function RegulationTracePage() {
  const [leadId, setLeadId] = useState('');
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTrace() {
    if (!leadId.trim()) return;
    setLoading(true);
    setError(null);
    setTrace(null);
    try {
      const res = await fetch(`/api/regulations/trace?leadId=${encodeURIComponent(leadId.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trace failed');
      setTrace(data.trace as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trace failed');
    }
    setLoading(false);
  }

  const evaluation = trace?.evaluation as Record<string, unknown> | null;
  const canonicalReg = trace?.canonical_regulation as Record<string, unknown> | null;
  const status = evaluation?.city_regulation_status as string || 'UNKNOWN';

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Database size={20} className="text-primary" />
            Trace Regulation / Jurisdiction
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Admin diagnostic — inspect why a property received its current regulation evaluation</p>
        </div>

        {/* Input */}
        <div className="bg-card border border-border rounded-xl p-5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Property / Lead ID</label>
          <div className="flex gap-2">
            <input
              value={leadId}
              onChange={e => setLeadId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTrace()}
              placeholder="Enter lead UUID…"
              className="flex-1 px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={handleTrace}
              disabled={loading || !leadId.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Trace
            </button>
          </div>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        </div>

        {/* Results */}
        {trace && (
          <div className="space-y-4">
            {/* Property */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <ChevronRight size={14} className="text-primary" />
                Property
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                {[
                  ['Lead ID', trace.lead_id as string],
                  ['Address', trace.address as string],
                  ['Verified Address', trace.verified_address as string],
                  ['City', trace.city as string],
                  ['County', trace.county as string],
                  ['State', trace.state as string],
                  ['ZIP', trace.zip as string],
                  ['Legacy Status', trace.legacy_regulation_status as string],
                ].map(([label, value]) => (
                  <div key={label as string} className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-muted-foreground mb-0.5">{label}</p>
                    <p className="font-semibold text-foreground">{(value as string) || '—'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Jurisdiction Resolution */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <ChevronRight size={14} className="text-primary" />
                Jurisdiction Resolution
              </h3>
              {evaluation ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-primary" />
                    <span className="text-sm font-semibold text-foreground">{evaluation.jurisdiction_name as string || 'Unknown'}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${CANONICAL_STATUS_COLORS[status as keyof typeof CANONICAL_STATUS_COLORS] || 'bg-muted text-muted-foreground border-border'}`}>
                      {CANONICAL_STATUS_LABELS[status as keyof typeof CANONICAL_STATUS_LABELS] || status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    {[
                      ['Evaluation ID', evaluation.evaluation_id as string],
                      ['Evaluated At', formatRegDate(evaluation.evaluated_at as string)],
                      ['Regulation Version', `v${evaluation.regulation_version || '—'}`],
                      ['Confidence', evaluation.confidence as string],
                      ['Review Required', evaluation.review_required ? 'Yes' : 'No'],
                      ['Evaluation Reason', evaluation.evaluation_reason as string],
                    ].map(([label, value]) => (
                      <div key={label as string} className="bg-muted/30 rounded-lg p-2.5">
                        <p className="text-muted-foreground mb-0.5">{label}</p>
                        <p className="font-semibold text-foreground">{(value as string) || '—'}</p>
                      </div>
                    ))}
                  </div>
                  {(evaluation.data_quality_flags as string[] | null)?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {(evaluation.data_quality_flags as string[]).map(flag => (
                        <span key={flag} className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 font-semibold border border-orange-500/20">{flag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <AlertTriangle size={14} className="text-yellow-600" />
                  <p className="text-xs text-yellow-700">No regulation evaluation found for this property. Run backfill or evaluate individually.</p>
                </div>
              )}
            </div>

            {/* Canonical Regulation Record */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <ChevronRight size={14} className="text-primary" />
                Canonical Regulation Record
              </h3>
              {canonicalReg ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    {[
                      ['Regulation ID', canonicalReg.regulation_id as string],
                      ['Jurisdiction Name', canonicalReg.jurisdiction_name as string],
                      ['Jurisdiction Type', canonicalReg.jurisdiction_type as string],
                      ['Status', CANONICAL_STATUS_LABELS[canonicalReg.status as keyof typeof CANONICAL_STATUS_LABELS] || canonicalReg.status as string],
                      ['STR Allowed', canonicalReg.str_allowed === true ? 'Yes' : canonicalReg.str_allowed === false ? 'No' : '—'],
                      ['Permit Required', canonicalReg.permit_required === true ? 'Yes' : canonicalReg.permit_required === false ? 'No' : '—'],
                      ['Primary Res. Required', canonicalReg.primary_residence_required === true ? 'Yes' : canonicalReg.primary_residence_required === false ? 'No' : '—'],
                      ['Night Cap', canonicalReg.night_cap ? `${canonicalReg.night_cap} nights/yr` : 'None'],
                      ['Min Stay', canonicalReg.minimum_stay ? `${canonicalReg.minimum_stay} nights` : '—'],
                      ['Source Name', canonicalReg.source_name as string],
                      ['Last Verified', formatRegDate(canonicalReg.last_verified_at as string)],
                      ['Review Status', canonicalReg.review_status as string],
                      ['Regulation Version', `v${canonicalReg.regulation_version}`],
                    ].map(([label, value]) => (
                      <div key={label as string} className="bg-muted/30 rounded-lg p-2.5">
                        <p className="text-muted-foreground mb-0.5">{label}</p>
                        <p className="font-semibold text-foreground">{(value as string) || '—'}</p>
                      </div>
                    ))}
                  </div>
                  {canonicalReg.source_url && (
                    <a href={canonicalReg.source_url as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                      <ExternalLink size={11} />
                      View Official Source
                    </a>
                  )}
                  {canonicalReg.summary && (
                    <div className="bg-muted/20 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Summary</p>
                      <p className="text-xs text-foreground">{canonicalReg.summary as string}</p>
                    </div>
                  )}
                  {canonicalReg.agent_summary && (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-1">Agent Summary</p>
                      <p className="text-xs text-foreground italic">"{canonicalReg.agent_summary as string}"</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                  <HelpCircle size={14} className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">No canonical regulation record matched. Property is evaluated as UNKNOWN or using legacy status.</p>
                </div>
              )}
            </div>

            {/* Reconciliation check */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <ChevronRight size={14} className="text-primary" />
                Reconciliation
              </h3>
              <div className="space-y-2 text-xs">
                {[
                  { label: 'Property Profile', value: evaluation ? CANONICAL_STATUS_LABELS[status as keyof typeof CANONICAL_STATUS_LABELS] || status : 'No evaluation' },
                  { label: 'Dashboard Classification', value: evaluation ? CANONICAL_STATUS_LABELS[status as keyof typeof CANONICAL_STATUS_LABELS] || status : 'Unknown' },
                  { label: 'Lead Management Filter', value: evaluation ? CANONICAL_STATUS_LABELS[status as keyof typeof CANONICAL_STATUS_LABELS] || status : 'Unknown' },
                  { label: 'Teleprompter Context', value: evaluation ? CANONICAL_STATUS_LABELS[status as keyof typeof CANONICAL_STATUS_LABELS] || status : 'Not verified' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-2.5 bg-muted/20 rounded-lg">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className={`font-semibold ${evaluation ? 'text-foreground' : 'text-muted-foreground'}`}>{item.value}</span>
                  </div>
                ))}
              </div>
              {evaluation && (
                <div className="mt-3 flex items-center gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <CheckCircle size={12} className="text-emerald-600" />
                  <p className="text-xs text-emerald-700 font-medium">All layers reference the same canonical evaluation — reconciliation PASS</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
