'use client';

import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Users, ShieldAlert } from 'lucide-react';

export interface PreSendChecklistProps {
  /** Whether the lead has a valid address */
  hasAddress: boolean;
  /** Whether the contact name is resolved */
  hasContactName: boolean;
  /** Variable statuses from template resolution */
  variableStatuses: Array<{
    token: string;
    label: string;
    resolved: boolean;
    mode: 'auto' | 'manual' | 'missing';
  }>;
  /** Enrichment stage of the lead (0 = none, 1, 2, 3) */
  enrichmentStage: 0 | 1 | 2 | 3;
  /** Number of leads selected for bulk send (undefined = single send) */
  bulkCount?: number;
  /**
   * Contact confidence score (0–100) from enrichment.
   * When defined and below 80, the contact is considered "Unverified" per the
   * enrichment spec — the checklist surfaces a warning requiring explicit agent
   * acknowledgment before proceeding. This is an overridable warning, not a
   * hard block, but the agent must consciously opt in rather than silently
   * passing an unverified number through to outreach.
   */
  contactConfidence?: number;
  /**
   * Callback fired when the agent acknowledges the unverified-contact warning.
   * Parent can use this to track whether the override was explicitly accepted.
   */
  onUnverifiedAcknowledged?: (acknowledged: boolean) => void;
}

function CheckRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      {status === 'pass' && <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />}
      {status === 'fail' && <XCircle size={14} className="text-red-500 mt-0.5 shrink-0" />}
      {status === 'warn' && <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium leading-snug ${
          status === 'pass' ? 'text-foreground' :
          status === 'fail' ? 'text-red-600' : 'text-amber-700'
        }`}>{label}</p>
        {detail && <p className="text-[10px] text-muted-foreground mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}

const ENRICHMENT_LABELS: Record<number, { label: string; status: 'pass' | 'warn' | 'fail' }> = {
  0: { label: 'Not enriched — contact data may be incomplete', status: 'fail' },
  1: { label: 'Stage 1 complete — basic data only', status: 'warn' },
  2: { label: 'Stage 2 complete — owner lookup done', status: 'pass' },
  3: { label: 'Stage 3 complete — fully verified', status: 'pass' },
};

/** Confidence threshold below which a contact is considered "Unverified" */
const VERIFIED_CONFIDENCE_THRESHOLD = 80;

export default function PreSendChecklist({
  hasAddress,
  hasContactName,
  variableStatuses,
  enrichmentStage,
  bulkCount,
  contactConfidence,
  onUnverifiedAcknowledged,
}: PreSendChecklistProps) {
  const [unverifiedAcknowledged, setUnverifiedAcknowledged] = useState(false);

  const unresolvedVars = variableStatuses.filter(v => !v.resolved);
  const resolvedVars = variableStatuses.filter(v => v.resolved);
  const missingVars = variableStatuses.filter(v => v.mode === 'missing');
  const manualVars = variableStatuses.filter(v => v.mode === 'manual' && !v.resolved);

  const varStatus: 'pass' | 'warn' | 'fail' =
    missingVars.length > 0 ? 'fail' :
    manualVars.length > 0 ? 'warn' : 'pass';

  const varDetail =
    missingVars.length > 0
      ? `${missingVars.length} token${missingVars.length > 1 ? 's' : ''} missing: ${missingVars.map(v => v.label).join(', ')}`
      : manualVars.length > 0
      ? `${manualVars.length} manual field${manualVars.length > 1 ? 's' : ''} empty: ${manualVars.map(v => v.label).join(', ')}`
      : `${resolvedVars.length} variable${resolvedVars.length !== 1 ? 's' : ''} resolved`;

  const enrichInfo = ENRICHMENT_LABELS[enrichmentStage] || ENRICHMENT_LABELS[0];
  const isBulkWarning = bulkCount !== undefined && bulkCount > 100;

  // Determine whether the contact is unverified (confidence defined and below threshold)
  const isUnverified =
    contactConfidence !== undefined && contactConfidence < VERIFIED_CONFIDENCE_THRESHOLD;
  const confidenceDisplay =
    contactConfidence !== undefined ? `${contactConfidence}%` : 'unknown';

  // The checklist is fully clear only when all checks pass AND any unverified
  // contact warning has been explicitly acknowledged by the agent.
  const allPass =
    hasAddress &&
    hasContactName &&
    varStatus === 'pass' &&
    enrichmentStage >= 1 &&
    !isBulkWarning &&
    (!isUnverified || unverifiedAcknowledged);

  function handleAcknowledgeChange(checked: boolean) {
    setUnverifiedAcknowledged(checked);
    onUnverifiedAcknowledged?.(checked);
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-2.5 border-b border-border flex items-center gap-2 ${
        allPass ? 'bg-emerald-500/5' : 'bg-amber-500/5'
      }`}>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
          allPass ? 'bg-emerald-500/15' : 'bg-amber-500/15'
        }`}>
          {allPass
            ? <CheckCircle2 size={11} className="text-emerald-600" />
            : <AlertTriangle size={11} className="text-amber-600" />
          }
        </div>
        <p className={`text-xs font-semibold ${allPass ? 'text-emerald-700' : 'text-amber-700'}`}>
          Pre-Send Checklist
        </p>
        {!allPass && (
          <span className="ml-auto text-[10px] text-amber-600 font-medium">Review before sending</span>
        )}
      </div>

      {/* Checklist rows */}
      <div className="px-4 divide-y divide-border/60">
        <CheckRow
          label="Lead address present"
          status={hasAddress ? 'pass' : 'fail'}
          detail={hasAddress ? undefined : 'Address is required for outreach context'}
        />
        <CheckRow
          label="Contact name resolved"
          status={hasContactName ? 'pass' : 'warn'}
          detail={hasContactName ? undefined : 'Will default to "there" — consider enriching first'}
        />
        <CheckRow
          label={`Template variables — ${varStatus === 'pass' ? 'all green' : varStatus === 'warn' ? 'some manual fields empty' : 'tokens missing'}`}
          status={varStatus}
          detail={varDetail}
        />
        <CheckRow
          label={`Enrichment stage ${enrichmentStage} — ${enrichInfo.label}`}
          status={enrichInfo.status}
          detail={enrichmentStage < 2 ? 'Run enrichment to improve contact accuracy' : undefined}
        />
      </div>

      {/* Unverified contact warning — requires explicit agent acknowledgment */}
      {isUnverified && (
        <div className="mx-4 mb-3 mt-1 rounded-lg border border-orange-400/40 bg-orange-500/8 overflow-hidden">
          <div className="flex items-start gap-2.5 p-3">
            <ShieldAlert size={14} className="text-orange-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-orange-700">
                Unverified Contact — Confidence {confidenceDisplay}
              </p>
              <p className="text-[10px] text-orange-600 mt-0.5 leading-relaxed">
                This contact&apos;s confidence score is below the 80% verification threshold. Per the enrichment
                spec, unverified contacts should not be auto-included in outreach. You can override this
                warning, but you must explicitly acknowledge it below.
              </p>
            </div>
          </div>
          {/* Acknowledgment checkbox — agent must opt in, not just ignore the warning */}
          <label className={`flex items-start gap-2.5 px-3 pb-3 cursor-pointer group ${
            unverifiedAcknowledged ? 'opacity-100' : 'opacity-90'
          }`}>
            <input
              type="checkbox"
              checked={unverifiedAcknowledged}
              onChange={e => handleAcknowledgeChange(e.target.checked)}
              className="mt-0.5 accent-orange-600 shrink-0 cursor-pointer"
            />
            <span className={`text-[10px] leading-relaxed font-medium ${
              unverifiedAcknowledged ? 'text-orange-700' : 'text-orange-500'
            }`}>
              I acknowledge this contact is unverified (confidence {confidenceDisplay} &lt; 80%) and accept
              responsibility for including them in this outreach.
            </span>
          </label>
        </div>
      )}

      {/* Bulk send warning */}
      {isBulkWarning && (
        <div className="mx-4 mb-3 mt-1 flex items-start gap-2 p-3 bg-amber-500/8 border border-amber-500/25 rounded-lg">
          <Users size={13} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-700">Bulk send: {bulkCount?.toLocaleString()} leads selected</p>
            <p className="text-[10px] text-amber-600 mt-0.5">
              Sending to more than 100 leads at once. Confirm your sending domain is warmed up and daily limits won&apos;t be exceeded.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
