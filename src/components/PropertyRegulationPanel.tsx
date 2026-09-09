'use client';

import React, { useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, HelpCircle, Clock, ExternalLink, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cityRegulationService, CANONICAL_STATUS_LABELS, CANONICAL_STATUS_COLORS, getRegulationFreshnessStatus, formatRegDate } from '@/lib/services/cityRegulationService';
import type { PropertyRegulationEvaluation, CanonicalRegStatus } from '@/lib/services/cityRegulationService';

interface PropertyRegulationPanelProps {
  leadId: string;
  city?: string;
  state?: string;
  isAdmin?: boolean;
}

function StatusIcon({ status }: { status: CanonicalRegStatus }) {
  const size = 14;
  if (status === 'ALLOWED') return <CheckCircle size={size} className="text-emerald-600" />;
  if (status === 'ALLOWED_WITH_REQUIREMENTS') return <CheckCircle size={size} className="text-blue-600" />;
  if (status === 'PERMIT_REQUIRED') return <AlertTriangle size={size} className="text-amber-600" />;
  if (status === 'RESTRICTED') return <AlertTriangle size={size} className="text-orange-600" />;
  if (status === 'PRIMARY_RESIDENCE_REQUIRED') return <AlertTriangle size={size} className="text-purple-600" />;
  if (status === 'PROHIBITED') return <XCircle size={size} className="text-red-600" />;
  if (status === 'REVIEW_REQUIRED') return <Clock size={size} className="text-yellow-600" />;
  return <HelpCircle size={size} className="text-muted-foreground" />;
}

