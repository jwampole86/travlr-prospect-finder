'use client';

import React, { useEffect, useState } from 'react';
import { Shield, AlertTriangle, XCircle, Clock, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cityRegulationService, CANONICAL_STATUS_LABELS, CANONICAL_STATUS_COLORS } from '@/lib/services/cityRegulationService';
import type { TeleprompterRegulationContext } from '@/lib/services/cityRegulationService';

interface TeleprompterRegulationPanelProps {
  leadId: string | undefined;
  city?: string;
  state?: string;
}

export default function TeleprompterRegulationPanel({ leadId, city, state }: TeleprompterRegulationPanelProps) {
  const [ctx, setCtx] = useState<TeleprompterRegulationContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    cityRegulationService.getTeleprompterContext(leadId).then(c => {
      setCtx(c);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [leadId]);

  if (!leadId) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">City STR Rules</span>
        </div>
        <p className="text-xs text-gray-400">No property selected.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
        <span className="text-xs text-gray-400">Loading regulation context…</span>
      </div>
    );
  }

  if (!ctx) return null;

  const statusColors: Record<string, string> = {
    ALLOWED: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    ALLOWED_WITH_REQUIREMENTS: 'bg-blue-50 border-blue-200 text-blue-700',
    PERMIT_REQUIRED: 'bg-amber-50 border-amber-200 text-amber-700',
    RESTRICTED: 'bg-orange-50 border-orange-200 text-orange-700',
    PRIMARY_RESIDENCE_REQUIRED: 'bg-purple-50 border-purple-200 text-purple-700',
    PROHIBITED: 'bg-red-50 border-red-200 text-red-700',
    UNKNOWN: 'bg-gray-50 border-gray-200 text-gray-600',
    REVIEW_REQUIRED: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  };

  const colorClass = statusColors[ctx.cityRegulationStatus] || statusColors.UNKNOWN;

  return (
    <div className="space-y-2">
      {/* Prohibited alert — shown prominently */}
      {ctx.isProhibited && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200">
          <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-700 uppercase tracking-wide">PROHIBITED / HIGH RESTRICTION</p>
            <p className="text-xs text-red-600 mt-0.5">Review before discussing management potential.</p>
          </div>
        </div>
      )}

      {/* Stale warning */}
      {ctx.isStale && !ctx.isProhibited && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-yellow-50 border border-yellow-200">
          <Clock className="w-3.5 h-3.5 text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700">Local STR rules are due for review. Verify current requirements before providing regulatory guidance.</p>
        </div>
      )}

      {/* Restriction alert */}
      {ctx.isRestricted && !ctx.isProhibited && ctx.alertMessage && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-orange-50 border border-orange-200">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-700">⚠ This jurisdiction has significant STR restrictions. Review before discussing management potential.</p>
        </div>
      )}

      {/* Main panel */}
      <div className={`border rounded-xl overflow-hidden ${colorClass}`}>
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-0.5">City STR Rules</p>
                <p className="text-xs font-bold truncate">{ctx.jurisdictionName}</p>
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border mt-1 ${CANONICAL_STATUS_COLORS[ctx.cityRegulationStatus]}`}>
                  {CANONICAL_STATUS_LABELS[ctx.cityRegulationStatus]}
                </div>
              </div>
            </div>
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1 rounded-lg hover:bg-black/5 transition-colors shrink-0"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Key rules — always visible (only non-null) */}
          {ctx.keyRules.length > 0 && (
            <div className="mt-2.5 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">Key Local Rules</p>
              {ctx.keyRules.slice(0, 4).map((rule, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-current mt-1.5 shrink-0 opacity-60" />
                  <span className="text-xs">{rule}</span>
                </div>
              ))}
            </div>
          )}

          {/* Unknown/Review message */}
          {(ctx.cityRegulationStatus === 'UNKNOWN' || ctx.cityRegulationStatus === 'REVIEW_REQUIRED') && (
            <p className="mt-2 text-xs opacity-80">Local STR rules have not been fully verified for this property.</p>
          )}

          {/* Last verified */}
          <p className="mt-2 text-[10px] opacity-60">Last Verified: {ctx.lastVerified}</p>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="border-t border-current/10 p-3 space-y-2 bg-white/50">
            {/* Agent summary */}
            {ctx.agentSummary && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Agent Context</p>
                <p className="text-xs text-gray-700 leading-relaxed italic">"{ctx.agentSummary}"</p>
              </div>
            )}

            {/* Structured fields */}
            <div className="space-y-1">
              {ctx.permitRequired !== 'Not verified' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Permit</span>
                  <span className={`text-xs font-semibold ${ctx.permitRequired === 'Required' ? 'text-orange-600' : 'text-emerald-600'}`}>{ctx.permitRequired}</span>
                </div>
              )}
              {ctx.primaryResidenceRequired !== 'Not verified' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Primary Residence</span>
                  <span className={`text-xs font-semibold ${ctx.primaryResidenceRequired === 'Required' ? 'text-orange-600' : 'text-emerald-600'}`}>{ctx.primaryResidenceRequired}</span>
                </div>
              )}
              {ctx.nightCap !== 'None identified' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Night Cap</span>
                  <span className="text-xs font-semibold text-gray-700">{ctx.nightCap}</span>
                </div>
              )}
              {ctx.minimumStay !== 'None identified' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Min Stay</span>
                  <span className="text-xs font-semibold text-gray-700">{ctx.minimumStay}</span>
                </div>
              )}
            </div>

            {/* Legal disclaimer */}
            <p className="text-[10px] text-gray-400 leading-snug border-t border-gray-200 pt-2">
              Regulatory information is provided for property context and may change. Do not present it as legal advice.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
