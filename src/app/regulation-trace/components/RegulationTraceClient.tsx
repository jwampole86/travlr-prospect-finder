"use client";

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Database, ExternalLink, Search, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Panel,
  StatusPill,
  buttonPrimary,
  inputClass,
} from '@/components/ops';
import { CANONICAL_STATUS_COLORS, CANONICAL_STATUS_LABELS, formatRegDate } from '@/lib/services/cityRegulationService';

import type { TraceCandidate } from './types';

type TraceShape = {
  lead_id: string;
  address: string | null;
  verified_address: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zip: string | null;
  legacy_regulation_status: string | null;
  evaluation?: {
    evaluation_id: string;
    jurisdiction_name: string | null;
    city_regulation_status: string;
    evaluated_at: string;
    regulation_version: number | null;
    confidence: string | null;
    review_required: boolean;
    evaluation_reason: string | null;
    data_quality_flags: string[] | null;
  } | null;
  canonical_regulation?: {
    regulation_id: string;
    jurisdiction_name: string | null;
    jurisdiction_type: string | null;
    status: string;
    str_allowed: boolean | null;
    permit_required: boolean | null;
    license_required: boolean | null;
    primary_residence_required: boolean | null;
    night_cap: number | null;
    minimum_stay: number | null;
    source_name: string | null;
    source_url: string | null;
    last_verified_at: string | null;
    review_status: string | null;
    regulation_version: number | null;
    summary: string | null;
    agent_summary: string | null;
  } | null;
};

type CanonicalDetail = {
  source_type: string | null;
  permit_name: string | null;
  permit_cost_summary: string | null;
  permit_processing_time: string | null;
  permit_application_url: string | null;
  permit_renewal: string | null;
  permit_details_updated_at: string | null;
  permit_steps: string[] | null;
  safety_requirements: Array<{ item?: string | null; detail?: string | null }> | null;
} | null;

function legacyStatusForCanonical(status: string): string {
  if (status === 'ALLOWED') return 'Allowed';
  if (status === 'PROHIBITED') return 'Prohibited';
  if (status === 'UNKNOWN') return 'Unknown';
  return 'Restricted';
}

function detailText(label: string, value: string | number | null | undefined): React.ReactNode {
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value ?? '—'}</p>
    </div>
  );
}

