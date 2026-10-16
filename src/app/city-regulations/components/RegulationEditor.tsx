"use client";

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';

import { buttonPrimary, buttonSecondary, inputClass, Panel } from '@/components/ops';

import type { CanonicalStatus, RegulationRecord } from './types';

const STATUS_OPTIONS: CanonicalStatus[] = [
  'ALLOWED',
  'ALLOWED_WITH_REQUIREMENTS',
  'PERMIT_REQUIRED',
  'RESTRICTED',
  'PRIMARY_RESIDENCE_REQUIRED',
  'PROHIBITED',
  'UNKNOWN',
  'REVIEW_REQUIRED',
];

const REVIEW_OPTIONS = ['CURRENT', 'REVIEW_DUE', 'STALE', 'UNKNOWN'];
const CONFIDENCE_OPTIONS = ['HIGH', 'MEDIUM', 'LOW', 'UNVERIFIED'];
const SOURCE_OPTIONS = ['OFFICIAL_MUNICIPAL', 'OFFICIAL_STATE', 'OFFICIAL_COUNTY', 'AI_RESEARCHED', 'OTHER'];

function toInputDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function boolValue(value: boolean | null): 'unknown' | 'true' | 'false' {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'unknown';
}

function parseBool(value: string): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

type Draft = {
  jurisdictionName: string;
  city: string;
  county: string;
  state: string;
  jurisdictionType: string;
  status: CanonicalStatus;
  sourceType: string;
  sourceName: string;
  sourceUrl: string;
  confidence: string;
  reviewStatus: string;
  lastVerifiedAt: string;
  strAllowed: 'unknown' | 'true' | 'false';
  permitRequired: 'unknown' | 'true' | 'false';
  licenseRequired: 'unknown' | 'true' | 'false';
  registrationRequired: 'unknown' | 'true' | 'false';
  primaryResidenceRequired: 'unknown' | 'true' | 'false';
  nightCap: string;
  minimumStay: string;
  occupancyLimit: string;
  summary: string;
  agentSummary: string;
  taxRequirements: string;
  additionalRestrictions: string;
};

function fromRecord(record?: RegulationRecord | null): Draft {
  return {
    jurisdictionName: record?.jurisdictionName ?? '',
    city: record?.city ?? '',
    county: record?.county ?? '',
    state: record?.state ?? '',
    jurisdictionType: record?.jurisdictionType ?? 'CITY',
    status: record?.status ?? 'UNKNOWN',
    sourceType: record?.sourceType ?? 'OFFICIAL_MUNICIPAL',
    sourceName: record?.sourceName ?? '',
    sourceUrl: record?.sourceUrl ?? '',
    confidence: record?.confidence ?? 'MEDIUM',
    reviewStatus: record?.reviewStatus ?? 'CURRENT',
    lastVerifiedAt: toInputDateTime(record?.lastVerifiedAt ?? null),
    strAllowed: boolValue(record?.strAllowed ?? null),
    permitRequired: boolValue(record?.permitRequired ?? null),
    licenseRequired: boolValue(record?.licenseRequired ?? null),
    registrationRequired: boolValue(record?.registrationRequired ?? null),
    primaryResidenceRequired: boolValue(record?.primaryResidenceRequired ?? null),
    nightCap: record?.nightCap?.toString() ?? '',
    minimumStay: record?.minimumStay?.toString() ?? '',
    occupancyLimit: record?.occupancyLimit?.toString() ?? '',
    summary: record?.summary ?? '',
    agentSummary: record?.agentSummary ?? '',
    taxRequirements: record?.taxRequirements ?? '',
    additionalRestrictions: record?.additionalRestrictions ?? '',
  };
}