function BoolField({ label, value }: { label: string; value: boolean | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold ${value ? 'text-orange-600' : 'text-emerald-600'}`}>
        {value ? 'Required' : 'Not Required'}
      </span>
    </div>
  );
}

function TextField({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground text-right max-w-[60%]">{value}</span>
    </div>
  );
}

export default function PropertyRegulationPanel({ leadId, city, state, isAdmin = false }: PropertyRegulationPanelProps) {
  const [evaluation, setEvaluation] = useState<PropertyRegulationEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    setLoading(true);
    const ev = await cityRegulationService.getEvaluationForLead(leadId);
    setEvaluation(ev);
    setLoading(false);
  };

  const refresh = async () => {
    if (!city || !state) return;
    setRefreshing(true);
    try {
      const ev = await cityRegulationService.evaluateLead(leadId, city, state);
      setEvaluation(ev);
    } catch { /* silent */ }
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [leadId]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading regulation data…</span>
      </div>
    );
  }

  const cr = evaluation?.cityRegulation;
  const status = evaluation?.cityRegulationStatus || 'UNKNOWN';
  const freshness = getRegulationFreshnessStatus(evaluation?.sourceLastVerifiedAt || null);
  const isStale = freshness === 'STALE' || freshness === 'REVIEW_DUE';
  const isProhibited = status === 'PROHIBITED';
  const isUnknown = status === 'UNKNOWN' || status === 'REVIEW_REQUIRED';

  return (
    <div className="space-y-3">
      {/* Prohibited alert */}
      {isProhibited && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
          <XCircle size={14} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-700 uppercase tracking-wide">CITY STR STATUS: PROHIBITED / HIGH RESTRICTION</p>
            <p className="text-xs text-red-600 mt-0.5">This jurisdiction has prohibited short-term rentals. Review before discussing management potential.</p>
          </div>
        </div>
      )}

      {/* Stale warning */}
      {isStale && !isProhibited && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
          <Clock size={14} className="text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700 font-medium">REGULATION REVIEW DUE — Verify current requirements before providing regulatory guidance.</p>
        </div>
      )}

      {/* Main regulation card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Summary header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Shield size={14} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">CITY STR STATUS</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusIcon status={status} />
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${CANONICAL_STATUS_COLORS[status]}`}>
                    {CANONICAL_STATUS_LABELS[status]}
                  </span>
                </div>
                {evaluation?.jurisdictionName && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {cr?.jurisdictionType && cr.jurisdictionType !== 'CITY' ? `${cr.jurisdictionType}: ` : ''}
                    {evaluation.jurisdictionName}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {(city && state) && (
                <button
                  onClick={refresh}
                  disabled={refreshing}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  title="Re-evaluate regulation"
                >
                  {refreshing ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : <RefreshCw size={12} className="text-muted-foreground" />}
                </button>
              )}
              <button
                onClick={() => setExpanded(v => !v)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                title={expanded ? 'Collapse' : 'Expand details'}
              >
                {expanded ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
              </button>
            </div>
          </div>

          {/* Quick summary row */}
          {!isUnknown && cr && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Permit</p>
                <p className={`text-xs font-bold ${cr.permitRequired ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {cr.permitRequired === true ? 'Required' : cr.permitRequired === false ? 'Not Required' : '—'}
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Primary Res.</p>
                <p className={`text-xs font-bold ${cr.primaryResidenceRequired ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {cr.primaryResidenceRequired === true ? 'Required' : cr.primaryResidenceRequired === false ? 'Not Required' : '—'}
                </p>
              </div>
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Night Cap</p>
                <p className="text-xs font-bold text-foreground">
                  {cr.nightCap ? `${cr.nightCap}/yr` : 'None'}
                </p>
              </div>
            </div>
          )}

          {isUnknown && (
            <div className="mt-3 p-2.5 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">Local STR rules have not been fully verified for this property.</p>
            </div>
          )}

          {/* Last verified */}
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] text-muted-foreground">
              Last Verified: {formatRegDate(evaluation?.sourceLastVerifiedAt || null)}
            </span>
            {cr?.reviewStatus && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                cr.reviewStatus === 'CURRENT' ? 'bg-emerald-500/10 text-emerald-600' :
                cr.reviewStatus === 'STALE'? 'bg-red-500/10 text-red-600' : 'bg-yellow-500/10 text-yellow-600'
              }`}>
                {cr.reviewStatus}
              </span>
            )}
          </div>
        </div>

        {/* Expanded details */}
        {expanded && cr && (
          <div className="p-4 space-y-4">
            {/* Summary */}
            {cr.summary && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Summary</p>
                <p className="text-xs text-foreground leading-relaxed">{cr.summary}</p>
              </div>
            )}

            {/* Structured rules */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Regulatory Requirements</p>
              <div className="bg-muted/20 rounded-lg px-3 py-1">
                <BoolField label="Permit Required" value={cr.permitRequired} />
                <BoolField label="License Required" value={cr.licenseRequired} />
                <BoolField label="Registration Required" value={cr.registrationRequired} />
                <BoolField label="Primary Residence Required" value={cr.primaryResidenceRequired} />
                <BoolField label="Owner Occupancy Required" value={cr.ownerOccupancyRequired} />
                <BoolField label="Host Presence Required" value={cr.hostPresenceRequired} />
                <BoolField label="Local Contact Required" value={cr.localContactRequired} />
                <BoolField label="Inspection Required" value={cr.inspectionRequired} />
                <TextField label="Night Cap" value={cr.nightCap ? `${cr.nightCap} nights/year` : null} />
                <TextField label="Minimum Stay" value={cr.minimumStay ? `${cr.minimumStay} nights` : null} />
                <TextField label="Maximum Stay" value={cr.maximumStay ? `${cr.maximumStay} nights` : null} />
                <TextField label="Occupancy Limit" value={cr.occupancyLimit ? `${cr.occupancyLimit} guests` : null} />
                <TextField label="Zoning Restrictions" value={cr.zoningRestrictions} />
                <TextField label="Parking Requirements" value={cr.parkingRequirements} />
                <TextField label="Tax Requirements" value={cr.taxRequirements} />
                <TextField label="Insurance Requirements" value={cr.insuranceRequirements} />
                <TextField label="HOA Consideration" value={cr.hoaConsideration} />
                <TextField label="Additional Restrictions" value={cr.additionalRestrictions} />
              </div>
            </div>

            {/* Source */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Regulation Source</p>
              <div className="bg-muted/20 rounded-lg px-3 py-2 space-y-1.5">
                {cr.sourceName && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Source</span>
                    <span className="text-xs font-medium text-foreground">{cr.sourceName}</span>
                  </div>
                )}
                {cr.sourceType && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Source Type</span>
                    <span className="text-xs font-medium text-foreground">{cr.sourceType.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {cr.effectiveDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Effective Date</span>
                    <span className="text-xs font-medium text-foreground">{formatRegDate(cr.effectiveDate)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Last Verified</span>
                  <span className="text-xs font-medium text-foreground">{formatRegDate(cr.lastVerifiedAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Confidence</span>
                  <span className={`text-xs font-semibold ${cr.confidence === 'HIGH' ? 'text-emerald-600' : cr.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-red-600'}`}>
                    {cr.confidence}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Regulation Version</span>
                  <span className="text-xs font-medium text-foreground">v{cr.regulationVersion}</span>
                </div>
                {cr.sourceUrl && (
                  <a
                    href={cr.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
                  >
                    <ExternalLink size={10} />
                    View Official Source
                  </a>
                )}
              </div>
            </div>

            {/* Evaluation metadata */}
            {isAdmin && evaluation && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Evaluation Metadata</p>
                <div className="bg-muted/20 rounded-lg px-3 py-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Evaluated At</span>
                    <span className="text-xs text-foreground">{formatRegDate(evaluation.evaluatedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Evaluation Reason</span>
                    <span className="text-xs text-foreground">{evaluation.evaluationReason || '—'}</span>
                  </div>
                  {evaluation.dataQualityFlags && evaluation.dataQualityFlags.length > 0 && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">Quality Flags</span>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {evaluation.dataQualityFlags.map(flag => (
                          <span key={flag} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 font-medium">{flag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legal disclaimer */}
        <div className="px-4 py-2.5 bg-muted/20 border-t border-border">
          <p className="text-[10px] text-muted-foreground leading-snug">
            Regulatory information is provided for property context and may change. Do not present it as legal advice. Verify current requirements when necessary.
          </p>
        </div>
      </div>
    </div>
  );
}