export default function RegulationTraceClient({ recentCandidates }: { recentCandidates: TraceCandidate[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [leadId, setLeadId] = useState(recentCandidates[0]?.leadId ?? '');
  const [trace, setTrace] = useState<TraceShape | null>(null);
  const [canonicalDetail, setCanonicalDetail] = useState<CanonicalDetail>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPermitDetails(regulationId: string) {
    const { data, error: queryError } = await supabase
      .from('city_regulations')
      .select('source_type, permit_name, permit_cost_summary, permit_processing_time, permit_application_url, permit_renewal, permit_details_updated_at, permit_steps, safety_requirements')
      .eq('id', regulationId)
      .maybeSingle();
    if (queryError) throw new Error(queryError.message);
    return (data ?? null) as CanonicalDetail;
  }

  async function handleTrace(selectedLeadId?: string) {
    const target = (selectedLeadId ?? leadId).trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/regulations/trace?leadId=${encodeURIComponent(target)}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Trace failed');
      const nextTrace = result?.trace as TraceShape;
      setTrace(nextTrace);
      setLeadId(target);
      if (nextTrace?.canonical_regulation?.regulation_id) {
        const details = await loadPermitDetails(nextTrace.canonical_regulation.regulation_id);
        setCanonicalDetail(details);
      } else {
        setCanonicalDetail(null);
      }
    } catch (traceError) {
      const message = traceError instanceof Error ? traceError.message : 'Trace failed';
      setError(message);
      toast.error(message);
      setCanonicalDetail(null);
    } finally {
      setLoading(false);
    }
  }

  const canonicalStatus = trace?.evaluation?.city_regulation_status ?? 'UNKNOWN';
  const expectedLegacy = trace?.evaluation ? legacyStatusForCanonical(trace.evaluation.city_regulation_status) : null;
  const legacyMismatch = trace?.legacy_regulation_status && expectedLegacy && trace.legacy_regulation_status !== expectedLegacy;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader
        icon={Database}
        title="Trace regulation / jurisdiction"
        description="Inspect the live regulation evaluation, canonical source record, and legacy lead field for a specific lead."
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr,0.8fr]">
        <div className="space-y-6">
          <Panel title="Lookup lead">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={leadId} onChange={(event) => setLeadId(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && handleTrace()} placeholder="Enter a lead UUID" className={`${inputClass} pl-9`} />
              </label>
              <button type="button" onClick={() => handleTrace()} disabled={loading || !leadId.trim()} className={buttonPrimary}>
                <Search size={14} />
                {loading ? 'Tracing…' : 'Trace'}
              </button>
            </div>
            {error ? <div className="mt-4"><ErrorBanner message={error} /></div> : null}
          </Panel>

          {trace ? (
            <>
              <Panel title="Lead location inputs">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {detailText('Lead ID', trace.lead_id)}
                  {detailText('Address', trace.address)}
                  {detailText('Verified address', trace.verified_address)}
                  {detailText('City / state', [trace.city, trace.state].filter(Boolean).join(', ') || null)}
                  {detailText('County', trace.county)}
                  {detailText('ZIP', trace.zip)}
                  {detailText('Legacy lead.regulation_status', trace.legacy_regulation_status)}
                </div>
              </Panel>

              <Panel title="Canonical evaluation">
                {trace.evaluation ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CANONICAL_STATUS_COLORS[canonicalStatus as keyof typeof CANONICAL_STATUS_COLORS] || 'border-border bg-muted text-muted-foreground'}`}>
                        {CANONICAL_STATUS_LABELS[canonicalStatus as keyof typeof CANONICAL_STATUS_LABELS] || canonicalStatus}
                      </span>
                      <StatusPill tone={trace.evaluation.review_required ? 'warning' : 'success'}>
                        {trace.evaluation.review_required ? 'Review required' : 'No review flag'}
                      </StatusPill>
                      <StatusPill tone="primary">Confidence {trace.evaluation.confidence || 'Unknown'}</StatusPill>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {detailText('Jurisdiction', trace.evaluation.jurisdiction_name)}
                      {detailText('Evaluated at', formatRegDate(trace.evaluation.evaluated_at))}
                      {detailText('Rule version', trace.evaluation.regulation_version ?? '—')}
                      {detailText('Reason', trace.evaluation.evaluation_reason)}
                    </div>
                    {trace.evaluation.data_quality_flags?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {trace.evaluation.data_quality_flags.map((flag) => <StatusPill key={flag} tone="warning">{flag}</StatusPill>)}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState icon={AlertTriangle} title="No property_regulation_evaluations row" hint="This lead has not been evaluated yet, so no canonical jurisdiction could be traced." />
                )}
              </Panel>

              <Panel title="Canonical source record">
                {trace.canonical_regulation ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{trace.canonical_regulation.jurisdiction_name || 'Unknown jurisdiction'}</p>
                      {canonicalDetail?.source_type ? <StatusPill tone={canonicalDetail.source_type === 'AI_RESEARCHED' ? 'warning' : 'primary'}>{canonicalDetail.source_type.replace(/_/g, ' ')}</StatusPill> : null}
                      {trace.canonical_regulation.review_status ? <StatusPill tone="warning">{trace.canonical_regulation.review_status}</StatusPill> : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {detailText('Source name', trace.canonical_regulation.source_name)}
                      {detailText('Last verified', formatRegDate(trace.canonical_regulation.last_verified_at))}
                      {detailText('Primary residence required', trace.canonical_regulation.primary_residence_required === null ? 'Unknown' : trace.canonical_regulation.primary_residence_required ? 'Yes' : 'No')}
                      {detailText('Permit required', trace.canonical_regulation.permit_required === null ? 'Unknown' : trace.canonical_regulation.permit_required ? 'Yes' : 'No')}
                      {detailText('License required', trace.canonical_regulation.license_required === null ? 'Unknown' : trace.canonical_regulation.license_required ? 'Yes' : 'No')}
                      {detailText('Night cap', trace.canonical_regulation.night_cap ? `${trace.canonical_regulation.night_cap} nights / year` : '—')}
                      {detailText('Minimum stay', trace.canonical_regulation.minimum_stay ? `${trace.canonical_regulation.minimum_stay} nights` : '—')}
                      {detailText('Rule version', trace.canonical_regulation.regulation_version ?? '—')}
                    </div>
                    {trace.canonical_regulation.summary ? <p className="text-sm text-foreground">{trace.canonical_regulation.summary}</p> : null}
                    {trace.canonical_regulation.agent_summary ? <p className="text-sm text-muted-foreground">Agent summary: {trace.canonical_regulation.agent_summary}</p> : null}
                    {trace.canonical_regulation.source_url ? (
                      <a href={trace.canonical_regulation.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                        Open cited source <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState icon={Shield} title="No canonical record matched" hint="The evaluation either did not find a rule or the lead still relies on the legacy regulation field only." />
                )}
              </Panel>

              {canonicalDetail && (canonicalDetail.permit_name || canonicalDetail.permit_cost_summary || canonicalDetail.permit_steps?.length || canonicalDetail.safety_requirements?.length) ? (
                <Panel title="Permit detail research">
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {detailText('Permit name', canonicalDetail.permit_name)}
                      {detailText('Processing time', canonicalDetail.permit_processing_time)}
                      {detailText('Permit detail updated', formatRegDate(canonicalDetail.permit_details_updated_at))}
                      {detailText('Renewal', canonicalDetail.permit_renewal)}
                    </div>
                    {canonicalDetail.permit_cost_summary ? <p className="text-sm text-foreground">{canonicalDetail.permit_cost_summary}</p> : null}
                    {canonicalDetail.permit_application_url ? (
                      <a href={canonicalDetail.permit_application_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                        Open application page <ExternalLink size={14} />
                      </a>
                    ) : null}
                    {canonicalDetail.permit_steps?.length ? (
                      <div>
                        <p className="text-sm font-medium text-foreground">Stored permit steps</p>
                        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                          {canonicalDetail.permit_steps.map((step) => <li key={step}>{step}</li>)}
                        </ol>
                      </div>
                    ) : null}
                    {canonicalDetail.safety_requirements?.length ? (
                      <div>
                        <p className="text-sm font-medium text-foreground">Stored safety requirements</p>
                        <div className="mt-2 space-y-2">
                          {canonicalDetail.safety_requirements.flatMap((item) => item.item && item.detail ? [
                            <div key={`${item.item}-${item.detail}`} className="rounded-2xl border border-border bg-muted/20 p-3 text-sm">
                              <p className="font-medium text-foreground">{item.item}</p>
                              <p className="mt-1 text-muted-foreground">{item.detail}</p>
                            </div>,
                          ] : [])}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Panel>
              ) : null}

              <Panel title="Lineage check">
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Canonical evaluation status: <span className="font-medium text-foreground">{trace.evaluation?.city_regulation_status || 'Not evaluated'}</span></p>
                  <p>Legacy lead.regulation_status: <span className="font-medium text-foreground">{trace.legacy_regulation_status || 'Not set'}</span></p>
                  {expectedLegacy ? <p>Expected legacy bucket from the canonical status: <span className="font-medium text-foreground">{expectedLegacy}</span></p> : null}
                  {legacyMismatch ? (
                    <div className="rounded-2xl border border-warning/20 bg-warning/10 p-3 text-warning">
                      The legacy lead.regulation_status bucket does not match the current canonical evaluation. This page is showing both values instead of claiming they already reconcile.
                    </div>
                  ) : null}
                </div>
              </Panel>
            </>
          ) : (
            <Panel>
              <EmptyState icon={Database} title="Choose a lead to trace" hint="Enter a UUID or use one of the recent evaluated leads on the right." />
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Recent evaluated leads">
            <div className="space-y-3">
              {recentCandidates.map((candidate) => (
                <button
                  key={candidate.leadId}
                  type="button"
                  onClick={() => handleTrace(candidate.leadId)}
                  className="w-full rounded-2xl border border-border bg-muted/20 p-4 text-left transition hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{candidate.address || candidate.leadId}</p>
                    <StatusPill tone={candidate.reviewRequired ? 'warning' : 'success'}>{candidate.canonicalStatus}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{[candidate.city, candidate.state].filter(Boolean).join(', ') || 'No city/state stored'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Evaluated {formatRegDate(candidate.evaluatedAt)} · Confidence {candidate.confidence || 'Unknown'}</p>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