export default function RegulationEditor({
  record,
  mode,
  onClose,
  onSaved,
}: {
  record?: RegulationRecord | null;
  mode: 'add' | 'edit';
  onClose: () => void;
  onSaved: (message: string, ok?: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => fromRecord(record));
  const [saving, setSaving] = useState(false);
  const title = useMemo(() => mode === 'add' ? 'Add regulation record' : `Edit ${record?.jurisdictionName ?? 'record'}`, [mode, record?.jurisdictionName]);

  useEffect(() => {
    setDraft(fromRecord(record));
  }, [record]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        jurisdictionName: draft.jurisdictionName.trim(),
        city: draft.city.trim() || null,
        county: draft.county.trim() || null,
        state: draft.state.trim().toUpperCase(),
        jurisdictionType: draft.jurisdictionType.trim() || 'CITY',
        status: draft.status,
        sourceType: draft.sourceType,
        sourceName: draft.sourceName.trim() || null,
        sourceUrl: draft.sourceUrl.trim() || null,
        confidence: draft.confidence,
        reviewStatus: draft.reviewStatus,
        lastVerifiedAt: toIso(draft.lastVerifiedAt),
        strAllowed: parseBool(draft.strAllowed),
        permitRequired: parseBool(draft.permitRequired),
        licenseRequired: parseBool(draft.licenseRequired),
        registrationRequired: parseBool(draft.registrationRequired),
        primaryResidenceRequired: parseBool(draft.primaryResidenceRequired),
        nightCap: draft.nightCap ? Number(draft.nightCap) : null,
        minimumStay: draft.minimumStay ? Number(draft.minimumStay) : null,
        occupancyLimit: draft.occupancyLimit ? Number(draft.occupancyLimit) : null,
        summary: draft.summary.trim() || null,
        agentSummary: draft.agentSummary.trim() || null,
        taxRequirements: draft.taxRequirements.trim() || null,
        additionalRestrictions: draft.additionalRestrictions.trim() || null,
      };

      const response = await fetch('/api/regulations', {
        method: mode === 'add' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'add' ? payload : { id: record?.id, ...payload }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Save failed');
      onSaved(mode === 'add' ? 'Regulation added' : 'Regulation updated', true);
    } catch (error) {
      onSaved(error instanceof Error ? error.message : 'Save failed', false);
    } finally {
      setSaving(false);
    }
  }

  const setValue = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Panel
      title={title}
      actions={
        <button type="button" onClick={onClose} className={buttonSecondary}>
          <X size={14} />
          Close
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Jurisdiction name</span>
          <input value={draft.jurisdictionName} onChange={(event) => setValue('jurisdictionName', event.target.value)} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>State</span>
          <input value={draft.state} onChange={(event) => setValue('state', event.target.value.toUpperCase())} maxLength={2} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>City</span>
          <input value={draft.city} onChange={(event) => setValue('city', event.target.value)} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>County</span>
          <input value={draft.county} onChange={(event) => setValue('county', event.target.value)} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Status</span>
          <select value={draft.status} onChange={(event) => setValue('status', event.target.value as CanonicalStatus)} className={inputClass}>
            {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Review status</span>
          <select value={draft.reviewStatus} onChange={(event) => setValue('reviewStatus', event.target.value)} className={inputClass}>
            {REVIEW_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Confidence</span>
          <select value={draft.confidence} onChange={(event) => setValue('confidence', event.target.value)} className={inputClass}>
            {CONFIDENCE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Source type</span>
          <select value={draft.sourceType} onChange={(event) => setValue('sourceType', event.target.value)} className={inputClass}>
            {SOURCE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground lg:col-span-2">
          <span>Source name</span>
          <input value={draft.sourceName} onChange={(event) => setValue('sourceName', event.target.value)} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground lg:col-span-2">
          <span>Source URL</span>
          <input value={draft.sourceUrl} onChange={(event) => setValue('sourceUrl', event.target.value)} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Last verified</span>
          <input type="datetime-local" value={draft.lastVerifiedAt} onChange={(event) => setValue('lastVerifiedAt', event.target.value)} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Jurisdiction type</span>
          <input value={draft.jurisdictionType} onChange={(event) => setValue('jurisdictionType', event.target.value)} className={inputClass} />
        </label>
        {[
          ['strAllowed', 'STR allowed'],
          ['permitRequired', 'Permit required'],
          ['licenseRequired', 'License required'],
          ['registrationRequired', 'Registration required'],
          ['primaryResidenceRequired', 'Primary residence required'],
        ].map(([key, label]) => (
          <label key={key} className="space-y-1 text-sm text-muted-foreground">
            <span>{label}</span>
            <select value={draft[key as keyof Draft] as string} onChange={(event) => setValue(key as keyof Draft, event.target.value as Draft[keyof Draft])} className={inputClass}>
              <option value="unknown">Unknown</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
        ))}
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Night cap</span>
          <input value={draft.nightCap} onChange={(event) => setValue('nightCap', event.target.value)} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Minimum stay</span>
          <input value={draft.minimumStay} onChange={(event) => setValue('minimumStay', event.target.value)} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Occupancy limit</span>
          <input value={draft.occupancyLimit} onChange={(event) => setValue('occupancyLimit', event.target.value)} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground lg:col-span-2">
          <span>Summary</span>
          <textarea value={draft.summary} onChange={(event) => setValue('summary', event.target.value)} rows={4} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground lg:col-span-2">
          <span>Agent summary</span>
          <textarea value={draft.agentSummary} onChange={(event) => setValue('agentSummary', event.target.value)} rows={3} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground lg:col-span-2">
          <span>Tax requirements</span>
          <textarea value={draft.taxRequirements} onChange={(event) => setValue('taxRequirements', event.target.value)} rows={2} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground lg:col-span-2">
          <span>Additional restrictions</span>
          <textarea value={draft.additionalRestrictions} onChange={(event) => setValue('additionalRestrictions', event.target.value)} rows={2} className={inputClass} />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={handleSave} disabled={saving || !draft.jurisdictionName.trim() || !draft.state.trim()} className={buttonPrimary}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : mode === 'add' ? 'Create record' : 'Save changes'}
        </button>
      </div>
    </Panel>
  );
}
