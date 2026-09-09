'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, DollarSign, TrendingUp, Star, AlertTriangle, CheckCircle, XCircle, BarChart2, Building2, Info } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface EnrichmentSignals {
  estimatedAnnualRevenue?: number;
  estimatedNetMonthly?: number;
  luxuryClassification?: string;
  luxuryClassificationSource?: string;
  regulationComplianceStatus?: 'compliant' | 'restricted' | 'banned' | 'unknown';
  regulationState?: string;
  regulationNotes?: string;
  competitorOverlap?: string[];
  ownerProfileConfidenceScore?: number;
  ownerVerified?: boolean;
  addressVerified?: boolean;
  phoneVerified?: boolean;
  prospectScore?: number;
  enrichmentStatus?: string;
  propertyType?: string;
  bedrooms?: number;
  estimatedOccupancyRate?: number;
}

interface EnrichmentSidebarProps {
  signals: EnrichmentSignals;
  contactName?: string;
  address?: string;
}

// ─── Confidence Score Ring ────────────────────────────────────────────────────

function ConfidenceRing({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="56" height="56">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span className="text-sm font-bold text-gray-900">{pct}</span>
    </div>
  );
}

// ─── Regulation Status Badge ──────────────────────────────────────────────────

function RegulationBadge({ status, state }: { status?: string; state?: string }) {
  const config = {
    compliant: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: CheckCircle, label: 'Compliant' },
    restricted: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: AlertTriangle, label: 'Restricted' },
    banned: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: XCircle, label: 'Banned' },
    unknown: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', icon: Info, label: 'Unknown' },
  }[status || 'unknown'] || { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-600', icon: Info, label: 'Unknown' };

  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${config.bg}`}>
      <Icon className={`w-3.5 h-3.5 ${config.text} flex-shrink-0`} />
      <div>
        <p className={`text-xs font-semibold ${config.text}`}>{config.label}</p>
        {state && <p className="text-[10px] text-gray-400">{state}</p>}
      </div>
    </div>
  );
}

// ─── Signal Row ───────────────────────────────────────────────────────────────

function SignalRow({ label, value, sub, icon: Icon, iconColor }: {
  label: string;
  value: string | React.ReactNode;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
}) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0">
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${iconColor}`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <div className="text-xs font-semibold text-gray-800 mt-0.5">{value}</div>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EnrichmentSidebar({ signals, contactName, address }: EnrichmentSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const formatRevenue = (n?: number) => n ? `$${n.toLocaleString()}` : 'N/A';
  const formatAnnual = (monthly?: number, annual?: number) => {
    if (annual) return `$${annual.toLocaleString()}/yr`;
    if (monthly) return `$${(monthly * 12).toLocaleString()}/yr`;
    return 'N/A';
  };

  const verifiedCount = [signals.ownerVerified, signals.addressVerified, signals.phoneVerified].filter(Boolean).length;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 py-3 px-1.5 bg-white border-l border-gray-100 h-full">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          title="Expand enrichment sidebar"
        >
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        </button>
        <div className="flex flex-col items-center gap-2 mt-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Revenue" />
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400" title="Luxury" />
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" title="Regulation" />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Competitors" />
        </div>
        {signals.ownerProfileConfidenceScore != null && (
          <div className="mt-auto mb-2">
            <div className="text-[10px] font-bold text-gray-500 text-center mb-1">
              {signals.ownerProfileConfidenceScore}
            </div>
            <div className="w-1 h-8 bg-gray-100 rounded-full overflow-hidden mx-auto">
              <div
                className="w-full rounded-full bg-emerald-500 transition-all"
                style={{ height: `${signals.ownerProfileConfidenceScore}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white border-l border-gray-100 h-full overflow-hidden" style={{ width: 220 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-bold text-gray-700">Enrichment</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded hover:bg-gray-200 transition-colors"
          title="Collapse sidebar"
        >
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      {/* Owner confidence score */}
      {signals.ownerProfileConfidenceScore != null && (
        <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-50">
          <ConfidenceRing score={signals.ownerProfileConfidenceScore} />
          <div>
            <p className="text-xs font-bold text-gray-800">Owner Profile</p>
            <p className="text-[10px] text-gray-400">Confidence Score</p>
            <div className="flex items-center gap-1 mt-1">
              {signals.ownerVerified && <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Owner ✓</span>}
              {signals.addressVerified && <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Addr ✓</span>}
              {signals.phoneVerified && <span className="text-[9px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">Phone ✓</span>}
            </div>
          </div>
        </div>
      )}

      {/* Signals */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {/* Revenue */}
        <SignalRow
          label="Est. Annual Revenue"
          value={formatAnnual(signals.estimatedNetMonthly, signals.estimatedAnnualRevenue)}
          sub={signals.estimatedNetMonthly ? `${formatRevenue(signals.estimatedNetMonthly)}/mo net` : undefined}
          icon={DollarSign}
          iconColor="bg-emerald-500"
        />

        {/* Luxury Classification */}
        {signals.luxuryClassification && (
          <SignalRow
            label="Luxury Classification"
            value={signals.luxuryClassification}
            sub={signals.luxuryClassificationSource ? `Source: ${signals.luxuryClassificationSource}` : undefined}
            icon={Star}
            iconColor="bg-purple-500"
          />
        )}

        {/* Regulation */}
        <div className="py-2 border-b border-gray-50">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Regulation Status</p>
          <RegulationBadge status={signals.regulationComplianceStatus} state={signals.regulationState} />
          {signals.regulationNotes && (
            <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">{signals.regulationNotes}</p>
          )}
        </div>

        {/* Competitor Overlap */}
        {signals.competitorOverlap && signals.competitorOverlap.length > 0 && (
          <div className="py-2 border-b border-gray-50">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Competitor Overlap</p>
            <div className="flex flex-wrap gap-1">
              {signals.competitorOverlap.map((comp, i) => (
                <span key={i} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                  {comp}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Prospect Score */}
        {signals.prospectScore != null && (
          <SignalRow
            label="Prospect Score"
            value={
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-gray-900">{signals.prospectScore}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[60px]">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.min(100, signals.prospectScore)}%` }}
                  />
                </div>
              </div>
            }
            sub={signals.enrichmentStatus ? `Status: ${signals.enrichmentStatus}` : undefined}
            icon={TrendingUp}
            iconColor="bg-blue-500"
          />
        )}

        {/* Property details */}
        {(signals.propertyType || signals.bedrooms) && (
          <SignalRow
            label="Property"
            value={[signals.propertyType, signals.bedrooms ? `${signals.bedrooms}BR` : null].filter(Boolean).join(' · ')}
            sub={signals.estimatedOccupancyRate ? `~${signals.estimatedOccupancyRate}% occupancy` : undefined}
            icon={Building2}
            iconColor="bg-gray-600"
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
        <p className="text-[10px] text-gray-400 text-center">
          {verifiedCount}/3 signals verified
        </p>
      </div>
    </div>
  );
}
