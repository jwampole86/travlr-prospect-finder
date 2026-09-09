'use client';

import React, { useState, memo, useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import type { Lead, LeadStage } from '@/data/mockLeads';
import { stageOrder } from '@/data/mockLeads';
import RegulationBadge from '@/components/ui/RegulationBadge';
import StageBadge from '@/components/ui/StageBadge';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import { ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw, BarChart2, Trash2, ExternalLink, Info, MapPin, Calendar, AlertTriangle, Clock, CheckCircle2, Circle, MessageSquare } from 'lucide-react';
import { getAddressDisplayValue, getPropertyListingUrl } from '@/lib/addressUtils';
import ConfidenceBandBadge, { getConfidenceBand } from '@/components/ui/ConfidenceBandBadge';


interface LeadTableProps {
  leads: Lead[];
  sortKey: keyof Lead;
  sortDir: 'asc' | 'desc';
  onSort: (key: keyof Lead) => void;
  selectedIds: Set<string>;
  onSelectAll: (checked: boolean) => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onStageChange: (id: string, stage: LeadStage) => void;
  onDelete: (id: string) => void;
  onOpenEstimator: (lead: Lead) => void;
  onRefresh: (id: string) => void;
  onShowRegulation: (city: string) => void;
  onOpenDetail: (lead: Lead) => void;
  canActOnLead?: (lead: Lead) => boolean;
  assignmentMap?: Record<string, string>;
  enrichmentMap?: Record<string, EnrichmentStatus>;
  onSendSMS?: (lead: Lead) => void;
}

export interface EnrichmentStatus {
  stage1_completed_at?: string | null;
  stage2_completed_at?: string | null;
  stage3_completed_at?: string | null;
  last_enriched_at?: string | null;
  stage1_provider?: string | null;
  stage2_provider?: string | null;
  stage3_provider?: string | null;
  enrichment_status?: string | null;
  // confidence tags from enriched contacts
  email_confidence?: number | null;
  phone_confidence?: number | null;
}

function SortIcon({ col, sortKey, sortDir }: { col: keyof Lead; sortKey: keyof Lead; sortDir: 'asc' | 'desc' }) {
  if (col !== sortKey) return <ChevronsUpDown size={11} className="opacity-30" />;
  return sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
}

function formatCurrency(n: number) {
  return '$' + n.toLocaleString('en-US');
}

// ─── Enrichment Status Cell ───────────────────────────────────────────────────
function EnrichmentStatusCell({ status }: { status?: EnrichmentStatus }) {
  if (!status) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <Circle size={8} className="text-muted-foreground/40" />
          <span className="text-[10px] text-muted-foreground">Not enriched</span>
        </div>
      </div>
    );
  }

  const stages = [
    { key: 'stage1', label: 'Owner', done: !!status.stage1_completed_at, provider: status.stage1_provider },
    { key: 'stage2', label: 'Contact', done: !!status.stage2_completed_at, provider: status.stage2_provider },
    { key: 'stage3', label: 'Skip-Trace', done: !!status.stage3_completed_at, provider: status.stage3_provider },
  ];

  const lastEnriched = status.last_enriched_at
    ? new Date(status.last_enriched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const emailConf = status.email_confidence;
  const phoneConf = status.phone_confidence;

  return (
    <div className="flex flex-col gap-1 min-w-[130px]">
      {/* Stage pills */}
      <div className="flex items-center gap-0.5 flex-wrap">
        {stages.map(s => (
          <span
            key={s.key}
            title={s.done ? `${s.label} enriched via ${s.provider || 'unknown'}` : `${s.label} not enriched`}
            className={`inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded border ${
              s.done
                ? 'bg-success/10 text-success border-success/20' :'bg-muted/50 text-muted-foreground border-border'
            }`}
          >
            {s.done
              ? <CheckCircle2 size={7} />
              : <Circle size={7} />
            }
            {s.label}
          </span>
        ))}
      </div>
      {/* Confidence tags */}
      {(emailConf || phoneConf) && (
        <div className="flex items-center gap-1">
          {emailConf && (
            <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${emailConf >= 80 ? 'bg-success/10 text-success' : emailConf >= 60 ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
              ✉ {emailConf}%
            </span>
          )}
          {phoneConf && (
            <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${phoneConf >= 80 ? 'bg-success/10 text-success' : phoneConf >= 60 ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
              ☎ {phoneConf}%
            </span>
          )}
        </div>
      )}
      {/* Last enriched */}
      {lastEnriched && (
        <span className="text-[9px] text-muted-foreground">Updated {lastEnriched}</span>
      )}
    </div>
  );
}

interface StageDropdownProps {
  id: string;
  currentStage: LeadStage;
  onSelect: (stage: LeadStage) => void;
}

const StageDropdown = memo(function StageDropdown({ id, currentStage, onSelect }: StageDropdownProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer min-h-[44px] flex items-center"
        aria-label="Change stage"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <StageBadge stage={currentStage} size="sm" />
      </button>
      {open && (
        <div
          className="absolute z-30 left-0 top-full mt-1 w-40 bg-card border border-border rounded-lg shadow-xl fade-in overflow-hidden"
          role="listbox"
        >
          {stageOrder.map((stage) => (
            <button
              key={`stage-dd-${id}-${stage}`}
              role="option"
              aria-selected={stage === currentStage}
              onClick={() => {
                onSelect(stage);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-3 text-xs hover:bg-muted transition-colors duration-100 ${stage === currentStage ? 'bg-muted/60 font-semibold' : ''}`}
            >
              {stage}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

const columns: { key: keyof Lead | 'actions' | 'owner' | 'enrichment'; label: string; sortable: boolean; width: number }[] = [
  { key: 'address', label: 'Address', sortable: true, width: 220 },
  { key: 'beds', label: 'Beds/Ba', sortable: true, width: 70 },
  { key: 'price', label: 'Price/mo', sortable: true, width: 90 },
  { key: 'source', label: 'Source', sortable: true, width: 100 },
  { key: 'stage', label: 'Stage', sortable: false, width: 130 },
  { key: 'owner', label: 'Owner', sortable: false, width: 110 },
  { key: 'enrichment', label: 'Enrichment', sortable: false, width: 155 },
  { key: 'regulationStatus', label: 'Regulation', sortable: false, width: 120 },
  { key: 'prospectScore', label: 'Score', sortable: true, width: 110 },
  { key: 'daysOnMarket', label: 'DOM', sortable: true, width: 60 },
  { key: 'createdAt', label: 'Imported', sortable: true, width: 110 },
  { key: 'lastChecked', label: 'Last Checked', sortable: true, width: 100 },
  { key: 'actions', label: '', sortable: false, width: 120 },
];

const ROW_HEIGHT = 60;

interface RowData {
  leads: Lead[];
  selectedIds: Set<string>;
  onSelectOne: (id: string, checked: boolean) => void;
  onStageChange: (id: string, stage: LeadStage) => void;
  onDelete: (id: string) => void;
  onOpenEstimator: (lead: Lead) => void;
  onRefresh: (id: string) => void;
  onShowRegulation: (city: string) => void;
  onOpenDetail: (lead: Lead) => void;
  onConfirmDelete: (id: string) => void;
  canActOnLead: (lead: Lead) => boolean;
  assignmentMap: Record<string, string>;
  enrichmentMap: Record<string, EnrichmentStatus>;
  onSendSMS?: (lead: Lead) => void;
}

const LeadRow = memo(function LeadRow({
  index,
  style,
  data,
}: {
  index: number;
  style: React.CSSProperties;
  data: RowData;
}) {
  const { leads, selectedIds, onSelectOne, onStageChange, onOpenEstimator, onRefresh, onShowRegulation, onOpenDetail, onConfirmDelete, canActOnLead, assignmentMap, enrichmentMap, onSendSMS } = data;
  const lead = leads[index];
  if (!lead) return null;

  const canAct = canActOnLead(lead);

  return (
    <div
      style={style}
      className={`flex items-center border-b border-border hover:bg-muted/40 transition-colors duration-100 cursor-pointer ${index % 2 === 1 ? 'bg-muted/10' : 'bg-card'} ${selectedIds.has(lead.id) ? '!bg-primary/5' : ''} ${!canAct ? 'opacity-70' : ''}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('input[type="checkbox"]') || target.closest('button') || target.closest('a')) return;
        onOpenDetail(lead);
      }}
    >
      {/* Checkbox */}
      <div className="px-3 w-10 shrink-0">
        <input
          type="checkbox"
          checked={selectedIds.has(lead.id)}
          onChange={(e) => onSelectOne(lead.id, e.target.checked)}
          disabled={!canAct}
          className="rounded border-border accent-primary w-5 h-5 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={`Select ${lead.address}`}
        />
      </div>

      {/* Address */}
      <div className="px-3 shrink-0" style={{ width: 220 }}>
        <div className="min-w-0">
          {(() => {
            const { display, isIncomplete } = getAddressDisplayValue(lead.address);
            return (
              <>
                <div className="flex items-center gap-1 flex-wrap">
                  {isIncomplete && <AlertTriangle size={10} className="text-amber-500 shrink-0" title="Address incomplete — listing ID detected" />}
                  {!canAct && (
                    <span title="Assigned to another agent" className="shrink-0">
                      <svg className="w-2.5 h-2.5 text-muted-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </span>
                  )}
                  <p className={`font-medium text-xs truncate ${isIncomplete ? 'text-amber-600' : 'text-foreground'}`}>{display}</p>
                  {(lead as any).isSynthetic && (
                    <span className="shrink-0 inline-flex items-center px-1 py-0 rounded text-[8px] font-semibold bg-amber-500/15 text-amber-600 border border-amber-500/20" title="Synthetic test data">
                      SYN
                    </span>
                  )}
                  {/* Manual verified import badge */}
                  {((lead as any).is_verified_lead || (lead as any).source_type === 'MANUAL_VERIFIED_IMPORT' || (lead.tags || []).includes('MANUAL_VERIFIED_IMPORT')) && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0 rounded text-[8px] font-semibold bg-purple-500/10 text-purple-600 border border-purple-500/20" title="Manually verified import">
                      ✓ VERIFIED
                    </span>
                  )}
                  {/* Phone badge */}
                  {((lead as any).has_phone || (lead as any).verified_number || lead.contactPhone) && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0 rounded text-[8px] font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20" title="Phone number available">
                      📞 PHONE
                    </span>
                  )}
                  {/* Priority tier badge */}
                  {(lead as any).priority_tier === 1 && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0 rounded text-[8px] font-semibold bg-orange-500/10 text-orange-600 border border-orange-500/20" title="Tier 1 — Verified Owner + Address + Phone">
                      🔥 HIGH
                    </span>
                  )}
                  {/* Property Verification badge */}
                  {(lead as any).verificationStatus === 'VERIFIED' && ((lead as any).verificationScore ?? 0) >= 75 ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0 rounded text-[8px] font-semibold bg-green-500/12 text-green-600 border border-green-500/25"
                      title={`Verified property — Score: ${(lead as any).verificationScore ?? 0}/100`}
                    >
                      <CheckCircle2 size={7} />
                      ADDR ✓
                    </span>
                  ) : null}
                </div>
                <p className="text-[10px] text-muted-foreground">{lead.city}, {lead.state} {lead.zip}</p>
              </>
            );
          })()}
          {lead.listingUrl ? (
            <a
              href={getPropertyListingUrl(lead.listingUrl, lead.address, lead.city, lead.state, lead.zip, lead.source)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline mt-0.5"
              aria-label={`View listing for ${lead.address}`}
            >
              <ExternalLink size={9} />
              View on {lead.source}
            </a>
          ) : (
            <a
              href={getPropertyListingUrl(lead.listingUrl, lead.address, lead.city, lead.state, lead.zip, lead.source)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline mt-0.5"
              aria-label={`Search listing for ${lead.address}`}
            >
              <ExternalLink size={9} />
              Search on {lead.source}
            </a>
          )}
        </div>
      </div>

      {/* Beds/Baths */}
      <div className="px-3 shrink-0" style={{ width: 70 }}>
        <span className="font-mono-data text-xs text-foreground">{lead.beds}bd/{lead.baths}ba</span>
      </div>

      {/* Price */}
      <div className="px-3 shrink-0" style={{ width: 90 }}>
        <span className="font-mono-data text-xs text-foreground">{formatCurrency(lead.price)}</span>
        <p className="text-[10px] text-muted-foreground">/mo</p>
      </div>

      {/* Source */}
      <div className="px-3 shrink-0" style={{ width: 100 }}>
        <span className="text-xs text-muted-foreground truncate block">{lead.source}</span>
      </div>

      {/* Stage */}
      <div className="px-3 shrink-0" style={{ width: 130 }}>
        {canAct ? (
          <StageDropdown id={lead.id} currentStage={lead.stage} onSelect={(stage) => onStageChange(lead.id, stage)} />
        ) : (
          <StageBadge stage={lead.stage} size="sm" />
        )}
      </div>

      {/* Owner / Assignment */}
      <div className="px-3 shrink-0" style={{ width: 110 }}>
        {assignmentMap[lead.id] ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-500 truncate max-w-full">
            {assignmentMap[lead.id]}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
            Unassigned
          </span>
        )}
      </div>

      {/* Enrichment Status */}
      <div className="px-3 shrink-0" style={{ width: 155 }}>
        <EnrichmentStatusCell status={enrichmentMap[lead.id]} />
      </div>

      {/* Regulation */}
      <div className="px-3 shrink-0" style={{ width: 120 }}>
        <div className="flex items-center gap-1">
          <RegulationBadge status={lead.regulationStatus} size="sm" />
          <button
            onClick={() => onShowRegulation(lead.city)}
            className="text-muted-foreground hover:text-primary transition-colors p-1 min-h-[44px] flex items-center"
            title={`View ${lead.city} STR regulations`}
          >
            <Info size={11} />
          </button>
        </div>
      </div>

      {/* Score */}
      <div className="px-3 shrink-0" style={{ width: 110 }}>
        <ProspectScoreBar score={lead.prospectScore} />
        <div className="mt-1">
          <ConfidenceBandBadge score={lead.prospectScore} size="sm" />
        </div>
      </div>

      {/* DOM */}
      <div className="px-3 shrink-0" style={{ width: 60 }}>
        <span className={`font-mono-data text-xs ${lead.daysOnMarket > 30 ? 'text-warning' : 'text-foreground'}`}>
          {lead.daysOnMarket}d
        </span>
      </div>

      {/* Import Timestamp */}
      <div className="px-3 shrink-0" style={{ width: 110 }}>
        <div className="flex items-center gap-1">
          <Clock size={9} className="text-muted-foreground shrink-0" />
          <span className="font-mono-data text-[10px] text-muted-foreground">{lead.createdAt}</span>
        </div>
      </div>

      {/* Last Checked */}
      <div className="px-3 shrink-0" style={{ width: 100 }}>
        <span className="font-mono-data text-xs text-muted-foreground">{lead.lastChecked}</span>
      </div>

      {/* Actions */}
      <div className="px-3 shrink-0" style={{ width: 120 }}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => canAct && onSendSMS?.(lead)}
            disabled={!canAct}
            className="p-2 rounded text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 transition-all min-h-[44px] flex items-center disabled:opacity-30 disabled:cursor-not-allowed"
            title={canAct ? 'Send SMS' : 'Assigned to another agent'}
          >
            <MessageSquare size={12} />
          </button>
          <button
            onClick={() => canAct && onRefresh(lead.id)}
            disabled={!canAct}
            className="p-2 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-all min-h-[44px] flex items-center disabled:opacity-30 disabled:cursor-not-allowed"
            title={canAct ? 'Refresh listing data' : 'Assigned to another agent'}
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => canAct && onOpenEstimator(lead)}
            disabled={!canAct}
            className="p-2 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-all min-h-[44px] flex items-center disabled:opacity-30 disabled:cursor-not-allowed"
            title={canAct ? 'Revenue estimator' : 'Assigned to another agent'}
          >
            <BarChart2 size={12} />
          </button>
          <button
            onClick={() => canAct && onConfirmDelete(lead.id)}
            disabled={!canAct}
            className="p-2 rounded text-muted-foreground hover:text-danger hover:bg-danger-bg transition-all min-h-[44px] flex items-center disabled:opacity-30 disabled:cursor-not-allowed"
            title={canAct ? 'Delete lead' : 'Assigned to another agent'}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── Mobile Card View ─────────────────────────────────────────────────────────

const MobileLeadCard = memo(function MobileLeadCard({
  lead,
  selected,
  onSelect,
  onStageChange,
  onOpenEstimator,
  onRefresh,
  onShowRegulation,
  onOpenDetail,
  onConfirmDelete,
}: {
  lead: Lead;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onStageChange: (stage: LeadStage) => void;
  onOpenEstimator: () => void;
  onRefresh: () => void;
  onShowRegulation: () => void;
  onOpenDetail: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <div
      className={`bg-card border-b border-border px-4 py-4 ${selected ? 'bg-primary/5' : ''}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('input') || target.closest('button') || target.closest('a')) return;
        onOpenDetail();
      }}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="rounded border-border accent-primary w-5 h-5 mt-0.5 shrink-0"
          aria-label={`Select ${lead.address}`}
        />
        <div className="flex-1 min-w-0">
          {/* Address + Score */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{lead.address}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin size={10} className="text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground truncate">{lead.city}, {lead.state}</p>
              </div>
            </div>
            <div className="shrink-0">
              <ProspectScoreBar score={lead.prospectScore} />
            </div>
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <StageDropdown id={lead.id} currentStage={lead.stage} onSelect={onStageChange} />
            <div className="flex items-center gap-1">
              <RegulationBadge status={lead.regulationStatus} size="sm" />
              <button
                onClick={onShowRegulation}
                className="p-1 text-muted-foreground hover:text-primary transition-colors min-h-[44px] flex items-center"
              >
                <Info size={11} />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mb-3">
            <div>
              <p className="text-[10px] text-muted-foreground">Price</p>
              <p className="text-xs font-mono-data font-semibold text-foreground">{formatCurrency(lead.price)}/mo</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Beds/Ba</p>
              <p className="text-xs font-mono-data text-foreground">{lead.beds}bd/{lead.baths}ba</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">DOM</p>
              <p className={`text-xs font-mono-data ${lead.daysOnMarket > 30 ? 'text-warning' : 'text-foreground'}`}>
                {lead.daysOnMarket}d
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Source</p>
              <p className="text-xs text-muted-foreground">{lead.source}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Imported</p>
              <div className="flex items-center gap-0.5">
                <Clock size={8} className="text-muted-foreground" />
                <p className="text-[10px] font-mono-data text-muted-foreground">{lead.createdAt}</p>
              </div>
            </div>
          </div>

          {/* Footer: last checked + actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar size={9} />
              <span>{lead.lastChecked}</span>
            </div>
            <div className="flex items-center gap-1">
              {lead.listingUrl && (
                <a
                  href={getPropertyListingUrl(lead.listingUrl, lead.address, lead.city, lead.state, lead.zip, lead.source)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-all min-h-[44px] flex items-center"
                  aria-label="View listing"
                >
                  <ExternalLink size={13} />
                </a>
              )}
              <button
                onClick={onRefresh}
                className="p-2 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-all min-h-[44px] flex items-center"
                title="Refresh"
              >
                <RefreshCw size={13} />
              </button>
              <button
                onClick={onOpenEstimator}
                className="p-2 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-all min-h-[44px] flex items-center"
                title="Revenue estimator"
              >
                <BarChart2 size={13} />
              </button>
              <button
                onClick={onConfirmDelete}
                className="p-2 rounded text-muted-foreground hover:text-danger hover:bg-danger-bg transition-all min-h-[44px] flex items-center"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function LeadTable({
  leads,
  sortKey,
  sortDir,
  onSort,
  selectedIds,
  onSelectAll,
  onSelectOne,
  onStageChange,
  onDelete,
  onOpenEstimator,
  onRefresh,
  onShowRegulation,
  onOpenDetail,
  canActOnLead,
  assignmentMap,
  enrichmentMap,
  onSendSMS,
}: LeadTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleConfirmDelete = useCallback((id: string) => setDeletingId(id), []);

  const executeDelete = useCallback(() => {
    if (deletingId) {
      onDelete(deletingId);
      setDeletingId(null);
    }
  }, [deletingId, onDelete]);

  const allSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

  const defaultCanAct = useCallback(() => true, []);
  const resolvedCanActOnLead = canActOnLead ?? defaultCanAct;

  const itemData = useMemo<RowData>(() => ({
    leads,
    selectedIds,
    onSelectOne,
    onStageChange,
    onDelete,
    onOpenEstimator,
    onRefresh,
    onShowRegulation,
    onOpenDetail,
    onConfirmDelete: handleConfirmDelete,
    canActOnLead: resolvedCanActOnLead,
    assignmentMap: assignmentMap ?? {},
    enrichmentMap: enrichmentMap ?? {},
    onSendSMS,
  }), [leads, selectedIds, onSelectOne, onStageChange, onDelete, onOpenEstimator, onRefresh, onShowRegulation, onOpenDetail, handleConfirmDelete, resolvedCanActOnLead, assignmentMap, enrichmentMap, onSendSMS]);

  if (leads.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <BarChart2 size={22} className="text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold text-foreground">No leads match your filters</h3>
        <p className="text-sm text-muted-foreground mt-1 text-center max-w-xs">
          Try adjusting your filters or upload a new CSV to add more FRBO prospects.
        </p>
      </div>
    );
  }

  const totalWidth = 40 + columns.reduce((sum, c) => sum + c.width, 0);
  const listHeight = Math.min(leads.length * ROW_HEIGHT, 600);

  return (
    <>
      {/* ── Mobile Card View (< md) ── */}
      <div className="md:hidden bg-card rounded-xl border border-border overflow-hidden">
        {/* Mobile select-all header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="rounded border-border accent-primary w-5 h-5"
            aria-label="Select all leads"
          />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {leads.length} lead{leads.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
          {leads.map((lead) => (
            <MobileLeadCard
              key={lead.id}
              lead={lead}
              selected={selectedIds.has(lead.id)}
              onSelect={(checked) => onSelectOne(lead.id, checked)}
              onStageChange={(stage) => onStageChange(lead.id, stage)}
              onOpenEstimator={() => onOpenEstimator(lead)}
              onRefresh={() => onRefresh(lead.id)}
              onShowRegulation={() => onShowRegulation(lead.city)}
              onOpenDetail={() => onOpenDetail(lead)}
              onConfirmDelete={() => handleConfirmDelete(lead.id)}
            />
          ))}
        </div>
        <div className="px-4 py-2 border-t border-border bg-muted/20 text-[11px] text-muted-foreground">
          Showing {leads.length.toLocaleString()} lead{leads.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Desktop Table View (≥ md) ── */}
      <div className="hidden md:flex flex-1 overflow-x-auto scrollbar-thin bg-card rounded-xl border border-border flex-col">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border" style={{ minWidth: totalWidth }}>
          <div className="flex items-center">
            <div className="px-3 w-10 shrink-0">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="rounded border-border accent-primary"
                aria-label="Select all leads"
              />
            </div>
            {columns.map((col) => (
              <div
                key={`th-${col.key}`}
                style={{ width: col.width }}
                className={`px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap shrink-0 ${col.sortable ? 'cursor-pointer hover:text-foreground select-none' : ''} ${col.key === sortKey ? 'text-foreground' : ''}`}
                onClick={col.sortable ? () => onSort(col.key as keyof Lead) : undefined}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && (
                    <SortIcon col={col.key as keyof Lead} sortKey={sortKey} sortDir={sortDir} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Virtualized rows */}
        <List
          height={listHeight}
          itemCount={leads.length}
          itemSize={ROW_HEIGHT}
          width="100%"
          itemData={itemData}
          overscanCount={5}
        >
          {LeadRow}
        </List>

        {leads.length > 0 && (
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-[11px] text-muted-foreground">
            Showing {leads.length.toLocaleString()} lead{leads.length !== 1 ? 's' : ''} · Scroll to view all
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={() => setDeletingId(null)} />
          <div className="relative bg-card rounded-xl border border-border shadow-2xl p-6 max-w-sm w-full fade-in">
            <h3 className="text-base font-semibold text-foreground mb-2">Delete this lead?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              This will permanently remove the lead from your pipeline. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-3 text-sm font-medium border border-border rounded-md hover:bg-muted transition-all min-h-[48px]"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-3 text-sm font-semibold bg-danger text-white rounded-md hover:bg-danger/90 transition-all active:scale-95 min-h-[48px]"
              >
                Delete Lead
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}